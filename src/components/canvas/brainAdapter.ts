import { BrainFactory } from '../../core/brain'
import { BrainRenderer, RendererEvents } from '../../core/renderer'
import type { RenderResult } from '../../core/renderer'
import { getNodeCatalogEntry } from '../../core/architect'
import type {
  Brain,
  BrainNode as DomainBrainNode,
  BrainEdge as DomainBrainEdge,
  NodePosition,
} from '../../core/domain'
import { CAPABILITIES } from '../../core/registry'
import { useBrainStore } from '../../store/useBrainStore'
import type {
  BrainNode as LegacyBrainNode,
  Connection as LegacyConnection,
} from '../../core/types'

export interface RenderBrainInput {
  readonly nodes: readonly LegacyBrainNode[]
  readonly connections: readonly LegacyConnection[]
  readonly selectedNodeIds?: readonly string[]
}

const factory = new BrainFactory()
const events = new RendererEvents()
const renderer = new BrainRenderer(events)

function toDomainNode(node: LegacyBrainNode): DomainBrainNode {
  const def = CAPABILITIES[node.type]
  const catalog = getNodeCatalogEntry(node.type)
  return {
    id: node.id,
    type: node.type,
    title: def?.label ?? node.type,
    description: def?.description ?? 'Custom node',
    status: node.status,
    position: { x: node.x, y: node.y },
    inputs: catalog?.inputs ?? [],
    outputs: catalog?.outputs ?? [],
    configuration: node.content !== undefined ? { content: node.content } : {},
    metadata: {},
  }
}

function toDomainEdge(connection: LegacyConnection): DomainBrainEdge {
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

// Builds an immutable domain Brain from the legacy store graph. This is the
// presentation-layer bridge between the store and the renderer. The brain id
// mirrors the open project id so per-project features (like cross-run memory)
// key off the same value.
export function toDomainBrain(
  nodes: readonly LegacyBrainNode[],
  connections: readonly LegacyConnection[],
): Brain {
  const state = useBrainStore.getState()
  const brain = factory.create({
    name: 'canvas-brain',
    templateSpec: {
      name: 'canvas-brain',
      description: 'Live canvas graph',
      nodes: nodes.map(toDomainNode),
      edges: connections.filter((c) => c.id && c.from && c.to).map(toDomainEdge),
    },
  })
  if (state.projectId) {
    return { ...brain, id: state.projectId }
  }
  return brain
}

// Renders the legacy store graph through the BrainRenderer. Positions are
// taken from the store (x/y) so the canvas layout stays exactly as the user
// left it; the renderer never re-layouts unless asked to.
export function renderBrain(input: RenderBrainInput): RenderResult {
  const brain = toDomainBrain(input.nodes, input.connections)
  const positions = new Map<string, NodePosition>(
    input.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
  )
  return renderer.render(brain, {
    positions,
    selectedNodeIds: input.selectedNodeIds,
  })
}
