import type { EntityId } from '../domain'
import type { RenderedBrainNode } from './NodeRenderer'
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from './NodeRenderer'
import { RendererEventType, createRendererEvent, type RendererEventBus } from './RendererEvents'

export interface BoxSelectionRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

// Tracks selected node ids. Serves single selection, additive multi-selection
// (Shift), and box selection. Stateless: selection state only lives here and
// is reported back through events.
export class SelectionManager {
  private selectedIds = new Set<EntityId>()

  constructor(private readonly events?: RendererEventBus) {}

  getSelection(): readonly EntityId[] {
    return [...this.selectedIds]
  }

  has(id: EntityId): boolean {
    return this.selectedIds.has(id)
  }

  select(id: EntityId): void {
    if (this.selectedIds.size === 1 && this.selectedIds.has(id)) {
      return
    }
    this.selectedIds.clear()
    this.selectedIds.add(id)
    this.emitChanged()
  }

  selectAdditive(id: EntityId): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id)
    } else {
      this.selectedIds.add(id)
    }
    this.emitChanged()
  }

  clear(): void {
    if (this.selectedIds.size === 0) {
      return
    }
    this.selectedIds.clear()
    this.emitChanged()
  }

  nodesInBox(nodes: readonly RenderedBrainNode[], rect: BoxSelectionRect): readonly EntityId[] {
    return nodes
      .filter((node) => {
        const x = node.position.x
        const y = node.position.y
        return (
          x < rect.x + rect.width &&
          x + DEFAULT_NODE_WIDTH > rect.x &&
          y < rect.y + rect.height &&
          y + DEFAULT_NODE_HEIGHT > rect.y
        )
      })
      .map((node) => node.id)
  }

  // Box selection: fully additive (keeps any previously selected nodes).
  selectBox(nodes: readonly RenderedBrainNode[], rect: BoxSelectionRect): void {
    for (const id of this.nodesInBox(nodes, rect)) {
      this.selectedIds.add(id)
    }
    this.emitChanged()
  }

  private emitChanged(): void {
    if (!this.events) return
    this.events.emit(
      createRendererEvent(RendererEventType.SelectionChanged, { nodeIds: this.getSelection() }),
    )
  }
}
