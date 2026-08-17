'use strict'

// ============================================================
// OpenBrain Runtime
// ------------------------------------------------------------
// The self-hosted engine that makes OpenBrain a local AI OS.
//
//   Serves the OpenBrain Desktop SPA (dist/)
//   POST /run           -> executes a brain graph (same core as the cloud)
//   GET  /mcp           -> lists configured MCP servers and their tools
//   POST /mcp/call      -> one-shot native MCP tool call (SPA GitHub/MCP nodes)
//   POST /composio      -> legacy proxy for the SPA's in-browser GitHub tools
//   GET  /fetch?url=    -> server-side page fetch for the Browser node
//   POST /local/files   -> read/write/list files in the user's WORKSPACE
//   POST /local/finetune-> launch a local fine-tune job in the workspace
//   GET  /registry      -> list .brain files stored in the local registry
//   POST /registry      -> save a .brain file into the registry
//   GET  /plugins       -> list installed plugins from the plugins dir
//   GET  /system        -> runtime/container info for `brain doctor`
//
// Local-first: keys come from the user's own env/.env file, data lives in the
// mounted WORKSPACE and REGISTRY volumes. No OpenBrain-managed cloud needed.
// ============================================================

const http = require('node:http')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

// brain-core is the shared graph executor (same file the cloud uses). Resolved
// from the runtime dir in Docker, or from cloud-executor in the repo.
function loadBrainCore() {
  const candidates = [
    path.join(__dirname, 'brain-core.js'),
    path.join(__dirname, '..', 'cloud-executor', 'brain-core.js'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return require(candidate)
  }
  throw new Error('brain-core.js not found next to the runtime.')
}
const { executeBrain } = loadBrainCore()

// agent-daemon is the scheduler that runs .brain files with an `agent` block.
// Resolved next to the runtime in Docker, or from the repo runtime dir.
function loadAgentDaemon() {
  const candidates = [path.join(__dirname, 'agent-daemon.js')]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return require(candidate)
  }
  return null
}
const { createAgentDaemon } = loadAgentDaemon() ?? { createAgentDaemon: null }

