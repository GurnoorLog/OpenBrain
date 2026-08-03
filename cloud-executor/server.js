'use strict'

// HTTP entrypoint for the OpenBrain cloud executor (Render Web Service).
//
//   GET  /health    -> liveness probe
//   GET  /fetch     -> ?url=... server-side page fetch (CORS proxy for the browser tool)
//   POST /run       -> { brain: { nodes, connections }, memory? } -> { outputs, order, durationMs, log }
//   POST /mcp/call  -> { mcpServer, tool, arguments? } -> { ok, data } (native MCP)
//   POST /composio  -> legacy Composio proxy (kept for backwards compatibility)
//
// CORS is wide open because the executor is a public compute endpoint; the
// model API key lives only in this service's environment (server-side), so
// exposing the endpoint itself is safe. MCP tool calls never see a token: the
// browser posts only { mcpServer, tool, arguments }, and secrets come from
// this service's mcp.json + env via {env:...} interpolation.

const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { executeBrain } = require('./brain-core')
const { createMcpManager } = require('./mcp-client')

const PORT = Number(process.env.PORT || 3000)
const REQUEST_TIMEOUT_MS = 150000
const MAX_BODY_BYTES = 4 * 1024 * 1024

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

function send(res, statusCode, body) {
  const payload = JSON.stringify(body)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS_HEADERS,
  })
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
  const memory = typeof payload.memory === 'string' ? payload.memory : ''
  const mcp = await getMcpManager()
  try {
    const result = await executeBrain({
      nodes: brain.nodes,
      connections: Array.isArray(brain.connections) ? brain.connections : [],
      memory,
      mcp,
    })
    send(res, 200, { ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    send(res, 500, { ok: false, error: message })
  }
}

// Lazily-built, process-wide MCP manager. The config path resolves the cloud
// service's own mcp.json (or the repo-root one when running from the repo),
// so a bare `npm install` in this folder is all a deploy needs.
let cachedMcp = null
async function getMcpManager() {
  if (cachedMcp) return cachedMcp
  const candidates = [
    process.env.MCP_CONFIG || '',
    path.join(__dirname, 'mcp.json'),
    path.join(__dirname, '..', 'mcp.json'),
  ]
  const firstExisting = candidates.find((candidate) => candidate !== '' && fs.existsSync(candidate))
  const { manager } = await createMcpManager({ configPath: firstExisting || undefined }).catch(
    () => ({ manager: null }),
  )
  cachedMcp = manager
  return manager
}

// POST /mcp/call -> { mcpServer, tool, arguments? } -> { ok, data }
// One-shot native MCP tool call for the SPA's GitHub/MCP nodes. The browser
// only sends the server name + tool + args; tokens come from the server side.
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
  const manager = await getMcpManager()
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

// Fetches a page server-side so the in-browser Browser node can read sites
// that refuse to send CORS headers. Same wide-open CORS as the rest of the
// endpoint; a fetch proxy exposes no secrets, only public pages.
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
        // MediaWiki (Wikipedia) blocks requests without a descriptive
        // User-Agent, and node's default undici UA gets 403'd.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 OpenBrainCloudExecutor/1.0',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!response.ok) {
      send(res, 502, { ok: false, error: `Upstream HTTP ${response.status}` })
      return
    }
    const text = await response.text()
    send(res, 200, { ok: true, url: target, text })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    send(res, 502, { ok: false, error: message })
  } finally {
    clearTimeout(timeout)
  }
}

// Proxies a Composio tool execution so the in-browser GitHub/MCP tool nodes
// work without CORS (Composio's preflight drops Access-Control-Allow-Origin).
// The key comes from the caller or, preferably, this service's env so it never
// leaves the server.
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
    send(res, 400, {
      ok: false,
      error: 'No Composio API key available on this service (set COMPOSIO_API_KEY).',
    })
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
      const message =
        parsed && parsed.error && parsed.error.message
          ? parsed.error.message
          : `Upstream HTTP ${response.status}`
      send(res, 502, { ok: false, error: message })
      return
    }
    if (parsed && parsed.successful === false) {
      const detail =
        parsed.error && typeof parsed.error === 'string'
          ? parsed.error
          : parsed.error && parsed.error.message
            ? parsed.error.message
            : 'Composio tool failed.'
      send(res, 502, { ok: false, error: detail })
      return
    }
    send(res, 200, { ok: true, data: parsed ? parsed.data : null })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    send(res, 502, { ok: false, error: message })
  } finally {
    clearTimeout(timeout)
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'GET' && url.pathname === '/health') {
    send(res, 200, { ok: true, service: 'openbrain-cloud-executor', ts: new Date().toISOString() })
    return
  }

  if (req.method === 'GET' && url.pathname === '/fetch') {
    req.setTimeout(20000)
    handleFetch(req, res)
    return
  }

  if (req.method === 'POST' && url.pathname === '/run') {
    req.setTimeout(REQUEST_TIMEOUT_MS)
    handleRun(req, res).catch((error) => {
      send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
    })
    return
  }

  if (req.method === 'POST' && url.pathname === '/mcp/call') {
    req.setTimeout(REQUEST_TIMEOUT_MS)
    handleMcpCall(req, res).catch((error) => {
      send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
    })
    return
  }

  if (req.method === 'POST' && url.pathname === '/composio') {
    req.setTimeout(60000)
    handleComposio(req, res).catch((error) => {
      send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
    })
    return
  }

  send(res, 404, { ok: false, error: 'Not found.' })
})

server.listen(PORT, () => {
  console.log(`openbrain-cloud-executor listening on :${PORT}`)
})
