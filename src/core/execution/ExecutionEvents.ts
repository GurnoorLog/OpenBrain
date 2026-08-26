import type { EntityId, NodeType, Timestamp } from '../domain'
import type { ExecutionStatus } from '../domain'
import type { NodeOutputs } from './NodeExecutor'

export enum ExecutionEventType {
  Started = 'execution.started',
  NodeStarted = 'execution.node_started',
  NodeCompleted = 'execution.node_completed',
  NodeFailed = 'execution.node_failed',
  Completed = 'execution.completed',
  Failed = 'execution.failed',
}

export interface ExecutionEventBase {
  readonly id: EntityId
  readonly type: ExecutionEventType
  readonly runId: EntityId
  readonly brainId: EntityId
  readonly timestamp: Timestamp
}

export interface ExecutionStartedEvent extends ExecutionEventBase {
  readonly type: ExecutionEventType.Started
  readonly executionOrder: readonly EntityId[]
}

export interface ExecutionNodeStartedEvent extends ExecutionEventBase {
  readonly type: ExecutionEventType.NodeStarted
  readonly nodeId: EntityId
  readonly nodeType: NodeType
}

export interface ExecutionNodeCompletedEvent extends ExecutionEventBase {
  readonly type: ExecutionEventType.NodeCompleted
  readonly nodeId: EntityId
  readonly nodeType: NodeType
  readonly durationMs: number
  readonly outputs: NodeOutputs
}

export interface ExecutionNodeFailedEvent extends ExecutionEventBase {
  readonly type: ExecutionEventType.NodeFailed
  readonly nodeId: EntityId
  readonly nodeType: NodeType
  readonly durationMs: number
  readonly error: string
}

export interface ExecutionCompletedEvent extends ExecutionEventBase {
  readonly type: ExecutionEventType.Completed
  readonly durationMs: number
  readonly progress: number
}

export interface ExecutionFailedEvent extends ExecutionEventBase {
  readonly type: ExecutionEventType.Failed
  readonly status: Extract<ExecutionStatus, 'failed' | 'cancelled'>
  readonly nodeId: EntityId | null
  readonly error: string
}

export type ExecutionEvent =
  | ExecutionStartedEvent
  | ExecutionNodeStartedEvent
  | ExecutionNodeCompletedEvent
  | ExecutionNodeFailedEvent
  | ExecutionCompletedEvent
  | ExecutionFailedEvent

export function createExecutionEvent<Type extends ExecutionEvent['type']>(
  type: Type,
  runId: EntityId,
  brainId: EntityId,
  payload: Omit<Extract<ExecutionEvent, { type: Type }>, 'id' | 'type' | 'runId' | 'brainId' | 'timestamp'>,
): Extract<ExecutionEvent, { type: Type }> {
  return {
    ...payload,
    id: crypto.randomUUID(),
    type,
    runId,
    brainId,
    timestamp: new Date().toISOString(),
  } as Extract<ExecutionEvent, { type: Type }>
}

export interface ExecutionEventBus {
  on<E extends ExecutionEventType>(type: E, listener: (event: Extract<ExecutionEvent, { type: E }>) => void): () => void
  once<E extends ExecutionEventType>(type: E, listener: (event: Extract<ExecutionEvent, { type: E }>) => void): () => void
  off<E extends ExecutionEventType>(type: E, listener: (event: Extract<ExecutionEvent, { type: E }>) => void): void
  emit(event: ExecutionEvent): void
  clear(): void
}

type AnyListener = (event: ExecutionEvent) => void

export class ExecutionEvents implements ExecutionEventBus {
  private readonly listeners = new Map<ExecutionEventType, Set<AnyListener>>()

  on<E extends ExecutionEventType>(type: E, listener: (event: Extract<ExecutionEvent, { type: E }>) => void): () => void {
    const set = this.listeners.get(type) ?? new Set<AnyListener>()
    set.add(listener as AnyListener)
    this.listeners.set(type, set)
    return () => this.off(type, listener)
  }

  once<E extends ExecutionEventType>(type: E, listener: (event: Extract<ExecutionEvent, { type: E }>) => void): () => void {
    const wrapper: AnyListener = (event) => {
      this.off(type, wrapper)
      listener(event as Extract<ExecutionEvent, { type: E }>)
    }
    this.on(type, wrapper)
    return () => this.off(type, wrapper)
  }

  off<E extends ExecutionEventType>(type: E, listener: (event: Extract<ExecutionEvent, { type: E }>) => void): void {
    const set = this.listeners.get(type)
    if (!set) return
    set.delete(listener as AnyListener)
    if (set.size === 0) this.listeners.delete(type)
  }

  emit(event: ExecutionEvent): void {
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