// mcp-client is the native Model Context Protocol client (the same one opencode
// uses). It connects to any server declared in mcp.json — stdio or remote.
function loadMcpClient() {
  const candidates = [
    path.join(__dirname, 'mcp-client.js'),
    path.join(__dirname, '..', 'cloud-executor', 'mcp-client.js'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return require(candidate)
  }
  return null
}

let cachedMcpManagerPromise = null
// `mcpConfig` may be a config file path (string), an inline servers map
// (object, e.g. the TUI sends the host's parsed mcp.json), or absent (discover
// the runtime's own mcp.json).
async function resolveMcpManager(mcpConfig) {
  const loader = loadMcpClient()
  if (!loader) return null
  if (mcpConfig && typeof mcpConfig === 'object' && !Array.isArray(mcpConfig)) {
    const fresh = await loader
      .createMcpManager({ servers: mcpConfig })
      .catch(() => ({ manager: null, file: null }))
    return fresh.manager
  }
  if (!mcpConfig) {
    if (!cachedMcpManagerPromise) {
      cachedMcpManagerPromise = loader
        .createMcpManager({})
        .catch((error) => {
          console.error(`MCP init failed: ${error.message}`)
          return { manager: null, file: null }
        })
    }
    return (await cachedMcpManagerPromise).manager
  }
  const fresh = await loader
    .createMcpManager({ configPath: String(mcpConfig) })
    .catch(() => ({ manager: null, file: null }))
  return fresh.manager
}

async function handleListMcp(req, res) {
  const loader = loadMcpClient()
  if (!loader) {
    send(res, 200, { ok: true, file: null, servers: [], tools: {} })
    return
  }
  const { file, manager } = await loader
    .createMcpManager({})
    .catch(() => ({ file: null, manager: null }))
  if (!manager) {
    send(res, 200, { ok: true, file, servers: [], tools: {} })
    return
  }
  const tools = {}
  for (const name of manager.serverNames()) {
    try {
      const found = await manager.listTools(name)
      tools[name] = found.map((tool) => tool.name)
    } catch {
      tools[name] = []
    }
  }
  send(res, 200, { ok: true, file, servers: manager.serverNames(), tools })
}

// POST /mcp/call -> { mcpServer, tool, arguments? } -> { ok, data }
// One-shot native MCP tool call against a configured server. The browser can't
// run an MCP client, so the SPA's GitHub/MCP tool nodes route through here
// (or the cloud executor). Secrets never leave the server: they come from the
// server's mcp.json + env via {env:...} interpolation.
async function handleMcpCall(req, res) {
  const raw = await readBody(req, MAX_BODY_BYTES)
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    send(res, 400, { ok: false, error: 'Invalid JSON body.' })
    return
  }
  const server =
    typeof payload.mcpServer === 'string' && payload.mcpServer.trim() !== ''
      ? payload.mcpServer.trim()
      : ''
  const tool =
    typeof payload.tool === 'string' && payload.tool.trim() !== ''
      ? payload.tool.trim()
      : ''
  if (server === '' || tool === '') {
    send(res, 400, { ok: false, error: 'Expected { mcpServer, tool, arguments? }.' })
    return
  }
  const args = payload.arguments && typeof payload.arguments === 'object' ? payload.arguments : {}
  const loader = loadMcpClient()
  if (!loader) {
    send(res, 500, { ok: false, error: 'MCP client is not available on this service.' })
    return
  }
  const { manager } = await loader
    .createMcpManager({})
    .catch(() => ({ manager: null, file: null }))
  if (!manager) {
    send(res, 500, { ok: false, error: 'No MCP servers configured (add an mcp.json).' })
    return
  }
  try {
    const data = await manager.call(server, tool, args)
    send(res, 200, { ok: true, data })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    send(res, 502, { ok: false, error: message })
  }
}

const PORT = Number(process.env.PORT || 8080)
const HOST = process.env.HOST || '0.0.0.0'
const DIST_DIR = process.env.DIST_DIR || path.join(__dirname, 'dist')
const WORKSPACE = path.resolve(process.env.WORKSPACE_DIR || path.join(__dirname, '..', 'workspace'))
const REGISTRY = path.resolve(process.env.REGISTRY_DIR || path.join(WORKSPACE, '.registry'))
const PLUGINS_DIR = path.resolve(
  process.env.PLUGINS_DIR || path.join(__dirname, '..', 'plugins'),
)
const REQUEST_TIMEOUT_MS = 150000
const MAX_BODY_BYTES = 16 * 1024 * 1024

const AGENT_RUNS_DIR = path.join(WORKSPACE, '.agents')
const AGENT_RUNS_FILE = path.join(AGENT_RUNS_DIR, 'runs.jsonl')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

