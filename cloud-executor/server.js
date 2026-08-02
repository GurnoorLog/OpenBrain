'use strict'

// HTTP entrypoint for the OpenBrain cloud executor (Render Web Service).
//
//   GET  /health  -> liveness probe
//   POST /run     -> { brain: { nodes, connections }, memory? } -> { outputs, order, durationMs, log }
//
// CORS is wide open because the executor is a public compute endpoint; the
// model API key lives only in this service's environment (server-side), so
// exposing the endpoint itself is safe. Zero runtime dependencies.

const http = require('node:http')
const { executeBrain } = require('./brain-core')

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
  try {
    const result = await executeBrain({
      nodes: brain.nodes,
      connections: Array.isArray(brain.connections) ? brain.connections : [],
      memory,
    })
    send(res, 200, { ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    send(res, 500, { ok: false, error: message })
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

  if (req.method === 'POST' && url.pathname === '/run') {
    req.setTimeout(REQUEST_TIMEOUT_MS)
    handleRun(req, res).catch((error) => {
      send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
    })
    return
  }

  send(res, 404, { ok: false, error: 'Not found.' })
})

server.listen(PORT, () => {
  console.log(`openbrain-cloud-executor listening on :${PORT}`)
})
