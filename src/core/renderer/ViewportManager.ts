import type { Viewport } from '@xyflow/react'
import type { BrainNode, NodePosition } from '../domain'
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from './NodeRenderer'
import { RendererEventType, createRendererEvent, type RendererEventBus } from './RendererEvents'
import { RendererViewportError } from './RendererErrors'

export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }
export const DEFAULT_ZOOM = 1
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 2

// A viewport that centers the whole Brain graph. Consumed by the React Flow
// presentation layer, which is the only place that knows how to apply it.
export class ViewportManager {
  constructor(private readonly events?: RendererEventBus) {}

  fitToNodes(
    nodes: readonly BrainNode[],
    width: number,
    height: number,
    padding = 0.25,
  ): Viewport {
    if (nodes.length === 0) {
      return DEFAULT_VIEWPORT
    }
    if (width <= 0 || height <= 0) {
      throw new RendererViewportError('Cannot fit a Brain into a zero-size viewport.')
    }
    const minX = Math.min(...nodes.map((node) => node.position.x))
    const minY = Math.min(...nodes.map((node) => node.position.y))
    const maxX = Math.max(...nodes.map((node) => node.position.x + DEFAULT_NODE_WIDTH))
    const maxY = Math.max(...nodes.map((node) => node.position.y + DEFAULT_NODE_HEIGHT))
    const contentWidth = maxX - minX
    const contentHeight = maxY - minY
    const availableWidth = width * (1 - padding)
    const availableHeight = height * (1 - padding)
    const zoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min(availableWidth / contentWidth, availableHeight / contentHeight)),
    )
    const centerX = minX + contentWidth / 2
    const centerY = minY + contentHeight / 2
    const viewport: Viewport = {
      x: width / 2 - centerX * zoom,
      y: height / 2 - centerY * zoom,
      zoom,
    }
    this.emitChanged(viewport)
    return viewport
  }

  centerAt(position: NodePosition, width: number, height: number, zoom = DEFAULT_ZOOM): Viewport {
    const viewport: Viewport = {
      x: width / 2 - position.x * zoom,
      y: height / 2 - position.y * zoom,
      zoom,
    }
    this.emitChanged(viewport)
    return viewport
  }

  private emitChanged(viewport: Viewport): void {
    if (!this.events) return
    this.events.emit(createRendererEvent(RendererEventType.ViewportChanged, { viewport }))
  }
}