for (const dir of [WORKSPACE, REGISTRY, PLUGINS_DIR, AGENT_RUNS_DIR]) {
  fs.mkdirSync(dir, { recursive: true })
}

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------
function send(res, statusCode, body) {
  const payload = JSON.stringify(body)
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS })
  res.end(payload)
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let received = 0
    req.on('data', (chunk) => {
      received += chunk.length
      if (received > maxBytes) {
        reject(new Error('Request body too large.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  const root = DIST_DIR
  if (!fs.existsSync(root)) return false
  let filePath = pathname === '/' ? 'index.html' : pathname.slice(1)
  let resolved = path.resolve(root, filePath)
  if (!resolved.startsWith(path.resolve(root))) resolved = path.join(root, 'index.html')
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    const ext = path.extname(resolved).toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    fs.createReadStream(resolved).pipe(res)
    return true
  }
  // SPA fallback: unknown routes render the app shell.
  const index = path.join(root, 'index.html')
  if (fs.existsSync(index)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
    fs.createReadStream(index).pipe(res)
    return true
  }
  return false
}

// Resolves a user-supplied relative path strictly inside a base directory.
function resolveInside(base, relative) {
  const target = path.resolve(base, String(relative || '').replace(/^[/\\]+/, ''))
  const baseResolved = path.resolve(base)
  if (target !== baseResolved && !target.startsWith(baseResolved + path.sep)) {
    throw new Error('Path escapes the workspace.')
  }
  return target
}

// --------------------------------------------------------------------------
// /run
// --------------------------------------------------------------------------
async function handleRun(req, res) {
  const raw = await readBody(req, MAX_BODY_BYTES)
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    send(res, 400, { ok: false, error: 'Invalid JSON body.' })
    return
  }
  const brain = payload.brain ?? payload
  if (!Array.isArray(brain.nodes)) {
    send(res, 400, { ok: false, error: 'Expected { brain: { nodes, connections } }.' })
    return
  }
  const mcp = await resolveMcpManager(payload.mcpConfig)

  // SSE streaming mode: when the client asks for it, node events and log lines
  // are pushed live as `data: <json>\n\n` frames instead of a single response.
  // Each frame carries `{ type, ... }`; the final frame is `{ type: 'done', result }`.
  const stream = payload.stream === true
  if (stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...CORS_HEADERS,
    })
    const writeEvent = (event) => {
      if (res.writableEnded) return
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
    try {
      const result = await executeBrain({
        nodes: brain.nodes,
        connections: Array.isArray(brain.connections) ? brain.connections : [],
        memory: typeof payload.memory === 'string' ? payload.memory : '',
        mcp,
        knowledgeDir:
          typeof payload.knowledgeDir === 'string' && payload.knowledgeDir.trim() !== ''
            ? payload.knowledgeDir.trim()
            : KNOWLEDGE_DIR,
        resolveWorker: agentDaemon ? agentDaemon.resolveWorker : undefined,
        onEvent: (event) => writeEvent({ type: 'event', event }),
        onLog: (entry) => writeEvent({ type: 'log', entry }),
        onToken: (token) => writeEvent({ type: 'token', token }),
      })
      writeEvent({ type: 'done', result })
      res.end()
    } catch (error) {
      writeEvent({
        type: 'done',
        error: error instanceof Error ? error.message : String(error),
      })
      res.end()
    }
    return
  }

  try {
    const result = await executeBrain({
      nodes: brain.nodes,
      connections: Array.isArray(brain.connections) ? brain.connections : [],
      memory: typeof payload.memory === 'string' ? payload.memory : '',
      mcp,
      knowledgeDir:
        typeof payload.knowledgeDir === 'string' && payload.knowledgeDir.trim() !== ''
          ? payload.knowledgeDir.trim()
          : KNOWLEDGE_DIR,
      resolveWorker: agentDaemon ? agentDaemon.resolveWorker : undefined,
    })
    send(res, 200, { ok: true, ...result })
  } catch (error) {
    send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}

// --------------------------------------------------------------------------
// /fetch
// --------------------------------------------------------------------------
async function handleFetch(req, res) {
  const target = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('url')
  if (!target) {
    send(res, 400, { ok: false, error: 'Missing url query param.' })
    return
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(target, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 OpenBrainRuntime/1.0',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!response.ok) {
      send(res, 502, { ok: false, error: `Upstream HTTP ${response.status}` })
      return
    }
    send(res, 200, { ok: true, url: target, text: await response.text() })
  } catch (error) {
    send(res, 502, { ok: false, error: error instanceof Error ? error.message : String(error) })
  } finally {
    clearTimeout(timeout)
  }
}

// --------------------------------------------------------------------------
// /composio
// --------------------------------------------------------------------------
async function handleComposio(req, res) {
  const raw = await readBody(req, MAX_BODY_BYTES)
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    send(res, 400, { ok: false, error: 'Invalid JSON body.' })
    return
  }
  const slug = typeof payload.slug === 'string' && payload.slug.trim() !== '' ? payload.slug.trim() : ''
  if (slug === '') {
    send(res, 400, { ok: false, error: 'Missing slug.' })
    return
  }
  const args = payload.arguments && typeof payload.arguments === 'object' ? payload.arguments : {}
  const apiKey =
    typeof payload.apiKey === 'string' && payload.apiKey.trim() !== ''
      ? payload.apiKey.trim()
      : (process.env.COMPOSIO_API_KEY || '')
  if (apiKey === '') {
    send(res, 400, { ok: false, error: 'No Composio API key available (set COMPOSIO_API_KEY).' })
    return
  }
  const upstreamBody = { arguments: args, version: 'latest' }
  if (typeof payload.connected_account_id === 'string' && payload.connected_account_id !== '') {
    upstreamBody.connected_account_id = payload.connected_account_id
  }
  if (typeof payload.entity_id === 'string' && payload.entity_id !== '') {
    upstreamBody.entity_id = payload.entity_id
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)
  try {
    const response = await fetch(
      `https://backend.composio.dev/api/v3.1/tools/execute/${encodeURIComponent(slug)}`,
      {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(upstreamBody),
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
      send(res, 502, {
        ok: false,
        error: parsed?.error?.message ?? `Upstream HTTP ${response.status}`,
      })
      return
    }
    if (parsed && parsed.successful === false) {
      const detail = parsed.error?.message ?? parsed.error ?? 'Composio tool failed.'
      send(res, 502, { ok: false, error: String(detail) })
      return
    }
    send(res, 200, { ok: true, data: parsed ? parsed.data : null })
  } catch (error) {
    send(res, 502, { ok: false, error: error instanceof Error ? error.message : String(error) })
  } finally {
    clearTimeout(timeout)
  }
}

// --------------------------------------------------------------------------
// /local/files — the runtime acts as the user's own filesystem bridge.
// The Browser/Python/Filesystem nodes (and future custom nodes) can reach the
// mounted WORKSPACE without exposing anything outside it.
// --------------------------------------------------------------------------
async function handleLocalFiles(req, res) {
  const raw = await readBody(req, MAX_BODY_BYTES)
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    send(res, 400, { ok: false, error: 'Invalid JSON body.' })
    return
  }
  const op = typeof payload.op === 'string' ? payload.op : 'list'
  try {
    if (op === 'list') {
      const base = resolveInside(WORKSPACE, typeof payload.path === 'string' ? payload.path : '')
      const entries = await fsp.readdir(base, { withFileTypes: true })
      const items = await Promise.all(
        entries.map(async (entry) => {
          const stat = await fsp.stat(path.join(base, entry.name)).catch(() => null)
          return {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: stat?.size ?? 0,
            mtime: stat?.mtime?.toISOString() ?? null,
          }
        }),
      )
      send(res, 200, { ok: true, base, items })
      return
    }
    if (op === 'read') {
      const target = resolveInside(WORKSPACE, payload.path)
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        send(res, 404, { ok: false, error: 'File not found.' })
        return
      }
      send(res, 200, { ok: true, path: target, content: await fsp.readFile(target, 'utf8') })
      return
    }
    if (op === 'write') {
      const target = resolveInside(WORKSPACE, payload.path)
      await fsp.mkdir(path.dirname(target), { recursive: true })
      await fsp.writeFile(target, String(payload.content ?? ''), 'utf8')
      send(res, 200, { ok: true, path: target })
      return
    }
    if (op === 'delete') {
      const target = resolveInside(WORKSPACE, payload.path)
      await fsp.rm(target, { recursive: true, force: true })
      send(res, 200, { ok: true, path: target })
      return
    }
    send(res, 400, { ok: false, error: `Unknown op "${op}".` })
  } catch (error) {
    send(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}

// --------------------------------------------------------------------------
// /local/finetune — local-first fine-tuning. Writes the job spec into the
// workspace and runs the self-adaptive local trainer (train-local.js +
// train_local.py) which probes the machine it runs on and adapts. If the
// trainer or Python are missing, the job fails loudly — no fake training.
// GET /local/finetune/<jobId> polls the live job status.
// --------------------------------------------------------------------------
const finetuneJobs = new Map()

async function handleLocalFinetune(req, res) {
  const raw = await readBody(req, MAX_BODY_BYTES)
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    send(res, 400, { ok: false, error: 'Invalid JSON body.' })
    return
  }
  const jobId =
    typeof payload.jobId === 'string' && payload.jobId.trim() !== ''
      ? payload.jobId.trim()
      : `ft-${Date.now().toString(36)}`
  const existing = finetuneJobs.get(jobId)
  if (existing) {
    send(res, 200, { ok: true, jobId, status: existing.status, ...(existing.error ? { error: existing.error } : {}) })
    return
  }
  const spec = payload.spec && typeof payload.spec === 'object' ? payload.spec : {}
  const targetDir = path.join(WORKSPACE, 'finetunes', jobId)
  fs.mkdirSync(targetDir, { recursive: true })
  fs.writeFileSync(path.join(targetDir, 'spec.json'), JSON.stringify(spec, null, 2))
  const job = { status: 'running', progress: 0, startedAt: new Date().toISOString() }
  finetuneJobs.set(jobId, job)
  send(res, 200, { ok: true, jobId, status: job.status, targetDir })

  const { runLocalFineTune } = require('./train-local.js')
  try {
    const outcome = await runLocalFineTune({
      spec,
      jobDir: targetDir,
      maxSteps: typeof payload.maxSteps === 'number' ? payload.maxSteps : 0,
      onLog: (entry) => {
        job.log = job.log || []
        job.log.push(entry)
      },
      onProgress: (state) => {
        if (state.type === 'progress') {
          job.progress = Math.round((state.step_number || 0) + 1)
        }
      },
    })
    job.status = 'completed'
    job.result = outcome.result
    job.adapter = outcome.adapter
  } catch (error) {
    job.status = 'failed'
    job.error = error instanceof Error ? error.message : String(error)
  }
}

async function handleFinetuneStatus(req, res, jobId) {
  const job = finetuneJobs.get(jobId)
  if (!job) {
    send(res, 404, { ok: false, error: `No fine-tune job "${jobId}".` })
    return
  }
  send(res, 200, { ok: true, jobId, ...job })
}

// --------------------------------------------------------------------------
// /registry — local-first storage of .brain files (the user's own library).
// --------------------------------------------------------------------------
async function handleRegistry(req, res) {
  if (req.method === 'GET') {
    const names = await fsp.readdir(REGISTRY).catch(() => [])
    const brains = []
    for (const name of names) {
      if (!name.endsWith('.brain')) continue
      const raw = await fsp.readFile(path.join(REGISTRY, name), 'utf8').catch(() => '')
      let file = null
      try {
        file = JSON.parse(raw)
      } catch {
        file = null
      }
      brains.push({
        id: file?.id ?? name.replace(/\.brain$/, ''),
        name: file?.name ?? name,
        description: file?.description ?? '',
        file: name,
        exportedAt: file?.metadata?.exportedAt ?? null,
        agent: file?.agent
          ? { enabled: Boolean(file.agent.enabled), schedule: file.agent.schedule ?? null }
          : null,
      })
    }
    send(res, 200, { ok: true, registry: REGISTRY, brains })
    return
  }
  if (req.method === 'POST') {
    const raw = await readBody(req, MAX_BODY_BYTES)
    let file
    try {
      file = JSON.parse(raw)
    } catch {
      send(res, 400, { ok: false, error: 'Invalid .brain JSON.' })
      return
    }
    if (file?.format !== 'openbrain/brain') {
      send(res, 400, { ok: false, error: 'Not a .brain file.' })
      return
    }
    const slug = (file.name || 'brain').toLowerCase().replace(/[^a-z0-9-_]+/g, '-')
    const fileName = `${slug || 'brain'}-${file.id.slice(0, 8)}.brain`
    await fsp.writeFile(path.join(REGISTRY, fileName), JSON.stringify(file, null, 2), 'utf8')
    send(res, 200, { ok: true, file: fileName })
    return
  }
  send(res, 405, { ok: false, error: 'Method not allowed.' })
}

// --------------------------------------------------------------------------
// /plugins — lists plugins installed in the plugins dir. A plugin is a
// directory with an openbrain-plugin.json manifest (the SDK validates it).
// --------------------------------------------------------------------------
async function handlePlugins(req, res) {
  const entries = await fsp.readdir(PLUGINS_DIR, { withFileTypes: true }).catch(() => [])
  const plugins = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const manifestPath = path.join(PLUGINS_DIR, entry.name, 'openbrain-plugin.json')
    const raw = await fsp.readFile(manifestPath, 'utf8').catch(() => null)
    if (!raw) continue
    try {
      plugins.push({ ...JSON.parse(raw), dir: entry.name })
    } catch {
      plugins.push({ name: entry.name, dir: entry.name, error: 'invalid manifest' })
    }
  }
  send(res, 200, { ok: true, pluginsDir: PLUGINS_DIR, plugins })
}

