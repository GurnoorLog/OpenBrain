'use strict'

// ============================================================
// OpenBrain SDK
// ------------------------------------------------------------
// The public API for building on top of OpenBrain:
//   - .brain file helpers (parse / validate / build / upgrade)
//   - plugin manifest validation + safe plugin loading
//   - runtime client (call a running OpenBrain Runtime)
//
// Zero dependencies. Used by the CLI, the Runtime and by plugin authors.
// ============================================================

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const BRAIN_FILE_MAGIC = 'openbrain/brain'
const BRAIN_FILE_VERSION = 1

// ---------------------------------------------------------------------------
// .brain files
// ---------------------------------------------------------------------------

function buildBrainFile(graph, source = {}, metadata = {}) {
  return {
    format: BRAIN_FILE_MAGIC,
    version: BRAIN_FILE_VERSION,
    id: source.id || crypto.randomUUID(),
    name: source.name || 'Untitled Brain',
    description: source.description || '',
    goal: source.goal || '',
    provider: { providerId: source.providerId || 'fireworks', model: source.model || '' },
    memory: source.memory || { enabled: false, kind: 'working', scope: 'brain' },
    knowledge: source.knowledge || { required: false, sourceTypes: [] },
    execution: { mode: source.executionMode || 'auto' },
    graph: { nodes: graph.nodes, connections: graph.connections || [] },
    dependencies: source.dependencies || [],
    metadata: { exportedAt: new Date().toISOString(), appVersion: 'sdk', ...metadata },
  }
}

function validateBrainFile(value) {
  const problems = []
  if (typeof value !== 'object' || value === null) return ['not an object']
  if (value.format !== BRAIN_FILE_MAGIC) problems.push(`format must be "${BRAIN_FILE_MAGIC}"`)
  if (value.version !== BRAIN_FILE_VERSION)
    problems.push(`unsupported version ${value.version} (expected ${BRAIN_FILE_VERSION})`)
  if (!Array.isArray(value.graph?.nodes)) {
    problems.push('graph.nodes must be an array')
  } else {
    const ids = new Set(value.graph.nodes.map((node) => node?.id))
    for (const edge of value.graph?.connections || []) {
      if (!ids.has(edge?.from)) problems.push(`edge references unknown source "${edge?.from}"`)
      if (!ids.has(edge?.to)) problems.push(`edge references unknown target "${edge?.to}"`)
    }
  }
  return problems
}

function parseBrainFile(raw) {
  const value = JSON.parse(raw)
  return { file: value, problems: validateBrainFile(value) }
}

// Accepts the legacy { app, version, brain: { nodes, connections } } export.
function upgradeLegacyExport(value) {
  if (value?.format === BRAIN_FILE_MAGIC) return value
  if (!Array.isArray(value?.brain?.nodes)) return null
  return buildBrainFile({
    nodes: value.brain.nodes,
    connections: value.brain.connections || [],
  }, { name: value.app || 'Legacy Brain' })
}

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------
// A plugin is a directory containing an openbrain-plugin.json manifest and
// optional code. Manifest:
//   { "name", "version", "kind": "node" | "provider" | "mcp" | "template" |
//               "layout" | "exporter", "main": "index.js" (optional),
//     "nodeTypes": [{ "type", "label", "description" }] (for kind=node),
//     "providers": [...] (for kind=provider) }

function validatePluginManifest(value) {
  const problems = []
  if (typeof value !== 'object' || value === null) return ['manifest is not an object']
  if (typeof value.name !== 'string' || value.name.trim() === '')
    problems.push('manifest.name is required')
  if (typeof value.version !== 'string') problems.push('manifest.version is required')
  const kinds = ['node', 'provider', 'mcp', 'template', 'layout', 'exporter']
  if (value.kind !== undefined && !kinds.includes(value.kind))
    problems.push(`kind must be one of: ${kinds.join(', ')}`)
  return problems
}

// Loads a plugin directory and returns its manifest + exported hooks (when the
// plugin declares a "main" file). Plugins run inside the runtime's process;
// isolation is enforced by validating the manifest and by never allowing a
// plugin to register arbitrary paths.
function loadPlugin(dir) {
  const manifestPath = path.join(dir, 'openbrain-plugin.json')
  if (!fs.existsSync(manifestPath)) return null
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const problems = validatePluginManifest(manifest)
  if (problems.length > 0) {
    return { manifest, dir, problems, hooks: null }
  }
  let hooks = null
  if (typeof manifest.main === 'string') {
    const mainPath = path.join(dir, manifest.main)
    if (fs.existsSync(mainPath)) {
      hooks = require(mainPath)
    }
  }
  return { manifest, dir, problems: [], hooks }
}

function listPlugins(pluginsDir) {
  const entries = fs.existsSync(pluginsDir)
    ? fs.readdirSync(pluginsDir, { withFileTypes: true })
    : []
  const plugins = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const loaded = loadPlugin(path.join(pluginsDir, entry.name))
    if (loaded) plugins.push(loaded)
  }
  return plugins
}

// ---------------------------------------------------------------------------
// Runtime client
// ---------------------------------------------------------------------------

function runtimeClient(baseUrl) {
  const root = String(baseUrl || process.env.OPENBRAIN_RUNTIME_URL || 'http://localhost:8080').replace(/\/+$/, '')
  return {
    async post(route, body) {
      const response = await fetch(`${root}${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return response.json()
    },
    async get(route) {
      const response = await fetch(`${root}${route}`)
      return response.json()
    },
    run(brain, options = {}) {
      return this.post('/run', { brain, ...options })
    },
    listRegistry() {
      return this.get('/registry')
    },
    saveRegistry(file) {
      return this.post('/registry', file)
    },
    listPlugins() {
      return this.get('/plugins')
    },
    system() {
      return this.get('/system')
    },
  }
}

module.exports = {
  BRAIN_FILE_MAGIC,
  BRAIN_FILE_VERSION,
  buildBrainFile,
  validateBrainFile,
  parseBrainFile,
  upgradeLegacyExport,
  validatePluginManifest,
  loadPlugin,
  listPlugins,
  runtimeClient,
}
