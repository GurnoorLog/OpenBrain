import { BrainLifecycleState } from '../domain'
import type { Brain, EntityId, ProviderConfiguration } from '../domain'
import { BrainNotFoundError, BrainValidationError } from './errors'
import { BrainEventType, createBrainEvent } from './events'
import type { BrainEventBus } from './events'
import type { BrainFactory, CreateBrainInput, DuplicateBrainInput } from './factory'
import { BrainLifecycle } from './lifecycle'
import type { BrainRegistry } from './registry'
import type { BrainRepository } from './repository'
import type { BrainSerializer } from './serializer'

export interface BrainManagerDependencies {
  readonly factory: BrainFactory
  readonly repository: BrainRepository
  readonly serializer: BrainSerializer
  readonly registry: BrainRegistry
  readonly events: BrainEventBus
}

// Application service orchestrating the Brain lifecycle. All mutations flow
// through here so the registry, persistence, and event emission stay in sync.
export class BrainManager {
  constructor(private readonly deps: BrainManagerDependencies) {}

  async create(input: CreateBrainInput): Promise<Brain> {
    const brain = this.deps.factory.create(input)
    this.deps.registry.register(brain)
    await this.deps.repository.save(brain)
    this.deps.events.emit(createBrainEvent(BrainEventType.Created, brain.id, brain.lifecycle, { brain }))
    return brain
  }

  async load(brainId: EntityId): Promise<Brain> {
    const cached = this.deps.registry.get(brainId)
    if (cached) return cached
    const brain = await this.deps.repository.load(brainId)
    this.deps.registry.register(brain)
    this.deps.events.emit(createBrainEvent(BrainEventType.Loaded, brain.id, brain.lifecycle, { brain }))
    return brain
  }

  async duplicate(brainId: EntityId, input: DuplicateBrainInput = {}): Promise<Brain> {
    const source = await this.load(brainId)
    const copy = this.deps.factory.duplicate(source, input)
    this.deps.registry.register(copy)
    await this.deps.repository.save(copy)
    this.deps.events.emit(createBrainEvent(BrainEventType.Created, copy.id, copy.lifecycle, { brain: copy }))
    return copy
  }

  async delete(brainId: EntityId): Promise<void> {
    const brain = this.require(brainId)
    this.deps.registry.unregister(brainId)
    await this.deps.repository.delete(brainId)
    this.deps.events.emit(createBrainEvent(BrainEventType.Deleted, brainId, brain.lifecycle, {}))
  }

  async save(brainId: EntityId): Promise<Brain> {
    const brain = this.require(brainId)
    await this.deps.repository.save(brain)
    this.deps.events.emit(createBrainEvent(BrainEventType.Saved, brain.id, brain.lifecycle, { brain }))
    return brain
  }

  async rename(brainId: EntityId, name: string): Promise<Brain> {
    const brain = this.require(brainId)
    if (name.trim().length === 0) {
      throw new BrainValidationError('Brain name cannot be empty.')
    }
    const updated: Brain = { ...brain, name, updatedAt: new Date().toISOString() }
    await this.persist(updated)
    this.deps.events.emit(
      createBrainEvent(BrainEventType.Renamed, updated.id, updated.lifecycle, {
        previousName: brain.name,
        name,
      }),
    )
    return updated
  }

  async changeProvider(brainId: EntityId, provider: ProviderConfiguration): Promise<Brain> {
    const brain = this.require(brainId)
    const updated: Brain = {
      ...brain,
      provider,
      model: provider.model,
      settings: { ...brain.settings, provider },
      updatedAt: new Date().toISOString(),
    }
    await this.persist(updated)
    this.deps.events.emit(
      createBrainEvent(BrainEventType.ProviderChanged, updated.id, updated.lifecycle, {
        previousProvider: brain.provider,
        provider,
      }),
    )
    return updated
  }

  // ---- lifecycle transitions ----

  async transitionTo(brainId: EntityId, next: BrainLifecycleState): Promise<Brain> {
    const brain = this.require(brainId)
    const lifecycle = new BrainLifecycle(brain.lifecycle)
    lifecycle.transitionTo(next)
    const updated: Brain = { ...brain, lifecycle: next, updatedAt: new Date().toISOString() }
    await this.persist(updated)

    if (next === BrainLifecycleState.Running) {
      this.deps.events.emit(createBrainEvent(BrainEventType.Running, updated.id, next, { brain: updated }))
    } else if (next === BrainLifecycleState.Archived) {
      this.deps.events.emit(createBrainEvent(BrainEventType.Archived, updated.id, next, { brain: updated }))
    } else if (brain.lifecycle === BrainLifecycleState.Running) {
      this.deps.events.emit(createBrainEvent(BrainEventType.Stopped, updated.id, next, { brain: updated }))
    }
    return updated
  }

  async start(brainId: EntityId): Promise<Brain> {
    return this.transitionTo(brainId, BrainLifecycleState.Running)
  }

  async stop(brainId: EntityId): Promise<Brain> {
    return this.transitionTo(brainId, BrainLifecycleState.Idle)
  }

  async pause(brainId: EntityId): Promise<Brain> {
    return this.transitionTo(brainId, BrainLifecycleState.Paused)
  }

  async resume(brainId: EntityId): Promise<Brain> {
    return this.transitionTo(brainId, BrainLifecycleState.Running)
  }

  async archive(brainId: EntityId): Promise<Brain> {
    return this.transitionTo(brainId, BrainLifecycleState.Archived)
  }

  async markError(brainId: EntityId): Promise<Brain> {
    return this.transitionTo(brainId, BrainLifecycleState.Error)
  }

  async markReady(brainId: EntityId): Promise<Brain> {
    return this.transitionTo(brainId, BrainLifecycleState.Ready)
  }

  // ---- active brain / registry ----

  get(brainId: EntityId): Brain | undefined {
    return this.deps.registry.get(brainId)
  }

  listOpen(): readonly Brain[] {
    return this.deps.registry.list()
  }

  getActive(): Brain | null {
    return this.deps.registry.getActive()
  }

  setActive(brainId: EntityId): void {
    this.deps.registry.setActive(brainId)
  }

  private async persist(brain: Brain): Promise<void> {
    this.deps.registry.update(brain)
    await this.deps.repository.save(brain)
  }

  private require(brainId: EntityId): Brain {
    const brain = this.deps.registry.get(brainId)
    if (!brain) throw new BrainNotFoundError(brainId)
    return brain
  }
}