// --------------------------------------------------------------------------
// /system — for `brain doctor` and the Settings "About OpenBrain Runtime".
// --------------------------------------------------------------------------
async function handleSystem(req, res) {
  send(res, 200, {
    ok: true,
    runtime: 'openbrain-runtime',
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    hostname: require('node:os').hostname(),
    containerized: fs.existsSync('/.dockerenv'),
    workspace: WORKSPACE,
    registry: REGISTRY,
    pluginsDir: PLUGINS_DIR,
    env: {
      FIREWORKS_API_KEY: Boolean(process.env.FIREWORKS_API_KEY),
      COMPOSIO_API_KEY: Boolean(process.env.COMPOSIO_API_KEY),
      OLLAMA_URL: process.env.OLLAMA_URL || null,
    },
  })
}

// --------------------------------------------------------------------------
// /ollama — proxy to the local Ollama server (avoids browser CORS issues)
// --------------------------------------------------------------------------

const OLLAMA_BASE = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'

async function handleOllamaProxy(req, res) {
  const ollamaPath = req.url.replace(/^\/ollama/, '') || '/'
  const target = `${OLLAMA_BASE}${ollamaPath}`
  const body = req.method === 'POST' ? await readBody(req, 10 * 1024 * 1024) : null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120000)
  try {
    const response = await fetch(target, {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
      },
      body: body || undefined,
      signal: controller.signal,
    })
    const text = await response.text()
    res.writeHead(response.status, { 'Content-Type': 'application/json' })
    res.end(text)
  } catch (error) {
    send(res, 502, { ok: false, error: error instanceof Error ? error.message : String(error) })
  } finally {
    clearTimeout(timeout)
  }
}

