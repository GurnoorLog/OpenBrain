#!/usr/bin/env node
'use strict'

// ============================================================
// OpenBrain CLI
// ------------------------------------------------------------
//   brain init [dir]            scaffold a new .brain project file
//   brain open <file.brain>     validate + summarize a brain file
//   brain run <file.brain>      execute the brain (uses the shared executor)
//   brain export <file.brain>   pretty-print / normalize a .brain file
//   brain validate <file.brain> check structure and edges
//   brain doctor                check runtime, keys, Docker, services
//   brain plugins [dir]         list + validate installed plugins
//   brain logs                  show recent runtime log entries
//   brain help
//
// Zero runtime dependencies (Node 18+). Shares the same brain-core executor
// as the cloud and the Runtime, so a brain runs identically everywhere.
// ============================================================

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const MAGIC = 'openbrain/brain'
const VERSION = 1

// ---------------------------------------------------------------------------
function usage() {
  console.log(`OpenBrain CLI

Usage: brain <command> [options]

  init [dir]                 scaffold a new .brain project file
  open <file.brain>          validate + summarize a brain file
  run <file.brain>           execute the brain
  export <file.brain>        normalize/pretty-print a brain file
  validate <file.brain>      check structure and edges
  doctor                     check runtime, keys, Docker, services
  plugins [dir]              list + validate installed plugins
  logs                       show recent runtime log entries
  help                       show this help
`)
}

function readJson(file) {
  const raw = fs.readFileSync(file, 'utf8')
  return JSON.parse(raw)
}

function problemsOf(value) {
  const problems = []
  if (typeof value !== 'object' || value === null) return ['not an object']
  if (value.format !== MAGIC) problems.push(`format must be "${MAGIC}"`)
  if (value.version !== VERSION) problems.push(`unsupported version ${value.version}`)
  const nodes = value.graph?.nodes
  if (!Array.isArray(nodes)) {
    problems.push('graph.nodes must be an array')
  } else {
    const ids = new Set(nodes.map((node) => node?.id))
    for (const edge of value.graph?.connections ?? []) {
      if (!ids.has(edge?.from)) problems.push(`edge references unknown source "${edge?.from}"`)
      if (!ids.has(edge?.to)) problems.push(`edge references unknown target "${edge?.to}"`)
    }
  }
  return problems
}

function template(name) {
  return {
    format: MAGIC,
    version: VERSION,
    id: require('node:crypto').randomUUID(),
    name: name || 'My Brain',
    description: 'Scaffolded by OpenBrain CLI',
    goal: '',
    provider: { providerId: 'fireworks', model: '' },
    memory: { enabled: false, kind: 'working', scope: 'brain' },
    knowledge: { required: false, sourceTypes: [] },
    execution: { mode: 'auto' },
    graph: {
      nodes: [
        {
          id: 'input-llm',
          type: 'llm',
          x: 120,
          y: 160,
          configuration: {
            instructions:
              'You are a helpful assistant. Reply in the same language the user wrote in; be concise and genuinely useful.',
          },
        },
        { id: 'output', type: 'output', x: 480, y: 160, configuration: {} },
      ],
      connections: [
        { id: 'c1', from: 'input-llm', fromPort: 'response', to: 'output', toPort: 'result' },
      ],
    },
    dependencies: [],
    metadata: {
      exportedAt: new Date().toISOString(),
      appVersion: 'cli',
      tool: 'brain init',
    },
  }
}

// ---------------------------------------------------------------------------
async function cmdInit(args) {
  const dir = args[0] || '.'
  const name = path.basename(path.resolve(dir))
  const file = template(name)
  const target = path.join(dir, `${name.toLowerCase().replace(/[^a-z0-9-_]+/g, '-') || 'brain'}.brain`)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(target, JSON.stringify(file, null, 2) + '\n', 'utf8')
  console.log(`Created ${path.relative(process.cwd(), target)}`)
  console.log('Next: brain run "' + target + '"')
}

function cmdOpen(file) {
  const data = readJson(file)
  const problems = problemsOf(data)
  if (problems.length > 0) {
    console.error(`✗ ${file} is not a valid .brain file`)
    for (const p of problems) console.error(`  - ${p}`)
    process.exitCode = 1
    return
  }
  console.log(`name:        ${data.name}`)
  console.log(`description: ${data.description || '(none)'}`)
  console.log(`nodes:       ${data.graph.nodes.length}`)
  console.log(`connections: ${data.graph.connections.length}`)
  console.log(`provider:    ${data.provider.providerId}${data.provider.model ? ' / ' + data.provider.model : ''}`)
  console.log(`memory:      ${data.memory.enabled ? data.memory.kind + ' (' + data.memory.scope + ')' : 'disabled'}`)
  console.log(`execution:   ${data.execution.mode}`)
}

function cmdValidate(file) {
  let data
  try {
    data = readJson(file)
  } catch (error) {
    console.error(`✗ Cannot read ${file}: ${error.message}`)
    process.exitCode = 1
    return
  }
  const problems = problemsOf(data)
  if (problems.length === 0) {
    console.log(`✓ ${file} is valid (${data.graph?.nodes?.length ?? 0} nodes, ${data.graph?.connections?.length ?? 0} edges)`)
  } else {
    console.error(`✗ ${file} is invalid:`)
    for (const p of problems) console.error(`  - ${p}`)
    process.exitCode = 1
  }
}

function cmdExport(file) {
  const data = readJson(file)
  console.log(JSON.stringify(data, null, 2))
}

