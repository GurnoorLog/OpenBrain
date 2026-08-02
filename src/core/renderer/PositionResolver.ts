import type { BrainNode, BrainEdge, NodePosition } from '../domain'
import type { LayoutConfig, LayoutMode } from './LayoutEngine'
import { LayoutEngine, DEFAULT_NODE_SPACING } from './LayoutEngine'
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from './NodeRenderer'
import { RendererLayoutError } from './RendererErrors'

export interface PositionResolverOptions {
  readonly mode?: LayoutMode
  readonly spacing?: Partial<LayoutConfig['spacing']>
  readonly start?: Partial<NodePosition>
}

// Computes absolute layout positions for a set of BrainNodes, optionally
// running collision avoidance afterwards. Pure: never mutates inputs.
export class PositionResolver {
  constructor(
    private readonly layoutEngine: LayoutEngine,
    private readonly spacing = DEFAULT_NODE_SPACING,
  ) {}

  resolvePositions(
    nodes: readonly BrainNode[],
    edges: readonly BrainEdge[],
    options: PositionResolverOptions = {},
  ): Map<string, NodePosition> {
    const spacing = { ...this.spacing, ...options.spacing }
    const start = { x: 0, y: 0, ...options.start }
    const layout = this.layoutEngine.layout({ nodes, edges, config: { spacing, start } }, options.mode)
    if (layout.positions.size !== nodes.length) {
      throw new RendererLayoutError('Layout did not return a position for every node.')
    }
    return layout.positions
  }

  // Post-pass that pushes nodes apart until no two bounding boxes overlap.
  // Uses the mode-derived spacing as the minimum gap. `maxIterations` guards
  // against pathological input. Pure: never mutates inputs.
  avoidCollisions(
    nodes: readonly BrainNode[],
    positions: Map<string, NodePosition>,
    maxIterations = 10,
  ): Map<string, NodePosition> {
    const resolved = new Map(positions)
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      let moved = false
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const first = nodes[i]!
          const second = nodes[j]!
          const firstPosition = resolved.get(first.id)
          const secondPosition = resolved.get(second.id)
          if (!firstPosition || !secondPosition) continue

          const overlapX = DEFAULT_NODE_WIDTH + this.spacing.x - Math.abs(firstPosition.x - secondPosition.x)
          const overlapY = DEFAULT_NODE_HEIGHT + this.spacing.y - Math.abs(firstPosition.y - secondPosition.y)
          if (overlapX <= 0 || overlapY <= 0) continue

          const pushX = overlapX / 2
          const pushY = overlapY / 2
          if (firstPosition.x <= secondPosition.x) {
            resolved.set(first.id, { x: firstPosition.x - pushX, y: firstPosition.y })
            resolved.set(second.id, { x: secondPosition.x + pushX, y: secondPosition.y })
          } else {
            resolved.set(first.id, { x: firstPosition.x + pushX, y: firstPosition.y })
            resolved.set(second.id, { x: secondPosition.x - pushX, y: secondPosition.y })
          }
          if (firstPosition.y <= secondPosition.y) {
            resolved.set(first.id, { x: resolved.get(first.id)!.x, y: firstPosition.y - pushY })
            resolved.set(second.id, { x: resolved.get(second.id)!.x, y: secondPosition.y + pushY })
          } else {
            resolved.set(first.id, { x: resolved.get(first.id)!.x, y: firstPosition.y + pushY })
            resolved.set(second.id, { x: resolved.get(second.id)!.x, y: secondPosition.y - pushY })
          }
          moved = true
        }
      }
      if (!moved) {
        break
      }
    }
    return resolved
  }
}
