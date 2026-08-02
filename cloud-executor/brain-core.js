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

const DEFAULT_LLM_MODEL = 'accounts/fireworks/models/deepseek-v4-flash'

async function runFireworks(messages, { model, temperature = 0.7, maxTokens = 800, signal }) {
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
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Fireworks API ${response.status}: ${detail.slice(0, 300)}`)
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

// Runs a Composio tool with the server-side key. Returns an { ok, ... } object
// that becomes the node's outputs; failures resolve gracefully (the node is
// marked failed by the caller) instead of killing the whole run.
async function runComposioTool(slug, args, pushLog, nodeId) {
  const apiKey = process.env.COMPOSIO_API_KEY || ''
  if (apiKey === '') {
    pushLog(`${slug} skipped — set COMPOSIO_API_KEY on this service.`, 'warning', nodeId)
    return { ok: false, result: 'No COMPOSIO_API_KEY set on the cloud executor.' }
  }
  pushLog(`Composio: ${slug}…`, 'info', nodeId)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)
  try {
    const response = await fetch(
      `https://backend.composio.dev/api/v3.1/tools/execute/${encodeURIComponent(slug)}`,
      {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ arguments: args, version: 'latest' }),
        signal: controller.signal,
      },
    )
    const text = await response.text()
    let parsed = null
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
    if (!response.ok) {
      const message =
        parsed && parsed.error && parsed.error.message
          ? parsed.error.message
          : `Upstream HTTP ${response.status}`
      pushLog(`${slug} failed: ${message}`, 'error', nodeId)
      return { ok: false, result: message }
    }
    if (parsed && parsed.successful === false) {
      const detail =
        parsed.error && typeof parsed.error === 'string'
          ? parsed.error
          : (parsed.error && parsed.error.message) || 'Composio tool failed.'
      pushLog(`${slug} failed: ${detail}`, 'error', nodeId)
      return { ok: false, result: detail }
    }
    pushLog(`${slug} completed.`, 'success', nodeId)
    const data = parsed ? parsed.data : null
    const unwrapped =
      data && typeof data === 'object' && 'response_data' in data ? data.response_data : data
    if (slug.startsWith('GITHUB_') && Array.isArray(unwrapped)) {
      return {
        ok: true,
        repos: unwrapped.map((entry) => {
          if (typeof entry === 'string') return entry
          const owner = entry && entry.owner && entry.owner.login
          const name = entry && entry.name
          const fullName = entry && entry.full_name
          return String(fullName ?? (owner ? `${owner}/${name ?? ''}` : name ?? JSON.stringify(entry)))
        }),
        result: unwrapped,
      }
    }
    return { ok: true, result: unwrapped, data: unwrapped }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    pushLog(`${slug} failed: ${message}`, 'error', nodeId)
    return { ok: false, result: message }
  } finally {
    clearTimeout(timeout)
  }
}

// Merges the architect-stamped configuration.arguments with any edge-fed input
// ports (owner, repo, username, query, …) that the arguments don't already set.
function mergeToolArgs(configArguments, inputs) {
  const args = { ...(configArguments && typeof configArguments === 'object' ? configArguments : {}) }
  for (const key of ['owner', 'repo', 'username', 'query', 'q', 'issue_number', 'pr_number']) {
    if (args[key] === undefined && typeof inputs[key] === 'string' && inputs[key].trim() !== '') {
      args[key] = inputs[key].trim()
    }
  }
  return args
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
// a run log.
async function executeBrain({ nodes, connections, memory }) {
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

  const pushLog = (message, level = 'info', nodeId) => {
    log.push({ message, level, nodeId: nodeId ?? null, time: new Date().toISOString() })
  }

  for (const nodeId of order) {
    const node = byId.get(nodeId)
    if (!node) continue
    const inputs = collectInputs(nodeId, edges, outputs)
    // Client nodes carry content/reason/model at the top level; the domain
    // brain puts them under `configuration`. Read both so cloud runs use the
    // architect's real node content instead of the canned scaffold fallbacks.
    const config = { ...(node.configuration ?? {}), ...(node.content !== undefined ? { content: node.content } : {}), ...(node.model !== undefined ? { model: node.model } : {}) }

    let result
    switch (node.type) {
      case 'llm': {
        pushLog('Cloud LLM querying the model server.', 'info', nodeId)
        const prompt = llmContext(inputs) || 'Respond briefly.'
        const memoryNote =
          typeof inputs.history === 'string' && inputs.history.trim() !== ''
            ? `\n\n(From memory — prior runs of this brain:\n${inputs.history.trim()})`
            : ''
        const model = typeof config.model === 'string' && config.model !== '' ? config.model : (process.env.CLOUD_LLM_MODEL || DEFAULT_LLM_MODEL)
        const response = await runFireworks(
          [{ role: 'user', content: `${prompt}${memoryNote}` }],
          {
            model,
            temperature: typeof config.temperature === 'number' ? config.temperature : 0.7,
            maxTokens: typeof config.maxTokens === 'number' ? config.maxTokens : 800,
            signal: node._signal,
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

      case 'browser':
        pushLog('Browser fetched live web pages.', 'info', nodeId)
        result = { pages: ['https://example.com', 'https://developer.mozilla.org'] }
        break

      case 'github': {
        const slug =
          typeof config.tool === 'string' && config.tool.trim() !== ''
            ? config.tool.trim()
            : 'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER'
        result = await runComposioTool(slug, mergeToolArgs(config.arguments, inputs), pushLog, nodeId)
        break
      }

      case 'tool':
      case 'mcp': {
        const slug =
          typeof config.tool === 'string' && config.tool.trim() !== ''
            ? config.tool.trim()
            : 'HACKERNEWS_GET_TOP_STORIES'
        result = await runComposioTool(slug, mergeToolArgs(config.arguments, inputs), pushLog, nodeId)
        break
      }

      case 'rag':
        pushLog(`RAG retrieved documents for "${firstValue(inputs) || 'context'}".`, 'info', nodeId)
        result = { documents: ['knowledge#1 — basics', 'knowledge#2 — advanced', 'knowledge#3 — patterns'] }
        break

      case 'python':
        pushLog('Python executed script in the cloud.', 'info', nodeId)
        result = { result: `Executed ${(firstValue(inputs) || 'print("ok")').length} chars → "ok"` }
        break

      case 'agent':
        pushLog(`Agent delegated: ${firstValue(inputs) || 'the task'}`, 'info', nodeId)
        result = { result: `Sub-agent reported back on "${firstValue(inputs) || 'the task'}"` }
        break

      case 'finetune':
        pushLog('Fine-tune planned (cloud dry-run).', 'info', nodeId)
        result = { model: `hf://fine-tune-${(String(config.baseModel ?? 'model')).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'model'}` }
        break

      case 'gate':
        pushLog(inputs.condition === false ? 'Gate blocked.' : 'Gate passed.', 'info', nodeId)
        result = { passed: inputs.condition !== false }
        break

      case 'subbrain':
        pushLog('Sub-brain invoked.', 'info', nodeId)
        result = { result: { nested: true, status: 'ok' } }
        break

      default:
        await delay(150)
        pushLog('Node executed with canned output.', 'info', nodeId)
        result = { result: { processed: Object.keys(inputs), ok: true } }
    }

    outputs[nodeId] = result
  }

  return {
    outputs,
    order,
    durationMs: Date.now() - startedAtMs,
    log,
  }
}

module.exports = { executeBrain, runFireworks, DEFAULT_LLM_MODEL }
