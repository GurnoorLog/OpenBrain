import type { Brain, EntityId } from '../domain'
import { BrainNotFoundError } from './errors'

// Persistence port. The BrainManager and the rest of the domain never touch
// storage directly; future adapters (local storage, cloud, database,
// marketplace) implement this interface.
export interface BrainRepository {
  readonly id: string
  save(brain: Brain): Promise<void>
  load(brainId: EntityId): Promise<Brain>
  list(): Promise<readonly Brain[]>
  delete(brainId: EntityId): Promise<void>
  exists(brainId: EntityId): Promise<boolean>
}

export class InMemoryBrainRepository implements BrainRepository {
  readonly id = 'in-memory'

  private readonly store = new Map<EntityId, Brain>()

  async save(brain: Brain): Promise<void> {
    this.store.set(brain.id, brain)
  }

  async load(brainId: EntityId): Promise<Brain> {
    const brain = this.store.get(brainId)
    if (!brain) throw new BrainNotFoundError(brainId)
    return brain
  }

  async list(): Promise<readonly Brain[]> {
    return [...this.store.values()]
  }

  async delete(brainId: EntityId): Promise<void> {
    if (!this.store.delete(brainId)) {
      throw new BrainNotFoundError(brainId)
    }
  }

  async exists(brainId: EntityId): Promise<boolean> {
    return this.store.has(brainId)
  }
}
