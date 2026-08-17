'use strict'

// Execution backend for the TUI. Uses the same shared brain-core executor as
// the cloud/Runtime/CLI, with an automatic fallback:
//   - `--runtime <url>` (or OPENBRAIN_RUNTIME_URL): prefer the OpenBrain
//     Runtime HTTP API (keys stay server-side). Falls back to in-process if
//     the Runtime is unreachable.
//   - otherwise / `--local`: run in-process via brain-core.js with the local
//     process.env keys, streaming each node log entry live.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function resolveBrainCore() {
  const candidates = [
    path.join(__dirname, '..', '..', 'cloud-executor', 'brain-core.js'),
    path.join(__dirname, '..', 'brain-core.js'),
    '/app/brain-core.cjs',
    '/app/brain-core.js',
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return require(candidate)
  }
  throw new Error(
    'brain-core.js not found. Run from the OpenBrain repo or inside the openbrain-tui image.',
  )
}

// The native MCP client (same one opencode uses). Resolved next to brain-core;
// returns null when the client isn't installed so local runs degrade gracefully.
function resolveMcpClient() {
  const candidates = [
    path.join(__dirname, '..', '..', 'cloud-executor', 'mcp-client.js'),
    path.join(__dirname, '..', 'mcp-client.js'),
    '/app/mcp-client.cjs',
    '/app/mcp-client.js',
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        return require(candidate)
      } catch {
        return null
      }
    }
  }
  return null
}

async function isReachable(baseUrl) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    const response = await fetch(`${baseUrl}/health`, { signal: controller.signal })
    clearTimeout(timer)
    return response.ok
  } catch {
    return false
  }
}