async function cmdRun(file, message) {
  const data = readJson(file)
  const problems = problemsOf(data)
  if (problems.length > 0) {
    console.error(`✗ ${file} is not a valid .brain file`)
    for (const p of problems) console.error(`  - ${p}`)
    process.exitCode = 1
    return
  }
  let core
  const candidates = [
    path.join(__dirname, '..', 'cloud-executor', 'brain-core.js'),
    path.join(__dirname, 'brain-core.js'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      core = require(c)
      break
    }
  }
  if (!core) {
    console.error('✗ brain-core.js not found. Run from the OpenBrain repo root.')
    process.exitCode = 1
    return
  }
  // Stamp a chat message onto the first llm node when requested.
  const nodes = data.graph.nodes.map((node) =>
    message && node.type === 'llm'
      ? { ...node, configuration: { ...(node.configuration || {}), userMessage: message } }
      : node,
  )
  console.log(`Running "${data.name}" (${nodes.length} nodes)…`)
  const startedAt = Date.now()
  try {
    const result = await core.executeBrain({
      nodes,
      connections: data.graph.connections,
      memory: '',
      composioApiKey: process.env.COMPOSIO_API_KEY || '',
      composioAccountId: process.env.COMPOSIO_ACCOUNT_ID || '',
      composioEntityId: process.env.COMPOSIO_ENTITY_ID || '',
    })
    const duration = ((Date.now() - startedAt) / 1000).toFixed(1)
    console.log(`\n✓ Finished in ${duration}s`)
    for (const entry of result.log ?? []) {
      const tag = entry.level === 'success' ? '✓' : entry.level === 'error' ? '✗' : '·'
      console.log(`  ${tag} ${entry.message}`)
    }
    const output = result.outputs?.output?.result
    if (typeof output === 'string' && output.trim() !== '') {
      console.log('\n--- output ---\n' + output)
    }
  } catch (error) {
    console.error(`✗ Run failed: ${error.message}`)
    process.exitCode = 1
  }
}

async function cmdDoctor() {
  console.log('OpenBrain doctor')
  console.log(`  node:      ${process.version}`)
  console.log(`  platform:  ${process.platform} ${process.arch}`)
  console.log(`  docker:    ${fs.existsSync('/.dockerenv') ? 'inside container' : 'host machine'}`)
  console.log(`  memory:    ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB total`)
  console.log(`  cpus:      ${os.cpus().length}`)
  console.log('')
  const checks = [
    ['FIREWORKS_API_KEY', Boolean(process.env.FIREWORKS_API_KEY), 'LLM/architect provider'],
    ['COMPOSIO_API_KEY', Boolean(process.env.COMPOSIO_API_KEY), 'GitHub / MCP tool nodes'],
    ['OLLAMA_URL', process.env.OLLAMA_URL || 'http://localhost:11434', 'local models'],
  ]
  for (const [name, set, purpose] of checks) {
    const url = typeof set === 'string' ? set : null
    const ok = set !== null && set !== undefined && set !== false && set !== ''
    console.log(`  ${ok ? '✓' : '·'} ${name}${typeof set === 'boolean' ? (set ? ' (set)' : ' (missing)') : ' = ' + url}  — ${purpose}`)
  }
  console.log('')
  // Reachability of local services.
  for (const [name, url] of [
    ['ollama', process.env.OLLAMA_URL || 'http://localhost:11434'],
    ['runtime', `http://localhost:${process.env.PORT || 8080}`],
  ]) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
      console.log(`  ✓ ${name} reachable (HTTP ${response.status})`)
    } catch {
      console.log(`  · ${name} not reachable (is it running?)`)
    }
  }
}

async function cmdPlugins(args) {
  const dir = path.resolve(args[0] || path.join(process.cwd(), 'plugins'))
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []
  const plugins = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const manifestPath = path.join(dir, entry.name, 'openbrain-plugin.json')
    if (!fs.existsSync(manifestPath)) continue
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      plugins.push({ dir: entry.name, ...manifest })
      console.log(`  ✓ ${manifest.name} (${manifest.version}) — ${manifest.description || ''}`)
      if (manifest.kind) console.log(`      kind: ${manifest.kind}, runtime: ${manifest.runtime || 'js'}`)
    } catch {
      console.log(`  ✗ ${entry.name} has an invalid manifest`)
    }
  }
  if (plugins.length === 0) console.log('  (no plugins found in ' + dir + ')')
}

async function cmdLogs() {
  const logDir = path.join(process.env.WORKSPACE_DIR || path.join(process.cwd(), 'workspace'), '.logs')
  const file = path.join(logDir, 'runtime.log')
  if (!fs.existsSync(file)) {
    console.log('No runtime log found yet. Start the Runtime and run a brain first.')
    return
  }
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
  for (const line of lines.slice(-50)) console.log(line)
}

// ---------------------------------------------------------------------------
const [, , command, ...args] = process.argv

;(async () => {
  switch (command) {
    case 'init':
      cmdInit(args)
      break
    case 'open':
      cmdOpen(args[0])
      break
    case 'run': {
      const messageIdx = args.findIndex((a) => a === '--message')
      const message = messageIdx >= 0 ? args[messageIdx + 1] : undefined
      const file = args.find((a) => !a.startsWith('--'))
      if (!file) {
        console.error('✗ usage: brain run <file.brain> [--message "…"]')
        process.exitCode = 1
      } else {
        await cmdRun(file, message)
      }
      break
    }
    case 'export':
      cmdExport(args[0])
      break
    case 'validate':
      cmdValidate(args[0])
      break
    case 'doctor':
      await cmdDoctor()
      break
    case 'plugins':
      await cmdPlugins(args)
      break
    case 'logs':
      await cmdLogs()
      break
    case 'help':
    case '-h':
    case '--help':
      usage()
      break
    default:
      usage()
      if (command) process.exitCode = 1
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