// --------------------------------------------------------------------------
// /agents — the agent daemon turns .brain files with an `agent` block into
// scheduled autonomous agents. It scans the registry each minute and runs due
// brains through the shared executeBrain core. Worker nodes inside those brains
// resolve other registry brains and curated skills (see brain-core).
// --------------------------------------------------------------------------
const KNOWLEDGE_DIR = process.env.OPENBRAIN_KNOWLEDGE_DIR || path.join(WORKSPACE, 'knowledge')
const agentDaemon =
  createAgentDaemon && typeof createAgentDaemon === 'function'
    ? createAgentDaemon({
        registryDir: REGISTRY,
        resolveMcpManager: () => resolveMcpManager(undefined),
        executeBrain,
        knowledgeDir: KNOWLEDGE_DIR,
        runsFile: AGENT_RUNS_FILE,
      })
    : null
if (agentDaemon) agentDaemon.start()

async function handleAgents(req, res, pathname) {
  if (!agentDaemon) {
    send(res, 503, { ok: false, error: 'Agent daemon is not available on this service.' })
    return
  }
  const runMatch = /^\/agents\/([^/]+)\/run$/.exec(pathname)
  if (req.method === 'POST' && runMatch) {
    const result = await agentDaemon.triggerRun(decodeURIComponent(runMatch[1]))
    send(res, result.ok === false ? 404 : 200, { ok: result.ok !== false, ...result })
    return
  }
  if (req.method === 'GET' && pathname === '/agents') {
    send(res, 200, { ok: true, agents: agentDaemon.agents() })
    return
  }
  send(res, 405, { ok: false, error: 'Method not allowed.' })
}

