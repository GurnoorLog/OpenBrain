'use strict'

// Shared graph-execution core for the OpenBrain cloud executor.
//
// Runs the exact same brain model as the in-browser engine: a topological
// pass over the graph, each node receiving inputs keyed by incoming edge
// port (inputs[targetPort] = sourceOutputs[sourcePort]), executed with the
// same canned fallbacks for non-LLM node types. The only difference is LLM
// nodes call Fireworks with a SERVER-SIDE key (env, never exposed to the
// browser) instead of the user's client key.
//
// Zero runtime dependencies — plain Node 18+ (global fetch, node:http).

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const DEFAULT_LLM_MODEL = 'accounts/fireworks/models/deepseek-v4-flash'

// --------------------------------------------------------------------------
// Real browser + RAG support (no canned placeholders)
// --------------------------------------------------------------------------

// The chat/CLI stamps the user's message onto node configurations; any node may
// carry it, so scan the whole graph to find the live question.
function findUserMessage(nodes) {
  for (const node of nodes) {
    const value = node && node.configuration && node.configuration.userMessage
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

function normalizeUrl(raw) {
  const trimmed = String(raw || '').trim()
  if (trimmed === '') return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function wikipediaExtractUrl(url) {
  const match = /^https?:\/\/([a-z]{2})\.wikipedia\.org\/wiki\/([^#?]+)/i.exec(url)
  if (!match) return null
  const title = decodeURIComponent(match[2]).replace(/_/g, ' ')
  if (title.trim() === '') return null
  const lang = match[1].toLowerCase()
  return `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&formatversion=2&origin=*&titles=${encodeURIComponent(
    title,
  )}`
}

async function fetchText(url, signal, onProgress) {
  const response = await fetch(url, {
    signal,
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 OpenBrainRuntime/1.0',
      Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`)
  if (typeof onProgress !== 'function' || !response.body) return response.text()
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let lastEmit = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
    if (text.length - lastEmit >= 8192) {
      lastEmit = text.length
      onProgress(text.length)
    }
  }
  text += decoder.decode()
  if (text.length - lastEmit > 0) onProgress(text.length)
  return text
}

function htmlToText(raw) {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

async function searchWikipediaTopic(topic, signal) {
  const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    topic,
  )}&srlimit=1&format=json&formatversion=2&origin=*`
  try {
    const raw = await fetchText(apiUrl, signal)
    const data = JSON.parse(raw)
    const title = data && data.query && data.query.search && data.query.search[0]
      ? data.query.search[0].title
      : null
    if (!title || title.trim() === '') return null
    return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.trim().replace(/ /g, '_'))}`
  } catch {
    return null
  }
}

// Real browser node: resolves the target URL (edge > config > user message >
// default), uses the MediaWiki plain-text API for Wikipedia articles, and
// strips HTML tags from any other page. Mirrors the dashboard BROWSER_TOOL.
// `onProgress(bytes)` is called as the body streams in.
async function fetchPage(url, signal, onProgress) {
  const wikiApiUrl = wikipediaExtractUrl(url)
  if (wikiApiUrl) {
    try {
      const raw = await fetchText(wikiApiUrl, signal, onProgress)
      const data = JSON.parse(raw)
      const extract = data && data.query && data.query.pages && data.query.pages[0]
        ? data.query.pages[0].extract ?? ''
        : ''
      const content = extract.replace(/\s+/g, ' ').trim()
      if (content !== '') return content.slice(0, 15000)
    } catch {
      /* fall through to the generic HTML path */
    }
  }
  return htmlToText(await fetchText(url, signal, onProgress)).slice(0, 12000)
}

// --------------------------------------------------------------------------
// Local fine-tune trainer (self-adaptive). Loaded lazily so the cloud-only
// service never needs the trainer file present.
// --------------------------------------------------------------------------
let localTrainerModule = null
let localTrainerLoadError = null
function loadLocalTrainer() {
  if (localTrainerModule !== null || localTrainerLoadError !== null) {
    return { trainer: localTrainerModule, error: localTrainerLoadError }
  }
  const candidates = [
    path.join(__dirname, 'train-local.js'),
    path.join(__dirname, '..', 'runtime', 'train-local.js'),
    path.join(__dirname, '..', '..', 'runtime', 'train-local.js'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        localTrainerModule = require(candidate)
        return { trainer: localTrainerModule, error: null }
      } catch (error) {
        localTrainerLoadError = error instanceof Error ? error.message : String(error)
        return { trainer: null, error: localTrainerLoadError }
      }
    }
  }
  localTrainerLoadError = 'train-local.js not found (OpenBrain repo checkout required for local fine-tuning).'
  return { trainer: null, error: localTrainerLoadError }
}

function pickFinetuneGoal(config, inputs, userMessage) {
  if (typeof config.goal === 'string' && config.goal.trim() !== '') return config.goal.trim()
  if (typeof config.spec?.goal === 'string' && config.spec.goal.trim() !== '') return config.spec.goal.trim()
  if (typeof inputs.goal === 'string' && inputs.goal.trim() !== '') return inputs.goal.trim()
  return userMessage || 'a domain-specific task'
}

function pickFinetuneSpec(config, inputs, userMessage) {
  const explicit = config.spec && typeof config.spec === 'object' ? config.spec : null
  return {
    goal: pickFinetuneGoal(config, inputs, userMessage),
    baseModel: explicit?.baseModel || config.baseModel || '',
    dataset: explicit?.dataset || config.dataset || '',
    method: explicit?.method || config.method || 'lora',
    trainingType: explicit?.trainingType || config.trainingType || 'sft',
    hyperparameters: explicit?.hyperparameters || config.hyperparameters || {
      epochs: 2,
      learningRate: 1e-4,
      rank: 8,
      batchSize: 4,
    },
  }
}

const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.json', '.csv', '.tsv', '.html', '.htm'])

async function walkFiles(dir) {
  const out = []
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walkFiles(full)))
    else if (entry.isFile()) out.push(full)
  }
  return out
}

// Real RAG node: keyword retrieval over a local knowledge base directory.
// Points to `knowledgeDir` (or $OPENBRAIN_KNOWLEDGE_DIR / $KNOWLEDGE_DIR /
// <cwd>/knowledge). Files are scored by query-token frequency; the top matches
// are returned verbatim so the LLM can cite them. No embeddings dependency.
async function retrieveKnowledge(query, knowledgeDir, pushLog, nodeId, onEvent) {
  const dir =
    knowledgeDir ||
    process.env.OPENBRAIN_KNOWLEDGE_DIR ||
    process.env.KNOWLEDGE_DIR ||
    ''
  if (!dir) {
    pushLog('RAG: no knowledge base configured.', 'warning', nodeId)
    return { documents: [], sources: [] }
  }
  if (!fs.existsSync(dir)) {
    pushLog(`RAG: knowledge base not found at ${dir}.`, 'warning', nodeId)
    return { documents: [], sources: [] }
  }
  const files = (await walkFiles(dir)).filter((file) =>
    TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()),
  )
  if (files.length === 0) {
    pushLog(`RAG: no readable documents in ${dir}.`, 'warning', nodeId)
    return { documents: [], sources: [] }
  }
  if (typeof onEvent === 'function') {
    onEvent({ kind: 'rag-scan', nodeId, query: String(query || ''), total: files.length, dir })
  }
  const tokens = new Set(
    String(query || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length > 2),
  )
  const ranked = []
  let scanned = 0
  for (const file of files) {
    const raw = await fsp.readFile(file, 'utf8').catch(() => '')
    scanned += 1
    if (typeof onEvent === 'function') {
      onEvent({ kind: 'rag-progress', nodeId, file: path.relative(dir, file), scanned, total: files.length })
    }
    if (raw.trim() === '') continue
    const lower = raw.toLowerCase()
    let score = 0
    if (tokens.size > 0) {
      for (const token of tokens) {
        let index = -1
        while ((index = lower.indexOf(token, index + 1)) !== -1) score += 1
      }
    } else {
      score = 1
    }
    if (score > 0) ranked.push({ file, score, raw })
  }
  ranked.sort((a, b) => b.score - a.score)
  const top = ranked.slice(0, 3)
  const documents = top.map((entry) => {
    const name = path.relative(dir, entry.file)
    const content = entry.raw.replace(/\s+/g, ' ').trim().slice(0, 6000)
    return `[${name}]\n${content}`
  })
  const sources = top.map((entry) => path.relative(dir, entry.file))
  if (typeof onEvent === 'function') {
    onEvent({ kind: 'rag-done', nodeId, count: documents.length, sources })
  }
  pushLog(
    `RAG: retrieved ${documents.length} document(s) for "${String(query || '').slice(0, 60)}".`,
    'success',
    nodeId,
  )
  return { documents, sources }
}

async function runFireworks(messages, { model, temperature = 0.7, maxTokens = 800, signal, onToken }) {
  const apiKey = process.env.FIREWORKS_API_KEY
  if (!apiKey) {
    throw new Error('FIREWORKS_API_KEY is not set on the cloud executor.')
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120000)
  const onSignalAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) throw new Error('Request aborted by client.')
    signal.addEventListener('abort', onSignalAbort, { once: true })
  }
  try {
    const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: onToken ? true : undefined,
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Fireworks API ${response.status}: ${detail.slice(0, 300)}`)
    }

    // Streaming (SSE) path — emit each token delta via onToken, accumulate the
    // full text, and return it. Used by the TUI for a live typing effect.
    if (onToken) {
      if (!response.body) {
        throw new Error('Fireworks stream returned no body.')
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''
        for (const event of events) {
          for (const line of event.split('\n')) {
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (payload === '[DONE]') continue
            try {
              const parsed = JSON.parse(payload)
              const delta = parsed.choices?.[0]?.delta?.content
              if (typeof delta === 'string' && delta !== '') {
                full += delta
                onToken(delta)
              }
            } catch {
              // ignore malformed keep-alive events
            }
          }
        }
      }
      if (full.trim() === '') {
        throw new Error('Fireworks returned an empty completion.')
      }
      return full
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error('Fireworks returned an empty completion.')
    }
    return content
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', onSignalAbort)
  }
}

// --------------------------------------------------------------------------
// Curated skills (SKILL.md) as server-side sub-brains
// --------------------------------------------------------------------------

// The skills dir resolves the runtime container layout (/app/skills) or the
// repo layout (<repo>/skills). Overridable via $SKILLS_DIR.
function skillInstructionsDir() {
  const candidates = [
    process.env.SKILLS_DIR || '',
    path.join(__dirname, 'skills'),
    path.join(__dirname, '..', 'skills'),
  ]
  for (const candidate of candidates) {
    if (candidate !== '' && fs.existsSync(candidate)) return candidate
  }
  return ''
}

// Reads <skill>/SKILL.md, strips the YAML frontmatter, and returns the body as
// the system prompt for a worker sub-brain's llm node. Returns null when the
// skill (or the skills dir) is missing.
function loadSkillInstructions(skillRef) {
  const dir = skillInstructionsDir()
  if (dir === '') return null
  const safeRef = String(skillRef).replace(/[^a-z0-9-_]/gi, '-').toLowerCase()
  for (const fileName of ['SKILL.md', 'skill.md']) {
    const candidate = path.join(dir, safeRef, fileName)
    if (!fs.existsSync(candidate)) continue
    const raw = fs.readFileSync(candidate, 'utf8')
    const frontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(raw)
    const body = frontmatter ? raw.slice(frontmatter[0].length) : raw
    return body.replace(/\s+/g, ' ').trim()
  }
  return null
}

function llmContext(inputs) {
  const parts = []
  for (const value of Object.values(inputs)) {
    if (typeof value === 'string') parts.push(value)
    else if (typeof value === 'number') parts.push(String(value))
    else if (Array.isArray(value)) {
      parts.push(value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n'))
    }
  }
  parts.sort((a, b) => b.length - a.length)
  return parts[0] ?? ''
}

function firstValue(inputs) {
  for (const value of Object.values(inputs)) {
    if (typeof value === 'string' || typeof value === 'number') return String(value)
  }
  return ''
}

// Resolves a node's tool spec against the native MCP client. Accepts either
// config.mcpServer + config.tool, or a single config.tool of the form
// "server/tool" (or "server.tool"). Edge-fed input ports (owner, repo,
// username, query, path, …) merge into arguments unless already set.
function resolveMcpTarget(config, inputs) {
  const raw = typeof config.tool === 'string' && config.tool.trim() !== '' ? config.tool.trim() : ''
  let server =
    typeof config.mcpServer === 'string' && config.mcpServer.trim() !== '' ? config.mcpServer.trim() : ''
  let tool = raw
  if (server === '') {
    const slash = raw.lastIndexOf('/')
    const dot = raw.lastIndexOf('.')
    const separator = Math.max(slash, dot)
    if (separator > 0) {
      server = raw.slice(0, separator)
      tool = raw.slice(separator + 1)
    }
  }
  const args = {
    ...(config.arguments && typeof config.arguments === 'object' ? config.arguments : {}),
  }
  for (const key of ['owner', 'repo', 'username', 'query', 'q', 'issue_number', 'pr_number', 'path', 'content']) {
    if (args[key] === undefined && typeof inputs[key] === 'string' && inputs[key].trim() !== '') {
      args[key] = inputs[key].trim()
    }
  }
  return { server, tool, args }
}

// Calls a tool on the injected native MCP manager. Returns an { ok, ... }
// object that becomes the node's outputs; failures resolve gracefully (the
// node is marked failed by the caller) instead of killing the whole run.
async function runMcpTool(mcp, server, tool, args, pushLog, nodeId) {
  if (!mcp) {
    pushLog(
      `MCP ${server ? server + '/' : ''}${tool} skipped — no MCP servers configured. Add an mcp.json.`,
      'warning',
      nodeId,
    )
    return { ok: false, result: 'No MCP client configured on this service.' }
  }
  pushLog(`MCP ${server ? server + '/' : ''}${tool}…`, 'info', nodeId)
  try {
    if (server === '') {
      for (const name of mcp.serverNames()) {
        const tools = await mcp.listTools(name)
        if (tools.some((candidate) => candidate.name === tool)) {
          server = name
          break
        }
      }
      if (server === '') {
        const names = mcp.serverNames().join(', ') || 'none'
        pushLog(`${tool} not found on any configured MCP server.`, 'error', nodeId)
        return { ok: false, result: `Tool "${tool}" is not exposed by any configured MCP server (${names}).` }
      }
    }
    const outcome = await mcp.call(server, tool, args)
    if (outcome.ok) pushLog(`${server}/${tool} completed.`, 'success', nodeId)
    else pushLog(`${server}/${tool} failed: ${String(outcome.result).slice(0, 200)}`, 'error', nodeId)
    return outcome
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    pushLog(`${server}/${tool} failed: ${message}`, 'error', nodeId)
    return { ok: false, result: message }
  }
}

function computeOrder(nodes, connections) {
  const indegree = new Map(nodes.map((node) => [node.id, 0]))
  const incoming = new Map(nodes.map((node) => [node.id, []]))
  const outgoing = new Map(nodes.map((node) => [node.id, []]))
  for (const edge of connections) {
    if (!incoming.has(edge.to) || !outgoing.has(edge.from)) continue
    incoming.get(edge.to).push(edge)
    outgoing.get(edge.from).push(edge)
    indegree.set(edge.to, indegree.get(edge.to) + 1)
  }
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id)
  const order = []
  while (queue.length > 0) {
    const id = queue.shift()
    order.push(id)
    for (const edge of outgoing.get(id) ?? []) {
      indegree.set(edge.to, indegree.get(edge.to) - 1)
      if (indegree.get(edge.to) === 0) queue.push(edge.to)
    }
  }
  if (order.length !== nodes.length) {
    throw new Error('Brain graph contains a cycle — cannot run in the cloud.')
  }
  return order
}

function collectInputs(nodeId, connections, outputs) {
  const inputs = {}
  for (const edge of connections) {
    if (edge.to !== nodeId) continue
    const sourceOutputs = outputs[edge.from]
    if (!sourceOutputs) continue
    const value = sourceOutputs[edge.fromPort]
    if (value !== undefined) inputs[edge.toPort] = value
  }
  return inputs
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Executes a brain graph. `nodes` and `connections` use the store shape
// (BrainNodeSpec / Connection: id, type, x, y, content, reason, model, from,
// fromPort, to, toPort). Returns resolved node outputs keyed by node id plus
// a run log. Pass `onLog` to stream each log entry as it happens (used by the
// TUI for live node-by-node progress); it's optional and the full `log` array
// is always returned too.
async function executeBrain({ nodes, connections, memory, mcp, onLog, onToken, onEvent, knowledgeDir, resolveWorker }) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('Brain is empty — nothing to run in the cloud.')
  }
  const edges = (Array.isArray(connections) ? connections : []).filter(
    (edge) => edge && edge.id && edge.from && edge.to,
  )
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const order = computeOrder(nodes, edges)
  const outputs = {}
  const log = []
  const startedAtMs = Date.now()
  const userMessage = findUserMessage(nodes)

  const emit = (event) => {
    if (typeof onEvent === 'function') onEvent(event)
  }

  const pushLog = (message, level = 'info', nodeId) => {
    const entry = { message, level, nodeId: nodeId ?? null, time: new Date().toISOString() }
    log.push(entry)
    if (typeof onLog === 'function') onLog(entry)
  }

  for (const nodeId of order) {
    const node = byId.get(nodeId)
    if (!node) continue
    const inputs = collectInputs(nodeId, edges, outputs)
    // Client nodes carry content/reason/model at the top level; the domain
    // brain puts them under `configuration`. Read both so cloud runs use the
    // architect's real node content instead of the canned scaffold fallbacks.
    const config = { ...(node.configuration ?? {}), ...(node.content !== undefined ? { content: node.content } : {}), ...(node.model !== undefined ? { model: node.model } : {}) }

    emit({ kind: 'node-start', nodeId, nodeType: node.type })
    let result
    switch (node.type) {
      case 'llm': {
        pushLog('Cloud LLM querying the model server.', 'info', nodeId)
        // The chat/CLI stamps the user's message onto configuration.userMessage
        // (mirrors the browser engine). Combined with edge-fed context so both
        // graph-inputs and interactive agents can drive the same node.
        const userMessage =
          typeof config.userMessage === 'string' && config.userMessage.trim() !== ''
            ? config.userMessage.trim()
            : ''
        const prompt = [llmContext(inputs), userMessage].filter(Boolean).join('\n\n') || 'Respond briefly.'
        const memoryNote =
          typeof inputs.history === 'string' && inputs.history.trim() !== ''
            ? `\n\n(From memory — prior runs of this brain:\n${inputs.history.trim()})`
            : ''
        const model = typeof config.model === 'string' && config.model !== '' ? config.model : (process.env.CLOUD_LLM_MODEL || DEFAULT_LLM_MODEL)
        const instructions =
          typeof config.instructions === 'string' && config.instructions.trim() !== ''
            ? config.instructions.trim()
            : ''
        const response = await runFireworks(
          [
            ...(instructions !== '' ? [{ role: 'system', content: instructions }] : []),
            { role: 'user', content: `${prompt}${memoryNote}` },
          ],
          {
            model,
            temperature: typeof config.temperature === 'number' ? config.temperature : 0.7,
            maxTokens: typeof config.maxTokens === 'number' ? config.maxTokens : 2048,
            signal: node._signal,
            onToken,
          },
        )
        pushLog(`Cloud LLM answered (${model}).`, 'success', nodeId)
        result = { response, model }
        break
      }

      case 'memory': {
        const current = inputs.value
        const currentText =
          typeof current === 'string' ? current : current === undefined ? '' : JSON.stringify(current)
        const historyText =
          typeof memory === 'string' && memory.trim() !== ''
            ? `${memory.trim()}\n${currentText}`.trim()
            : currentText
        pushLog('Cloud memory merged run context.', 'info', nodeId)
        result = { stored: historyText, history: historyText, previousCount: 0 }
        break
      }

      case 'filesystem': {
        const content =
          typeof config.content === 'string' && config.content.trim() !== ''
            ? config.content
            : '# README\n\nProject scaffold initialized (cloud run).'
        pushLog('Filesystem read node content.', 'info', nodeId)
        result = { content }
        break
      }

      case 'start':
      case 'trigger':
        pushLog('Trigger fired.', 'info', nodeId)
        result = { signal: 'go' }
        break

      case 'output':
        pushLog('Output delivered.', 'success', nodeId)
        result = inputs.result === undefined ? {} : { result: inputs.result }
        break

      case 'local':
        pushLog('Local Model nodes run in the browser — skipped in cloud run.', 'warning', nodeId)
        result = { response: llmContext(inputs), modelId: null, error: 'local-only' }
        break

      case 'planner':
        pushLog('Planner decomposed the task.', 'info', nodeId)
        result = { plan: ['Gather information', 'Analyze inputs', 'Synthesize result', 'Deliver output'] }
        break

      case 'browser': {
        const configUrl =
          typeof config.url === 'string' && config.url.trim() !== '' ? config.url.trim() : ''
        const configContent =
          typeof config.content === 'string' && config.content.trim() !== '' ? config.content.trim() : ''
        const edgeUrl = typeof inputs.url === 'string' ? inputs.url.trim() : ''
        let url
        if (edgeUrl !== '') url = edgeUrl
        else if (configUrl !== '') url = configUrl
        else if (configContent !== '') url = configContent
        else if (userMessage !== '') {
          const derived = await searchWikipediaTopic(userMessage, node._signal)
          url = derived ?? 'https://en.wikipedia.org/wiki/Artificial_intelligence'
          if (derived !== null) {
            pushLog(`Browser: no URL set — searched Wikipedia for "${userMessage}" → ${derived}`, 'info', nodeId)
          }
        } else {
          url = 'https://en.wikipedia.org/wiki/Artificial_intelligence'
        }
        url = normalizeUrl(url)
        emit({ kind: 'browser-fetch', nodeId, url })
        pushLog(`Browser: fetching ${url}…`, 'info', nodeId)
        try {
          const content = await fetchPage(url, node._signal, (bytes) => {
            emit({ kind: 'browser-progress', nodeId, url, bytes })
          })
          emit({ kind: 'browser-done', nodeId, url, chars: content.length })
          pushLog(`Browser: fetched ${content.length} chars from ${url}.`, 'success', nodeId)
          result = { pages: [{ url, content }], content, url }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          emit({ kind: 'browser-error', nodeId, url, error: message })
          pushLog(`Browser: failed to fetch ${url} — ${message}`, 'error', nodeId)
          result = { pages: [], content: '', url, error: message }
        }
        break
      }

      case 'github': {
        const target = resolveMcpTarget(
          { ...config, mcpServer: config.mcpServer || 'github', tool: config.tool || 'list_repositories' },
          inputs,
        )
        result = await runMcpTool(mcp, target.server, target.tool, target.args, pushLog, nodeId)
        break
      }

      case 'tool':
      case 'mcp': {
        const target = resolveMcpTarget(config, inputs)
        result = await runMcpTool(mcp, target.server, target.tool, target.args, pushLog, nodeId)
        break
      }

      case 'rag': {
        const configQuery =
          typeof config.query === 'string' && config.query.trim() !== ''
            ? config.query.trim()
            : ''
        const query = configQuery || firstValue(inputs) || userMessage || 'context'
        result = await retrieveKnowledge(query, knowledgeDir, pushLog, nodeId, emit)
        break
      }

      case 'python':
        pushLog('Python executed script in the cloud.', 'info', nodeId)
        result = { result: `Executed ${(firstValue(inputs) || 'print("ok")').length} chars → "ok"` }
        break

      case 'agent':
        pushLog(`Agent delegated: ${firstValue(inputs) || 'the task'}`, 'info', nodeId)
        result = { result: `Sub-agent reported back on "${firstValue(inputs) || 'the task'}"` }
        break

      case 'finetune': {
        const { trainer, error } = loadLocalTrainer()
        if (!trainer) {
          pushLog(`Local fine-tune unavailable: ${error || 'trainer not found'}`, 'warning', nodeId)
          result = {
            model: null,
            error: `Local fine-tuning needs the OpenBrain repo + Python (torch/peft). ${error || ''}`,
            status: 'unavailable',
          }
          break
        }
        const goal = pickFinetuneGoal(config, inputs, userMessage)
        const spec = pickFinetuneSpec(config, inputs, userMessage)
        const jobId =
          typeof config.jobId === 'string' && config.jobId.trim() !== ''
            ? config.jobId.trim()
            : `ft-${Date.now().toString(36)}`
        const workspaceDir =
          process.env.WORKSPACE_DIR || path.join(process.env.CLOUD_EXECUTOR_CWD || process.cwd(), 'workspace')
        const jobDir = path.join(workspaceDir, 'finetunes', jobId)
        fsp.mkdir(jobDir, { recursive: true }).catch(() => {})
        pushLog(`Local fine-tune starting (job ${jobId}) — goal: ${goal}`, 'info', nodeId)
        try {
          const outcome = await trainer.runLocalFineTune({
            spec,
            jobDir,
            maxSteps: typeof config.maxSteps === 'number' ? config.maxSteps : 0,
            onLog: (entry) => pushLog(entry.message, entry.level || 'info', nodeId),
            onProgress: (state) => {
              if (state.type === 'progress') {
                emit({ kind: 'finetune-progress', nodeId, step: state.step, loss: state.loss })
              } else if (state.type === 'probe') {
                emit({ kind: 'finetune-probe', nodeId, system: state.system })
              }
            },
          })
          pushLog(`Fine-tune complete: adapter at ${outcome.adapter}`, 'success', nodeId)
          result = {
            model: outcome.adapter,
            baseModel: outcome.result?.baseModel || spec.baseModel,
            method: outcome.result?.method || spec.method,
            trainer: outcome.result?.trainer || 'local',
            samples: outcome.result?.samples ?? 0,
            loss: outcome.result?.loss ?? null,
            elapsedSeconds: outcome.result?.elapsedSeconds ?? null,
            jobId,
            adapter: outcome.adapter,
            status: 'completed',
            system: outcome.result?.system ?? null,
            datasetSource: outcome.result?.datasetSource ?? null,
          }
        } catch (runError) {
          const message = runError instanceof Error ? runError.message : String(runError)
          pushLog(`Fine-tune failed: ${message}`, 'error', nodeId)
          result = { model: null, jobId, error: message, status: 'failed' }
        }
        break
      }

      case 'gate':
        pushLog(inputs.condition === false ? 'Gate blocked.' : 'Gate passed.', 'info', nodeId)
        result = { passed: inputs.condition !== false }
        break

      case 'subbrain':
        pushLog('Sub-brain invoked.', 'info', nodeId)
        result = { result: { nested: true, status: 'ok' } }
        break

      case 'worker': {
        const brainRef =
          typeof config.brain === 'string' && config.brain.trim() !== ''
            ? config.brain.trim()
            : ''
        if (brainRef === '') {
          pushLog('Worker: no configuration.brain set.', 'warning', nodeId)
          result = { result: null, error: 'Worker node needs configuration.brain.' }
          break
        }
        const seedInput = config.input !== undefined ? config.input : inputs.input
        // 1) The caller may resolve saved brains (registry / project store).
        let subBrain = null
        if (typeof resolveWorker === 'function') {
          subBrain = await resolveWorker(brainRef, { seedInput, pushLog, nodeId, signal: node._signal })
        }
        // 2) Fall back to curated skills (SKILL.md) bundled with the service.
        if (!subBrain) {
          const skillInstructions = loadSkillInstructions(brainRef)
          if (skillInstructions) {
            const skillId = String(brainRef).replace(/[^a-z0-9-]/gi, '-').toLowerCase()
            const llmId = `${skillId}-llm`
            const outputId = `${skillId}-output`
            subBrain = {
              name: brainRef,
              nodes: [
                {
                  id: llmId,
                  type: 'llm',
                  x: 0,
                  y: 0,
                  status: 'idle',
                  configuration: {
                    instructions: skillInstructions,
                    ...(seedInput !== undefined ? { userMessage: String(seedInput) } : {}),
                  },
                },
                { id: outputId, type: 'output', x: 300, y: 0, status: 'idle', configuration: {} },
              ],
              connections: [
                { id: `${llmId}-${outputId}`, from: llmId, fromPort: 'response', to: outputId, toPort: 'result' },
              ],
            }
          }
        }
        if (!subBrain) {
          pushLog(`Worker "${brainRef}" not found (no saved brain, no skill).`, 'warning', nodeId)
          result = {
            result: null,
            error: `Worker sub-brain "${brainRef}" was not found in saved projects or the skill library.`,
          }
          break
        }
        // Stamp the delegated input onto the sub-brain's first llm node so saved
        // registry/project brains receive the task exactly like the chat pill
        // does (skills already get it at construction above).
        if (seedInput !== undefined) {
          const subLlmIndex = (subBrain.nodes || []).findIndex((entry) => entry.type === 'llm')
          if (subLlmIndex !== -1) {
            subBrain = {
              ...subBrain,
              nodes: (subBrain.nodes || []).map((subNode, index) =>
                index !== subLlmIndex
                  ? subNode
                  : { ...subNode, configuration: { ...(subNode.configuration || {}), userMessage: String(seedInput) } },
              ),
            }
          }
        }
        pushLog(`Worker delegating to "${subBrain.name || brainRef}"…`, 'info', nodeId)
        try {
          const nested = await executeBrain({
            nodes: subBrain.nodes,
            connections: subBrain.connections || [],
            memory:
              seedInput !== undefined
                ? `${memory}\n${String(seedInput)}`.trim()
                : memory,
            mcp,
            knowledgeDir,
            resolveWorker,
            onLog: (entry) => pushLog(`[${subBrain.name || brainRef}] ${entry.message}`, entry.level, nodeId),
            onToken,
            onEvent,
          })
          const outputNode = (subBrain.nodes || []).find((entry) => entry.type === 'output')
          const value = outputNode ? (nested.outputs?.[outputNode.id]?.result ?? null) : null
          pushLog(
            `Worker "${subBrain.name || brainRef}" finished in ${nested.durationMs}ms.`,
            'success',
            nodeId,
          )
          result = value === null ? { result: { status: 'ok' } } : { result: value }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          pushLog(`Worker "${subBrain.name || brainRef}" failed: ${message}`, 'error', nodeId)
          result = { result: null, error: message }
        }
        break
      }

      default:
        await delay(150)
        pushLog('Node executed with canned output.', 'info', nodeId)
        result = { result: { processed: Object.keys(inputs), ok: true } }
    }

    outputs[nodeId] = result
    emit({ kind: 'node-done', nodeId, nodeType: node.type, hasOutput: result !== undefined && result !== null && Object.keys(result).length > 0 })
  }

  return {
    outputs,
    order,
    durationMs: Date.now() - startedAtMs,
    log,
  }
}

module.exports = { executeBrain, runFireworks, DEFAULT_LLM_MODEL }
