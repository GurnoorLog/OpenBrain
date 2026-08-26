'use strict'

// Native MCP client for OpenBrain — the same client opencode uses
// (@modelcontextprotocol/sdk). Connects to any MCP server declared in an
// mcp.json (or your opencode config) and exposes its tools to brain nodes:
//
//   stdio  -> { "command": "npx", "args": [...], "env": { ... } }
//   remote -> { "type": "remote", "url": "https://...", "headers": { ... } }
//
// Config discovery order:
//   1. $MCP_CONFIG path
//   2. ./mcp.json, ./.mcp.json in the cwd
//   3. $WORKSPACE_DIR/mcp.json
//   4. ~/.config/opencode/opencode.json (reuse your opencode servers)
//
// Supports `{env:NAME}` interpolation inside url/command/args/env/headers so
// tokens never have to be committed to the config file.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js')
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js')

const CONNECT_TIMEOUT_MS = 30000
const CALL_TIMEOUT_MS = 120000

function interpolate(value, source = {}) {
  if (typeof value === 'string') {
    return value.replace(/\{env:([A-Za-z0-9_]+)\}/g, (_match, name) => {
      const local = source[name] ?? process.env[name]
      return local === undefined ? '' : local
    })
  }
  if (Array.isArray(value)) return value.map((entry) => interpolate(entry, source))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, entry] of Object.entries(value)) out[key] = interpolate(entry, source)
    return out
  }
  return value
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

// Finds the first config file that declares an `mcp` object.
function loadConfig(explicitPath) {
  const candidates = []
  if (explicitPath && explicitPath.trim() !== '') candidates.push(explicitPath)
  candidates.push(
    path.join(process.cwd(), 'mcp.json'),
    path.join(process.cwd(), '.mcp.json'),
    process.env.WORKSPACE_DIR
      ? path.join(process.env.WORKSPACE_DIR, 'mcp.json')
      : '',
    path.join(os.homedir(), '.config', 'opencode', 'opencode.json'),
  )
  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) continue
    try {
      const raw = JSON.parse(fs.readFileSync(candidate, 'utf8'))
      if (raw && typeof raw === 'object') {
        if (raw.mcp && typeof raw.mcp === 'object') {
          return { file: candidate, servers: enabledServers(raw.mcp) }
        }
        const looksLikeServers = Object.values(raw).every((entry) => entry && typeof entry === 'object')
        if (looksLikeServers) return { file: candidate, servers: enabledServers(raw) }
      }
    } catch {
      /* try the next candidate */
    }
  }
  return { file: null, servers: {} }
}

// Drops disabled entries ({ "enabled": false }) so configs can be toggled like
// opencode's without editing the server definitions out.
function enabledServers(map) {
  const out = {}
  for (const [name, spec] of Object.entries(map)) {
    if (spec && typeof spec === 'object' && spec.enabled === false) continue
    out[name] = spec
  }
  return out
}

class McpManager {
  constructor(servers, configFile) {
    this.servers = servers
    this.configFile = configFile
    this.clients = new Map() // name -> { client, transport, tools }
  }

  serverNames() {
    return Object.keys(this.servers)
  }

  async connect(name) {
    if (this.clients.has(name)) return this.clients.get(name)
    const spec = this.servers[name]
    if (!spec) throw new Error(`MCP server "${name}" is not configured.`)
    const client = new Client({ name: 'openbrain', version: '1.0.0' }, { capabilities: {} })
    let transport
    const resolved = interpolate(spec)
    const isRemote = resolved.type === 'remote' || typeof resolved.url === 'string'
    if (isRemote) {
      const url = new URL(resolved.url)
      const headers = { ...(resolved.headers || {}) }
      if (resolved.authToken) headers.Authorization = `Bearer ${resolved.authToken}`
      const wantsSse = resolved.transport === 'sse' || url.pathname.endsWith('/sse')
      transport = wantsSse
        ? new SSEClientTransport(url)
        : new StreamableHTTPClientTransport({ requestUrl: url, requestInit: { headers } })
    } else {
      transport = new StdioClientTransport({
        command: resolved.command,
        args: resolved.args || [],
        env: { ...process.env, ...(resolved.env || {}) },
        stderr: 'pipe',
      })
    }
    await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, `connect ${name}`)
    const tools = await client.listTools().catch(() => ({ tools: [] }))
    const entry = { client, transport, tools: tools.tools || [] }
    this.clients.set(name, entry)
    return entry
  }

  async listTools(name) {
    const entry = await this.connect(name)
    return entry.tools
  }

  async call(name, toolName, args) {
    const entry = await this.connect(name)
    const tool = entry.tools.find(
      (candidate) => candidate.name === toolName || `${name}/${candidate.name}` === toolName,
    )
    const actualName = tool ? tool.name : toolName
    const result = await withTimeout(
      entry.client.callTool({ name: actualName, arguments: args || {} }),
      CALL_TIMEOUT_MS,
      `${name}/${toolName}`,
    )
    return normalizeCallResult(result)
  }

  async close() {
    for (const [name, entry] of this.clients.entries()) {
      try {
        await entry.client.close()
      } catch {
        /* ignore */
      }
      this.clients.delete(name)
    }
  }
}

function normalizeCallResult(result) {
  const isError = result && result.isError === true
  const text = Array.isArray(result?.content)
    ? result.content
        .map((block) => (block && block.type === 'text' ? block.text : block && block.type === 'image' ? '[image]' : block && block.type === 'resource' ? `[resource: ${block.resource?.uri ?? ''}]` : JSON.stringify(block)))
        .join('\n')
    : JSON.stringify(result ?? null)
  if (result && result.structuredContent !== undefined) {
    return { ok: !isError, result: text, data: result.structuredContent }
  }
  return { ok: !isError, result: text }
}

// Convenience factory used by the Runtime and the TUI. Pass either a config
// path (`configPath`) or an already-parsed servers map (`servers`).
async function createMcpManager({ configPath, servers } = {}) {
  if (servers && typeof servers === 'object' && !Array.isArray(servers)) {
    return { manager: new McpManager(servers, null), file: null }
  }
  const { file, servers: found } = loadConfig(configPath)
  if (Object.keys(found).length === 0) return { manager: null, file }
  return { manager: new McpManager(found, file), file }
}

module.exports = { McpManager, loadConfig, createMcpManager, normalizeCallResult }
