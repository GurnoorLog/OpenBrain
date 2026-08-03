import type { Brain, BrainEdge, BrainNode as DomainBrainNode, JsonValue } from '../domain'
import { BrainFactory } from '../brain'
import { CAPABILITIES } from '../registry'
import { getNodeCatalogEntry } from '../architect'
import { createFireworksAIProvider } from '../providers/FireworksAIProvider'
import { getBrainMemoryStore } from '../memory/brainMemory'
import { TOOLS } from '../tools/toolRegistry'
import { listGuestProjects } from '../projects/guestProjectsRepository'
import type {
  BrainNode as LegacyBrainNode,
  BrainNodeSpec,
  Connection as LegacyConnection,
} from '../types'
import type { ExecutionContext } from './ExecutionContext'
import type { NodeExecutor, NodeInputs, NodeOutputs } from './NodeExecutor'
import { NodeExecutorRegistry } from './NodeExecutorRegistry'
import { ExecutionEngine } from './ExecutionEngine'
import { ToolNodeExecutor } from './ToolNodeExecutor'
import { createMockExecutors, setReportDownloadEnabled } from './MockNodeExecutor'
import { getSkill } from '../skills/skillLibrary'

function toDomainNode(node: LegacyBrainNode | BrainNodeSpec): DomainBrainNode {
  const def = CAPABILITIES[node.type]
  const catalog = getNodeCatalogEntry(node.type)
  return {
    id: node.id,
    type: node.type,
    title: def?.label ?? node.type,
    description: def?.description ?? 'Custom node',
    status: (node as LegacyBrainNode).status ?? 'idle',
    position: { x: node.x, y: node.y },
    inputs: catalog?.inputs ?? [],
    outputs: catalog?.outputs ?? [],
    configuration: {
      ...(node.content !== undefined ? { content: node.content } : {}),
      ...(node.model !== undefined ? { model: node.model } : {}),
      ...((node.configuration ?? {}) as Readonly<Record<string, JsonValue>>),
    },
    metadata: {},
  }
}

function toDomainEdge(connection: LegacyConnection): BrainEdge {
  return {
    id: connection.id,
    source: connection.from,
    sourcePort: connection.fromPort,
    target: connection.to,
    targetPort: connection.toPort,
    animated: true,
    metadata: {},
  }
}

function buildBrainFromGraph(
  brainId: string,
  nodes: readonly BrainNodeSpec[],
  connections: readonly LegacyConnection[],
  seedInput: unknown,
): Brain {
  // Seed the worker's input into the sub-brain's first llm node (same
  // mechanism the chat pill uses) so the delegated task reaches the model.
  // Seeding happens while constructing the fresh node objects because a
  // domain node's configuration is read-only once the Brain is built.
  let seeded = false
  const domainNodes = nodes.map((node) => {
    const built = toDomainNode(node)
    if (seedInput !== undefined && !seeded && built.type === 'llm') {
      seeded = true
      return {
        ...built,
        configuration: { ...built.configuration, userMessage: String(seedInput) },
      }
    }
    return built
  })
  const factory = new BrainFactory()
  const brain = factory.create({
    name: 'worker-brain',
    templateSpec: {
      name: 'worker-brain',
      description: 'Worker sub-brain',
      nodes: domainNodes,
      edges: connections.filter((c) => c.id && c.from && c.to).map(toDomainEdge),
    },
  })
  return { ...brain, id: brainId }
}

// Builds a Brain for a curated skill (SKILL_CATALOG entry): a single llm node
// whose system prompt is the skill's instructions, seeded with the delegated
// task as the user message. Skills run as their own pipeline, same as a saved
// sub-brain, but need no project row — any worker node can reference them.
function buildSkillBrain(skillId: string, seedInput: unknown): Brain {
  const factory = new BrainFactory()
  const llmId = `${skillId.replace(/[^a-z0-9-]/gi, '-')}-llm`
  const outputId = `${skillId.replace(/[^a-z0-9-]/gi, '-')}-output`
  const brain = factory.create({
    name: skillId,
    templateSpec: {
      name: skillId,
      description: 'Skill sub-brain',
      nodes: [
        {
          id: llmId,
          type: 'llm',
          title: 'Skill executor',
          description: 'Runs the skill instructions as this pipeline',
          status: 'idle',
          position: { x: 0, y: 0 },
          inputs: [],
          outputs: [{ id: 'response', label: 'Response', kind: 'text' }],
          configuration: {
            instructions: getSkill(skillId)?.instructions ?? '',
            ...(seedInput !== undefined ? { userMessage: String(seedInput) } : {}),
          },
          metadata: {},
        },
        {
          id: outputId,
          type: 'output',
          title: 'Skill output',
          description: 'Skill result',
          status: 'idle',
          position: { x: 1, y: 0 },
          inputs: [{ id: 'result', label: 'Result', kind: 'any' }],
          outputs: [],
          configuration: {},
          metadata: {},
        },
      ],
      edges: [
        {
          id: `${llmId}-${outputId}`,
          source: llmId,
          sourcePort: 'response',
          target: outputId,
          targetPort: 'result',
          animated: true,
          metadata: {},
        },
      ],
    },
  })
  return brain
}