export async function createRunner({ brain, runtimeUrl, forceLocal, knowledgeDir, mcpConfigPath }) {
  const core = resolveBrainCore()
  const mcpClient = resolveMcpClient()
  const requested = (runtimeUrl || process.env.OPENBRAIN_RUNTIME_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '')
  const knowledgePath =
    knowledgeDir || process.env.OPENBRAIN_KNOWLEDGE_DIR || process.env.KNOWLEDGE_DIR || path.join(process.cwd(), 'knowledge')
  const mcpConfig = mcpClient
    ? mcpClient.loadConfig(mcpConfigPath || process.env.OPENBRAIN_MCP_CONFIG || '')
    : { file: null, servers: {} }
  // Local backend gets a manager over the discovered config; connects lazily on
  // the first tool call. Runtime backend gets the parsed servers inline so the
  // container doesn't need the host's mcp.json path.
  const localMcp = mcpClient ? new mcpClient.McpManager(mcpConfig.servers, mcpConfig.file) : null
  const hasServers = Object.keys(mcpConfig.servers).length > 0
  let backend = 'local'
  if (!forceLocal && runtimeUrl !== undefined) {
    backend = (await isReachable(requested)) ? 'runtime' : 'local'
  }

  return {
    backend,
    runtimeUrl: requested,
    mcpFile: mcpConfig.file,
    mcpServers: Object.keys(mcpConfig.servers),
    async run({ message, memory = '', onLog, onToken, onEvent }) {
      // Stamp the user's message onto every llm node (mirrors the browser's
      // chat pill) so agents work even on brains with no input edges.
      const nodes = brain.graph.nodes.map((node) =>
        node.type === 'llm'
          ? { ...node, configuration: { ...(node.configuration || {}), userMessage: message } }
          : node,
      )
      const connections = brain.graph.connections || []

      if (backend === 'runtime') {
        const response = await fetch(`${requested}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brain: { nodes, connections },
            memory,
            knowledgeDir: knowledgePath,
            stream: true,
            ...(hasServers ? { mcpConfig: mcpConfig.servers } : {}),
          }),
        })
        const contentType = response.headers.get('content-type') || ''
        // SSE streaming response — forward events live, resolve on the final frame.
        if (response.ok && contentType.includes('text/event-stream')) {
          if (!response.body) throw new Error('Runtime stream returned no body.')
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let result = null
          let error = null
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const frames = buffer.split('\n\n')
            buffer = frames.pop() ?? ''
            for (const frame of frames) {
              for (const line of frame.split('\n')) {
                if (!line.startsWith('data:')) continue
                let payload
                try {
                  payload = JSON.parse(line.slice(5).trim())
                } catch {
                  continue
                }
                if (payload.type === 'event') {
                  if (typeof onEvent === 'function') onEvent(payload.event)
                } else if (payload.type === 'log') {
                  if (typeof onLog === 'function') onLog(payload.entry)
                } else if (payload.type === 'token') {
                  if (typeof onToken === 'function') onToken(payload.token)
                } else if (payload.type === 'done') {
                  if (payload.error) error = payload.error
                  else result = payload.result
                }
              }
            }
          }
          if (error) throw new Error(error)
          if (!result) throw new Error('Runtime stream ended without a result.')
          return result
        }
        const data = await response.json().catch(() => ({}))
        if (!response.ok || data.ok === false) {
          throw new Error(data.error || `Runtime HTTP ${response.status}`)
        }
        return data
      }

      return core.executeBrain({
        nodes,
        connections,
        memory,
        knowledgeDir: knowledgePath,
        mcp: localMcp,
        onLog,
        onToken,
        onEvent,
      })
    },
    async listMcp() {
      if (!mcpClient) return { file: null, servers: [], tools: {} }
      if (backend === 'runtime') {
        try {
          const response = await fetch(`${requested}/mcp`)
          if (response.ok) return await response.json()
        } catch {
          /* fall through to local */
        }
      }
      const tools = {}
      for (const name of Object.keys(mcpConfig.servers)) {
        try {
          const found = await localMcp.listTools(name)
          tools[name] = found.map((tool) => tool.name)
        } catch {
          tools[name] = []
        }
      }
      return { file: mcpConfig.file, servers: Object.keys(mcpConfig.servers), tools }
    },
    // Lists scheduled agents. Runtime backend asks GET /agents; local backend
    // scans the workspace registry for .brain files with an `agent` block.
    async agents() {
      if (backend === 'runtime') {
        try {
          const response = await fetch(`${requested}/agents`)
          if (response.ok) {
            const data = await response.json()
            return data.agents || []
          }
        } catch {
          /* fall through to local */
        }
      }
      const registryDir =
        process.env.REGISTRY_DIR ||
        path.join(process.env.WORKSPACE_DIR || path.join(process.cwd(), 'workspace'), '.registry')
      const names = fs.existsSync(registryDir) ? fs.readdirSync(registryDir) : []
      const agents = []
      for (const name of names) {
        if (!name.endsWith('.brain')) continue
        let file
        try {
          file = JSON.parse(fs.readFileSync(path.join(registryDir, name), 'utf8'))
        } catch {
          continue
        }
        if (!file || !file.agent) continue
        agents.push({
          id: file.id || name,
          name: file.name || name,
          file: name,
          enabled: Boolean(file.agent.enabled),
          schedule: { cron: file.agent.schedule?.cron || '0 9 * * *', timezone: file.agent.schedule?.timezone || 'UTC' },
          status: 'idle',
          nodeCount: file.graph?.nodes?.length || 0,
        })
      }
      return agents
    },
    // Triggers a manual agent run via the runtime daemon.
    async runAgent(brainRef) {
      if (backend !== 'runtime') throw new Error('/agent run needs the Runtime backend (--runtime).')
      const response = await fetch(
        `${requested}/agents/${encodeURIComponent(brainRef)}/run`,
        { method: 'POST' },
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || `Runtime HTTP ${response.status}`)
      }
      return data
    },
  }
}

// Pulls the human-readable output from the output node's result, falling back
// to the first non-empty node result for brains without an output node.
export function extractOutput(result, brain) {
  const outputs = result?.outputs || {}
  for (const node of brain.graph.nodes || []) {
    if (node.type === 'output') {
      const value = outputs[node.id]?.result
      if (value !== undefined) {
        return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
      }
    }
  }
  const first = Object.values(outputs).find((entry) => entry && entry.result !== undefined)
  if (first) return typeof first.result === 'string' ? first.result : JSON.stringify(first.result, null, 2)
  return null
}

export { resolveBrainCore }
