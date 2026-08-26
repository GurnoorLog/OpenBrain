import type { EntityId, NodeType, Timestamp } from '../domain'
import type { Viewport } from '@xyflow/react'

export enum RendererEventType {
  BrainRendered = 'renderer.brain_rendered',
  BrainUpdated = 'renderer.brain_updated',
  NodeRendered = 'renderer.node_rendered',
  EdgeRendered = 'renderer.edge_rendered',
  ViewportChanged = 'renderer.viewport_changed',
  SelectionChanged = 'renderer.selection_changed',
}

export interface RendererEventBase {
  readonly id: EntityId
  readonly type: RendererEventType
  readonly timestamp: Timestamp
}

export interface BrainRenderedEvent extends RendererEventBase {
  readonly type: RendererEventType.BrainRendered
  readonly brainId: EntityId
  readonly nodeCount: number
  readonly edgeCount: number
}

export interface BrainUpdatedEvent extends RendererEventBase {
  readonly type: RendererEventType.BrainUpdated
  readonly brainId: EntityId
  readonly changedNodeIds: readonly EntityId[]
}

export interface NodeRenderedEvent extends RendererEventBase {
  readonly type: RendererEventType.NodeRendered
  readonly nodeId: EntityId
  readonly nodeType: NodeType
}

export interface EdgeRenderedEvent extends RendererEventBase {
  readonly type: RendererEventType.EdgeRendered
  readonly edgeId: EntityId
}

export interface ViewportChangedEvent extends RendererEventBase {
  readonly type: RendererEventType.ViewportChanged
  readonly viewport: Viewport
}

export interface SelectionChangedEvent extends RendererEventBase {
  readonly type: RendererEventType.SelectionChanged
  readonly nodeIds: readonly EntityId[]
}

export type RendererEvent =
  | BrainRenderedEvent
  | BrainUpdatedEvent
  | NodeRenderedEvent
  | EdgeRenderedEvent
  | ViewportChangedEvent
  | SelectionChangedEvent

export function createRendererEvent<Type extends RendererEvent['type']>(
  type: Type,
  payload: Omit<Extract<RendererEvent, { type: Type }>, 'id' | 'type' | 'timestamp'>,
): Extract<RendererEvent, { type: Type }> {
  return {
    ...payload,
    id: crypto.randomUUID(),
    type,
    timestamp: new Date().toISOString(),
  } as Extract<RendererEvent, { type: Type }>
}

export interface RendererEventBus {
  on<E extends RendererEvent>(type: E['type'], listener: (event: E) => void): () => void
  once<E extends RendererEvent>(type: E['type'], listener: (event: E) => void): () => void
  off<E extends RendererEvent>(type: E['type'], listener: (event: E) => void): void
  emit(event: RendererEvent): void
  clear(): void
}

type AnyListener = (event: RendererEvent) => void

export class RendererEvents implements RendererEventBus {
  private readonly listeners = new Map<RendererEventType, Set<AnyListener>>()

  on<E extends RendererEvent>(type: E['type'], listener: (event: E) => void): () => void {
    const set = this.listeners.get(type) ?? new Set<AnyListener>()
    set.add(listener as AnyListener)
    this.listeners.set(type, set)
    return () => this.off(type, listener)
  }

  once<E extends RendererEvent>(type: E['type'], listener: (event: E) => void): () => void {
    const wrapper: AnyListener = (event) => {
      this.off(type, wrapper)
      listener(event as E)
    }
    this.on(type, wrapper)
    return () => this.off(type, wrapper)
  }

  off<E extends RendererEvent>(type: E['type'], listener: (event: E) => void): void {
    const set = this.listeners.get(type)
    if (!set) return
    set.delete(listener as AnyListener)
    if (set.size === 0) this.listeners.delete(type)
  }

  emit(event: RendererEvent): void {
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
