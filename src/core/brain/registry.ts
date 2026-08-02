import type { Brain, EntityId } from '../domain'
import { BrainDuplicateError, BrainNotFoundError } from './errors'
import { BrainEventType, createBrainEvent } from './events'
import type { BrainEventBus } from './events'

// Holds every open Brain. Supports multiple open brains, background brains,
// and switching the active Brain (the foundation for future multi-tab / multi
// -Brain workflows).
export class BrainRegistry {
  private readonly brains = new Map<EntityId, Brain>()
  private activeBrainId: EntityId | null = null

  constructor(private readonly events: BrainEventBus) {}

  get count(): number {
    return this.brains.size
  }

  has(brainId: EntityId): boolean {
    return this.brains.has(brainId)
  }

  get(brainId: EntityId): Brain | undefined {
    return this.brains.get(brainId)
  }

  list(): readonly Brain[] {
    return [...this.brains.values()]
  }

  register(brain: Brain): void {
    if (this.brains.has(brain.id)) {
      throw new BrainDuplicateError(brain.id)
    }
    this.brains.set(brain.id, brain)
  }

  update(brain: Brain): void {
    if (!this.brains.has(brain.id)) {
      throw new BrainNotFoundError(brain.id)
    }
    this.brains.set(brain.id, brain)
  }

  unregister(brainId: EntityId): void {
    if (!this.brains.delete(brainId)) {
      throw new BrainNotFoundError(brainId)
    }
    if (this.activeBrainId === brainId) {
      this.activeBrainId = null
    }
  }

  getActive(): Brain | null {
    return this.activeBrainId === null ? null : this.brains.get(this.activeBrainId) ?? null
  }

  setActive(brainId: EntityId): void {
    const brain = this.brains.get(brainId)
    if (!brain) {
      throw new BrainNotFoundError(brainId)
    }
    if (this.activeBrainId === brainId) return
    this.activeBrainId = brainId
    this.events.emit(createBrainEvent(BrainEventType.ActiveChanged, brain.id, brain.lifecycle, { brain }))
  }
}