// --------------------------------------------------------------------------
// server
// --------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const { pathname } = url

  if (req.method === 'GET' && pathname === '/health') {
    send(res, 200, { ok: true, service: 'openbrain-runtime', ts: new Date().toISOString() })
    return
  }
  if (req.method === 'GET' && pathname === '/system') {
    handleSystem(req, res)
    return
  }
  if (req.method === 'GET' && pathname === '/mcp') {
    handleListMcp(req, res)
    return
  }
  if (req.method === 'POST' && pathname === '/mcp/call') {
    req.setTimeout(REQUEST_TIMEOUT_MS)
    handleMcpCall(req, res).catch((error) =>
      send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }),
    )
    return
  }
  if (req.method === 'GET' && pathname === '/fetch') {
    req.setTimeout(20000)
    handleFetch(req, res)
    return
  }
  if (pathname.startsWith('/ollama')) {
    req.setTimeout(120000)
    handleOllamaProxy(req, res).catch((error) =>
      send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }),
    )
    return
  }
  if (req.method === 'POST' && pathname === '/run') {
    req.setTimeout(REQUEST_TIMEOUT_MS)
    handleRun(req, res).catch((error) =>
      send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }),
    )
    return
  }
  if (req.method === 'POST' && pathname === '/composio') {
    req.setTimeout(60000)
    handleComposio(req, res).catch((error) =>
      send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }),
    )
    return
  }
  if (req.method === 'POST' && pathname === '/local/files') {
    handleLocalFiles(req, res).catch((error) =>
      send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }),
    )
    return
  }
  if (req.method === 'POST' && pathname === '/local/finetune') {
    handleLocalFinetune(req, res)
    return
  }
  const finetuneStatusMatch = /^\/local\/finetune\/([^/]+)$/.exec(pathname)
  if (req.method === 'GET' && finetuneStatusMatch) {
    handleFinetuneStatus(req, res, decodeURIComponent(finetuneStatusMatch[1]))
    return
  }
  if (pathname === '/registry' && (req.method === 'GET' || req.method === 'POST')) {
    handleRegistry(req, res).catch((error) =>
      send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }),
    )
    return
  }
  if (req.method === 'GET' && pathname === '/plugins') {
    handlePlugins(req, res).catch((error) =>
      send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }),
    )
    return
  }
  if (pathname === '/agents' || /^\/agents\/[^/]+\/run$/.test(pathname)) {
    handleAgents(req, res, pathname).catch((error) =>
      send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }),
    )
    return
  }

  if (serveStatic(req, res, pathname)) return
  send(res, 404, { ok: false, error: 'Not found.' })
})

server.listen(PORT, HOST, () => {
  console.log(`openbrain-runtime listening on http://${HOST}:${PORT}`)
  console.log(`  workspace: ${WORKSPACE}`)
  console.log(`  registry:  ${REGISTRY}`)
  console.log(`  plugins:   ${PLUGINS_DIR}`)
})
