import type { BrainNodeSpec, Connection } from '../types'

// OpenBrain .brain file format (v1).
//
// Brains are first-class project files: a single JSON document that carries
// the graph, provider, memory/knowledge configuration, execution settings and
// metadata. The same shape is understood by the Desktop app, the Runtime, the
// CLI and the SDK, so a brain can be moved between machines or checked into
// version control without any OpenBrain cloud.

export const BRAIN_FILE_MAGIC = 'openbrain/brain'
export const BRAIN_FILE_VERSION = 1

export interface BrainFileGraph {
  readonly nodes: readonly BrainNodeSpec[]
  readonly connections: readonly Connection[]
}

export interface BrainFileMemory {
  readonly enabled: boolean
  readonly kind: 'working' | 'long-term' | 'episodic' | 'semantic'
  readonly scope: 'brain' | 'global' | 'shared'
}

export interface BrainFileKnowledge {
  readonly required: boolean
  readonly sourceTypes: readonly string[]
}

export interface BrainFileExecution {
  readonly mode: 'manual' | 'auto'
  readonly concurrency?: number
  readonly maxRetries?: number
}

// Optional "agent" block that turns a brain into an autonomous scheduled
// agent. When agent.enabled is true, the Runtime's agent daemon runs the brain
// on the cron schedule and surfaces its runs via GET /agents. Standard
// 5-field cron: minute hour day-of-month month day-of-week.
export interface BrainFileAgent {
  readonly enabled: boolean
  readonly schedule: {
    readonly cron: string
    readonly timezone?: string
  }
}

export interface BrainFile {
  readonly format: typeof BRAIN_FILE_MAGIC
  readonly version: typeof BRAIN_FILE_VERSION
  readonly id: string
  readonly name: string
  readonly description: string
  readonly goal: string
  readonly provider: {
    readonly providerId: string
    readonly model: string
  }
  readonly memory: BrainFileMemory
  readonly knowledge: BrainFileKnowledge
  readonly execution: BrainFileExecution
  readonly agent?: BrainFileAgent
  readonly graph: BrainFileGraph
  readonly dependencies: readonly string[]
  readonly metadata: {
    readonly exportedAt: string
    readonly exportedBy?: string
    readonly appVersion?: string
  }
}

export interface BrainFileSource {
  readonly id?: string
  readonly name?: string
  readonly description?: string
  readonly goal?: string
  readonly providerId?: string
  readonly model?: string
  readonly executionMode?: 'manual' | 'auto'
  readonly agent?: BrainFileAgent
}

// Serializes the current store graph into the .brain file shape. Pure — no
// store access, so the CLI/SDK can mirror it.
export function buildBrainFile(
  graph: BrainFileGraph,
  source: BrainFileSource = {},
  metadata: Partial<BrainFile['metadata']> = {},
): BrainFile {
  const now = new Date().toISOString()
  return {
    format: BRAIN_FILE_MAGIC,
    version: BRAIN_FILE_VERSION,
    id: source.id ?? crypto.randomUUID(),
    name: source.name ?? 'Untitled Brain',
    description: source.description ?? '',
    goal: source.goal ?? '',
    provider: {
      providerId: source.providerId ?? 'fireworks',
      model: source.model ?? '',
    },
    memory: { enabled: false, kind: 'working', scope: 'brain' },
    knowledge: { required: false, sourceTypes: [] },
    execution: { mode: source.executionMode ?? 'auto' },
    ...(source.agent ? { agent: source.agent } : {}),
    graph: {
      nodes: graph.nodes.map((node) => ({ ...node })),
      connections: graph.connections.map((connection) => ({ ...connection })),
    },
    dependencies: [],
    metadata: {
      exportedAt: now,
      appVersion: 'desktop',
      ...metadata,
    },
  }
}

// Rejects anything that is not a well-formed .brain document. Returns the list
// of problems; empty array means valid.
export function validateBrainFile(value: unknown): string[] {
  const problems: string[] = []
  if (typeof value !== 'object' || value === null) {
    return ['Not an object.']
  }
  const file = value as Record<string, unknown>
  if (file['format'] !== BRAIN_FILE_MAGIC) {
    problems.push(`format must be "${BRAIN_FILE_MAGIC}".`)
  }
  if (file['version'] !== BRAIN_FILE_VERSION) {
    problems.push(`Unsupported version ${String(file['version'])} (expected ${BRAIN_FILE_VERSION}).`)
  }
  const graph = file['graph'] as Record<string, unknown> | undefined
  if (!graph || !Array.isArray(graph['nodes'])) {
    problems.push('graph.nodes must be an array.')
  } else {
    const ids = new Set((graph['nodes'] as readonly { id?: unknown }[]).map((node) => node?.id))
    const connections = Array.isArray(graph['connections']) ? (graph['connections'] as readonly { from?: unknown; to?: unknown }[]) : []
    for (const edge of connections) {
      if (!ids.has(edge?.from)) problems.push(`Edge references unknown source "${String(edge?.from)}".`)
      if (!ids.has(edge?.to)) problems.push(`Edge references unknown target "${String(edge?.to)}".`)
    }
  }
  return problems
}

// Parses a .brain file string. Throws on malformed JSON; returns validation
// problems separately so the caller can show them without losing the graph.
export function parseBrainFile(raw: string): { file: BrainFile; problems: string[] } {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid .brain JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  const problems = validateBrainFile(value)
  return { file: value as BrainFile, problems }
}

// Accepts a legacy brain.json export (the pre-.brain app:app/version/brain
// shape) and upgrades it to a .brain file, so old exports still open.
export function upgradeLegacyExport(value: unknown): BrainFile | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (record['format'] === BRAIN_FILE_MAGIC) return value as BrainFile
  const brain = record['brain'] as Record<string, unknown> | undefined
  if (!brain || !Array.isArray(brain['nodes'])) return null
  return buildBrainFile(
    {
      nodes: brain['nodes'] as readonly BrainNodeSpec[],
      connections: Array.isArray(brain['connections'])
        ? (brain['connections'] as readonly Connection[])
        : [],
    },
    { name: typeof record['app'] === 'string' ? record['app'] : 'Legacy Brain' },
  )
}
