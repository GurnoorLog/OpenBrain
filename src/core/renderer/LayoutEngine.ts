import type { BrainEdge, BrainNode, NodePosition } from '../domain'
import { RendererLayoutError } from './RendererErrors'

export const DEFAULT_NODE_SPACING = { x: 260, y: 140 }

export type LayoutMode = 'grid' | 'horizontal' | 'vertical' | 'tree'

export type LayoutDirection = 'row-major' | 'column-major'

export interface LayoutConfig {
  readonly spacing: { readonly x: number; readonly y: number }
  readonly direction: LayoutDirection
  readonly start: NodePosition
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  spacing: DEFAULT_NODE_SPACING,
  direction: 'row-major',
  start: { x: 0, y: 0 },
}

export interface LayoutInput {
  readonly nodes: readonly BrainNode[]
  readonly edges: readonly BrainEdge[]
  readonly config?: Partial<LayoutConfig>
}

export interface LayoutOutput {
  readonly positions: Map<string, NodePosition>
  readonly order: readonly string[]
}

const EMPTY_OUTPUT: LayoutOutput = { positions: new Map(), order: [] }

const MIN_COLUMN_WIDTH = 4
const MIN_ROW_HEIGHT = 4

// Pure layout algorithms. Position a BrainNode set into a grid, a row, a
// column, or a dependency tree (rooted at the entry node). Never mutates
// inputs. `layoutGrid` also supports `edges` for future DAG-aware packing.
export class LayoutEngine {
  layout(input: LayoutInput, mode: LayoutMode = 'grid'): LayoutOutput {
    const config = this.mergeConfig(input.config)
    const { nodes, edges } = input
    if (nodes.length === 0) {
      return EMPTY_OUTPUT
    }
    switch (mode) {
      case 'grid':
        return this.layoutGrid({ nodes, edges }, config)
      case 'horizontal':
        return this.layoutHorizontal(nodes, config)
      case 'vertical':
        return this.layoutVertical(nodes, config)
      case 'tree':
        return this.layoutTree({ nodes, edges }, config)
      default:
        throw new RendererLayoutError(`Unknown layout mode "${mode}".`)
    }
  }

  layoutGrid(input: LayoutInput, config: LayoutConfig = DEFAULT_LAYOUT_CONFIG): LayoutOutput {
    const { nodes } = input
    if (nodes.length === 0) {
      return EMPTY_OUTPUT
    }
    const columnCount = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
    const positions = new Map<string, NodePosition>()
    nodes.forEach((node, index) => {
      const column = index % columnCount
      const row = Math.floor(index / columnCount)
      positions.set(node.id, {
        x: config.start.x + column * config.spacing.x,
        y: config.start.y + row * config.spacing.y,
      })
    })
    return { positions, order: nodes.map((node) => node.id) }
  }

  layoutHorizontal(nodes: readonly BrainNode[], config: LayoutConfig = DEFAULT_LAYOUT_CONFIG): LayoutOutput {
    if (nodes.length === 0) {
      return EMPTY_OUTPUT
    }
    const positions = new Map<string, NodePosition>()
    nodes.forEach((node, index) => {
      positions.set(node.id, {
        x: config.start.x + index * config.spacing.x,
        y: config.start.y,
      })
    })
    return { positions, order: nodes.map((node) => node.id) }
  }

  layoutVertical(nodes: readonly BrainNode[], config: LayoutConfig = DEFAULT_LAYOUT_CONFIG): LayoutOutput {
    if (nodes.length === 0) {
      return EMPTY_OUTPUT
    }
    const positions = new Map<string, NodePosition>()
    nodes.forEach((node, index) => {
      positions.set(node.id, {
        x: config.start.x,
        y: config.start.y + index * config.spacing.y,
      })
    })
    return { positions, order: nodes.map((node) => node.id) }
  }

  layoutTree(input: LayoutInput, config: LayoutConfig = DEFAULT_LAYOUT_CONFIG): LayoutOutput {
    const { nodes, edges } = input
    if (nodes.length === 0) {
      return EMPTY_OUTPUT
    }
    const adjacency = new Map<string, string[]>()
    for (const node of nodes) {
      adjacency.set(node.id, [])
    }
    for (const edge of edges) {
      adjacency.get(edge.source)?.push(edge.target)
    }

    const roots = nodes
      .map((node) => node.id)
      .filter((id) => !edges.some((edge) => edge.target === id))
      .sort()

    const order: string[] = []
    const depth = new Map<string, number>()
    const walk = (root: string): void => {
      order.push(root)
      depth.set(root, 0)
      const queue = [root]
      let queueIndex = 0
      while (queueIndex < queue.length) {
        const current = queue[queueIndex]!
        queueIndex += 1
        const children = adjacency.get(current) ?? []
        for (const child of children) {
          if (!depth.has(child)) {
            depth.set(child, (depth.get(current) ?? 0) + 1)
            order.push(child)
            queue.push(child)
          }
        }
      }
    }
    for (const root of roots) {
      walk(root)
    }
    for (const node of nodes) {
      if (!depth.has(node.id)) {
        walk(node.id)
      }
    }

    const maxDepth = Math.max(0, ...[...depth.values()])
    const rowCount = Math.max(MIN_ROW_HEIGHT, Math.ceil((order.length + 1) / Math.max(MIN_COLUMN_WIDTH, maxDepth + 1)))
    const positions = new Map<string, NodePosition>()
    order.forEach((id, index) => {
      const column = depth.get(id) ?? 0
      const row = Math.floor(index / Math.max(MIN_COLUMN_WIDTH, rowCount))
      positions.set(id, {
        x: config.start.x + column * config.spacing.x,
        y: config.start.y + row * config.spacing.y,
      })
    })
    return { positions, order }
  }

  // Topological order of node ids: every edge points forward (source before
  // target). Unconnected nodes are appended. Kahn's algorithm.
  topologicalOrder(nodes: readonly BrainNode[], edges: readonly BrainEdge[]): readonly string[] {
    const nodeIds = nodes.map((node) => node.id)
    if (nodeIds.length === 0) {
      return []
    }
    const incoming = new Map(nodeIds.map((id) => [id, 0]))
    const adjacency = new Map(nodeIds.map((id) => [id, [] as string[]]))
    for (const edge of edges) {
      adjacency.get(edge.source)?.push(edge.target)
      incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)
    }
    const ready = nodeIds
      .filter((id) => (incoming.get(id) ?? 0) === 0)
      .sort()
      .reverse()
    const result: string[] = []
    while (ready.length > 0) {
      const id = ready.pop()!
      result.push(id)
      for (const target of adjacency.get(id) ?? []) {
        incoming.set(target, (incoming.get(target) ?? 0) - 1)
        if ((incoming.get(target) ?? 0) === 0) {
          ready.push(target)
        }
      }
    }
    return result
  }

  private mergeConfig(config?: Partial<LayoutConfig>): LayoutConfig {
    if (!config) {
      return DEFAULT_LAYOUT_CONFIG
    }
    return {
      spacing: { ...DEFAULT_LAYOUT_CONFIG.spacing, ...config.spacing },
      direction: config.direction ?? DEFAULT_LAYOUT_CONFIG.direction,
      start: { ...DEFAULT_LAYOUT_CONFIG.start, ...config.start },
    }
  }
}
