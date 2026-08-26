import type { EntityId, Timestamp } from '../domain'
import type { Brain } from '../domain'
import { BrainLifecycleState } from '../domain'
import type { ProviderConfiguration } from '../domain'

export enum BrainEventType {
  Created = 'brain.created',
  Deleted = 'brain.deleted',
  Renamed = 'brain.renamed',
  Loaded = 'brain.loaded',
  Saved = 'brain.saved',
  Running = 'brain.running',
  Stopped = 'brain.stopped',
  Archived = 'brain.archived',
  ProviderChanged = 'brain.provider_changed',
  ActiveChanged = 'brain.active_changed',
}

export interface BrainEventBase {
  readonly id: EntityId
  readonly type: BrainEventType
  readonly brainId: EntityId
  readonly timestamp: Timestamp
  readonly lifecycle: BrainLifecycleState
}

export interface BrainCreatedEvent extends BrainEventBase {
  readonly type: BrainEventType.Created
  readonly brain: Brain
}

export interface BrainDeletedEvent extends BrainEventBase {
  readonly type: BrainEventType.Deleted
}

export interface BrainRenamedEvent extends BrainEventBase {
  readonly type: BrainEventType.Renamed
  readonly previousName: string
  readonly name: string
}

export interface BrainLoadedEvent extends BrainEventBase {
  readonly type: BrainEventType.Loaded
  readonly brain: Brain
}

export interface BrainSavedEvent extends BrainEventBase {
  readonly type: BrainEventType.Saved
  readonly brain: Brain
}

export interface BrainRunningEvent extends BrainEventBase {
  readonly type: BrainEventType.Running
  readonly brain: Brain
}

export interface BrainStoppedEvent extends BrainEventBase {
  readonly type: BrainEventType.Stopped
  readonly brain: Brain
}

export interface BrainArchivedEvent extends BrainEventBase {
  readonly type: BrainEventType.Archived
  readonly brain: Brain
}

export interface BrainProviderChangedEvent extends BrainEventBase {
  readonly type: BrainEventType.ProviderChanged
  readonly previousProvider: ProviderConfiguration
  readonly provider: ProviderConfiguration
}

export interface BrainActiveChangedEvent extends BrainEventBase {
  readonly type: BrainEventType.ActiveChanged
  readonly brain: Brain
}

export type BrainEvent =
  | BrainCreatedEvent
  | BrainDeletedEvent
  | BrainRenamedEvent
  | BrainLoadedEvent
  | BrainSavedEvent
  | BrainRunningEvent
  | BrainStoppedEvent
  | BrainArchivedEvent
  | BrainProviderChangedEvent
  | BrainActiveChangedEvent

export function createBrainEvent<Type extends BrainEvent['type']>(
  type: Type,
  brainId: EntityId,
  lifecycle: BrainLifecycleState,
  payload: Omit<Extract<BrainEvent, { type: Type }>, 'id' | 'type' | 'brainId' | 'timestamp' | 'lifecycle'>,
): Extract<BrainEvent, { type: Type }> {
  return {
    ...payload,
    id: crypto.randomUUID(),
    type,
    brainId,
    timestamp: new Date().toISOString(),
    lifecycle,
  } as Extract<BrainEvent, { type: Type }>
}

export interface BrainEventBus {
  on<E extends BrainEvent>(type: E['type'], listener: (event: E) => void): () => void
  once<E extends BrainEvent>(type: E['type'], listener: (event: E) => void): () => void
  off<E extends BrainEvent>(type: E['type'], listener: (event: E) => void): void
  emit(event: BrainEvent): void
  clear(): void
}

type AnyListener = (event: BrainEvent) => void

export class BrainEvents implements BrainEventBus {
  private readonly listeners = new Map<BrainEventType, Set<AnyListener>>()

  on<E extends BrainEvent>(type: E['type'], listener: (event: E) => void): () => void {
    const set = this.listeners.get(type) ?? new Set<AnyListener>()
    set.add(listener as AnyListener)
    this.listeners.set(type, set)
    return () => this.off(type, listener)
  }

  once<E extends BrainEvent>(type: E['type'], listener: (event: E) => void): () => void {
    const wrapper: AnyListener = (event) => {
      this.off(type, wrapper)
      listener(event as E)
    }
    this.on(type, wrapper)
    return () => this.off(type, wrapper)
  }

  off<E extends BrainEvent>(type: E['type'], listener: (event: E) => void): void {
    const set = this.listeners.get(type)
    if (!set) return
    set.delete(listener as AnyListener)
    if (set.size === 0) this.listeners.delete(type)
  }

  emit(event: BrainEvent): void {
    const set = this.listeners.get(event.type)
    if (!set) return
    for (const listener of [...set]) {
      listener(event)
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}
