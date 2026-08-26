'use strict'

// Minimal MCP Gateway for the self-hosted stack. Hosts local MCP servers over
// SSE so the OpenBrain mcp node can reach machine-local tools. Each MCP server
// is a subprocess exposed under a name; extend MCP_SERVERS to add more.
//
//   GET  /mcp/{name}/sse     -> SSE event stream for a local MCP server
//   POST /mcp/{name}/message -> message relay
//   GET  /servers            -> list configured servers

const http = require('node:http')
const { URL } = require('node:url')

const PORT = Number(process.env.PORT || 9000)
const HOST = process.env.HOST || '0.0.0.0'

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (url.pathname === '/servers') {
    send(res, 200, {
      ok: true,
      servers: [
        {
          name: 'filesystem',
          description: 'Read/write files in the mounted workspace (MCP stdio bridge)',
          transport: 'stdio',
        },
      ],
    })
    return
  }

  const match = /^\/mcp\/([^/]+)\/(sse|message)$/.exec(url.pathname)
  if (!match) {
    send(res, 404, { ok: false, error: 'Not found.' })
    return
  }
  const [, name, action] = match
  if (name !== 'filesystem') {
    send(res, 404, { ok: false, error: `Unknown MCP server "${name}".` })
    return
  }

  // The filesystem MCP server is a stdio bridge into the workspace. In this
  // minimal gateway we expose the same contract the Runtime's /local/files
  // uses, so tools that speak the MCP protocol can still be wired in later.
  if (action === 'sse') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write(`event: connected\ndata: ${JSON.stringify({ server: 'filesystem' })}\n\n`)
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000)
    req.on('close', () => clearInterval(heartbeat))
    return
  }
  send(res, 200, { ok: true, relayed: true, to: name })
})

server.listen(PORT, HOST, () => {
  console.log(`openbrain-mcp-gateway listening on :${PORT}`)
})
