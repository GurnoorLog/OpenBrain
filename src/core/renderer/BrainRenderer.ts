import type { Viewport } from '@xyflow/react'
import type { Brain, BrainNode, NodePosition } from '../domain'
import { NodeRenderer, type RenderedBrainNode } from './NodeRenderer'
import { EdgeRenderer, type RenderedBrainEdge } from './EdgeRenderer'
import {
  LayoutEngine,
  type LayoutConfig,
  type LayoutMode,
  type LayoutOutput,
} from './LayoutEngine'
import { PositionResolver } from './PositionResolver'
import { SelectionManager, type BoxSelectionRect } from './SelectionManager'
import { ViewportManager } from './ViewportManager'
import {
  RendererEventType,
  createRendererEvent,
  type RendererEventBus,
} from './RendererEvents'

export interface RenderResult {
  readonly nodes: RenderedBrainNode[]
  readonly edges: RenderedBrainEdge[]
}

export interface BrainRenderOptions {
  readonly mode?: LayoutMode
  readonly layout?: Partial<LayoutConfig>
  readonly positions?: Map<string, NodePosition>
  readonly selectedNodeIds?: readonly string[]
}

export interface ResolvedLayout {
  readonly positions: Map<string, NodePosition>
  readonly order: readonly string[]
}

// The single entry point for turning an immutable Brain into React Flow
// nodes and edges. Every operation is a pure transformation of the input:
// the Brain is never mutated, executed, or persisted here. This is the only
// layer that knows React Flow exists.
export class BrainRenderer {
  readonly nodeRenderer = new NodeRenderer()
  readonly edgeRenderer = new EdgeRenderer()
  readonly layoutEngine = new LayoutEngine()
  readonly positionResolver = new PositionResolver(this.layoutEngine)
  readonly selectionManager: SelectionManager
  readonly viewportManager: ViewportManager

  constructor(readonly events: RendererEventBus) {
    this.selectionManager = new SelectionManager(events)
    this.viewportManager = new ViewportManager(events)
  }

  resolveLayout(brain: Brain, mode: LayoutMode = 'grid', config?: Partial<LayoutConfig>): ResolvedLayout {
    const output: LayoutOutput = this.layoutEngine.layout({ nodes: brain.nodes, edges: brain.edges, config }, mode)
    return output
  }

  render(brain: Brain, options: BrainRenderOptions = {}): RenderResult {
    const layout =
      options.positions ??
      this.positionResolver.resolvePositions(brain.nodes, brain.edges, {
        mode: options.mode ?? 'grid',
        spacing: options.layout?.spacing,
        start: options.layout?.start,
      })

    const selected = new Set(options.selectedNodeIds ?? [])
    const nodes: RenderedBrainNode[] = brain.nodes.map((brainNode) => {
      const node = this.nodeRenderer.renderNode(brainNode)
      const position = layout.get(brainNode.id)
      if (position) {
        node.position = position
      }
      if (selected.has(brainNode.id)) {
        node.selected = true
      }
      return node
    })
    const edges = this.edgeRenderer.renderEdges(brain.edges)

    this.emitBrainRendered(brain.id, nodes, edges)
    for (const node of nodes) {
      this.emitNodeRendered(node)
    }
    for (const edge of edges) {
      this.emitEdgeRendered(edge)
    }
    return { nodes, edges }
  }

  // The renderer holds the mapping from brain status to an update event;
  // a re-render triggered by a status change emits an update.
  renderUpdated(brain: Brain, options: BrainRenderOptions = {}): RenderResult {
    const result = this.render(brain, options)
    const changedNodeIds = brain.nodes.map((node) => node.id)
    if (this.events) {
      this.events.emit(
        createRendererEvent(RendererEventType.BrainUpdated, {
          brainId: brain.id,
          changedNodeIds,
        }),
      )
    }
    return result
  }

  fitView(brain: Brain, width: number, height: number, padding?: number): Viewport {
    return this.viewportManager.fitToNodes(brain.nodes, width, height, padding)
  }

  selectNode(id: string): void {
    this.selectionManager.select(id)
  }

  clearSelection(): void {
    this.selectionManager.clear()
  }

  selectBox(nodes: readonly BrainNode[], rect: BoxSelectionRect): void {
    const rendered = this.nodeRenderer.renderNodes(nodes)
    this.selectionManager.selectBox(rendered, rect)
  }

  private emitBrainRendered(brainId: string, nodes: RenderedBrainNode[], edges: RenderedBrainEdge[]): void {
    if (!this.events) return
    this.events.emit(
      createRendererEvent(RendererEventType.BrainRendered, {
        brainId,
        nodeCount: nodes.length,
        edgeCount: edges.length,
      }),
    )
  }

  private emitNodeRendered(node: RenderedBrainNode): void {
    if (!this.events) return
    this.events.emit(
      createRendererEvent(RendererEventType.NodeRendered, {
        nodeId: node.id,
        nodeType: node.data.capability,
      }),
    )
  }

  private emitEdgeRendered(edge: RenderedBrainEdge): void {
    if (!this.events) return
    this.events.emit(
      createRendererEvent(RendererEventType.EdgeRendered, {
        edgeId: edge.id,
      }),
    )
  }
}