// Real executor for a "worker" node: delegates to a reusable sub-brain — either
// a saved project graph (matched by id or name) or a curated skill (SKILL_CATALOG
// entry) — runs it as its own pipeline through a fresh ExecutionEngine, and
// returns the sub-brain's output-node result. Workers can nest — a worker brain
// may itself contain worker nodes.
export class WorkerNodeExecutor implements NodeExecutor {
  private static registry: NodeExecutorRegistry | null = null

  private static getRegistry(): NodeExecutorRegistry {
    if (this.registry) return this.registry
    const registry = new NodeExecutorRegistry()
    registry.registerAll(
      createMockExecutors({
        provider: createFireworksAIProvider(),
        memoryStore: getBrainMemoryStore(),
      }),
    )
    for (const tool of TOOLS) {
      registry.register(tool.nodeType, new ToolNodeExecutor(tool))
    }
    registry.register('worker', new WorkerNodeExecutor())
    this.registry = registry
    return registry
  }

  async execute(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    const node = context.brain.nodes.find((entry) => entry.id === context.currentNodeId)
    const configuration = node?.configuration ?? {}
    const brainRef =
      typeof configuration['brain'] === 'string' && configuration['brain'].trim() !== ''
        ? configuration['brain'].trim()
        : null
    if (!brainRef) {
      throw new Error('Worker node needs "configuration.brain" (the id or name of a saved sub-brain).')
    }
    const project = listGuestProjects().find(
      (entry) => entry.id === brainRef || entry.name === brainRef,
    )
    const seedInput = configuration['input'] !== undefined ? configuration['input'] : inputs['input']

    let brain: Brain
    let displayName: string
    if (project && project.data.brain) {
      const { nodes, connections } = project.data.brain
      if (nodes.length === 0) {
        throw new Error(`Worker sub-brain "${project.name}" is empty — save it first.`)
      }
      brain = buildBrainFromGraph(project.id, nodes, connections, seedInput)
      displayName = project.name
    } else if (getSkill(brainRef)) {
      brain = buildSkillBrain(getSkill(brainRef)!.id, seedInput)
      displayName = getSkill(brainRef)!.name
    } else {
      throw new Error(
        `Worker sub-brain "${brainRef}" was not found in saved projects or the skill library.`,
      )
    }

    // Sub-runs never auto-download a report; the outer run owns the deliverable.
    setReportDownloadEnabled(false)

    context.log(`Worker delegating to "${displayName}"…`, { nodeId: context.currentNodeId })
    const engine = new ExecutionEngine({ registry: WorkerNodeExecutor.getRegistry() })
    const onAbort = (): void => engine.stop()
    context.signal.addEventListener('abort', onAbort, { once: true })
    try {
      const result = await engine.run(brain)
      let outputValue: JsonValue | null = null
      for (const entry of brain.nodes) {
        if (entry.type !== 'output') continue
        const outputs = result.outputs.get(entry.id)
        if (outputs) {
          outputValue = (outputs['result'] as JsonValue | undefined) ?? null
        }
        break
      }
      if (result.status === 'cancelled') {
        throw new DOMException('Worker sub-brain was cancelled.', 'AbortError')
      }
      context.log(`Worker "${displayName}" finished in ${result.durationMs}ms.`, {
        level: 'success',
        nodeId: context.currentNodeId,
      })
      return { result: outputValue ?? { status: 'ok', runId: result.runId } }
    } finally {
      setReportDownloadEnabled(true)
      context.signal.removeEventListener('abort', onAbort)
    }
  }
}
