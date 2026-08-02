import type { EntityId, Timestamp } from '../domain'
import type { FineTuneJobSpec, FineTuneJobStatus } from './FineTuneJobSpec'

export enum FineTuneEventType {
  JobPlanned = 'finetune.job_planned',
  ConfirmationRequired = 'finetune.confirmation_required',
  JobStarted = 'finetune.job_started',
  JobProgress = 'finetune.job_progress',
  JobFailed = 'finetune.job_failed',
  JobCompleted = 'finetune.job_completed',
}

export interface FineTuneEventBase {
  readonly id: EntityId
  readonly type: FineTuneEventType
  readonly jobId: EntityId
  readonly timestamp: Timestamp
}

export interface FineTuneJobPlannedEvent extends FineTuneEventBase {
  readonly type: FineTuneEventType.JobPlanned
  readonly spec: FineTuneJobSpec
}

export interface FineTuneConfirmationRequiredEvent extends FineTuneEventBase {
  readonly type: FineTuneEventType.ConfirmationRequired
  readonly spec: FineTuneJobSpec
}

export interface FineTuneJobStartedEvent extends FineTuneEventBase {
  readonly type: FineTuneEventType.JobStarted
  readonly providerJobId: string
}

export interface FineTuneJobProgressEvent extends FineTuneEventBase {
  readonly type: FineTuneEventType.JobProgress
  readonly status: FineTuneJobStatus
  readonly progress: number
  readonly message: string
}

export interface FineTuneJobFailedEvent extends FineTuneEventBase {
  readonly type: FineTuneEventType.JobFailed
  readonly error: string
}

export interface FineTuneJobCompletedEvent extends FineTuneEventBase {
  readonly type: FineTuneEventType.JobCompleted
  readonly targetRepoName: string
}

export type FineTuneEvent =
  | FineTuneJobPlannedEvent
  | FineTuneConfirmationRequiredEvent
  | FineTuneJobStartedEvent
  | FineTuneJobProgressEvent
  | FineTuneJobFailedEvent
  | FineTuneJobCompletedEvent

export function createFineTuneEvent<Type extends FineTuneEvent['type']>(
  type: Type,
  jobId: EntityId,
  payload: Omit<Extract<FineTuneEvent, { type: Type }>, 'id' | 'type' | 'jobId' | 'timestamp'>,
): Extract<FineTuneEvent, { type: Type }> {
  return {
    ...payload,
    id: crypto.randomUUID(),
    type,
    jobId,
    timestamp: new Date().toISOString(),
  } as Extract<FineTuneEvent, { type: Type }>
}

export interface FineTuneEventBus {
  on<E extends FineTuneEventType>(type: E, listener: (event: Extract<FineTuneEvent, { type: E }>) => void): () => void
  once<E extends FineTuneEventType>(type: E, listener: (event: Extract<FineTuneEvent, { type: E }>) => void): () => void
  off<E extends FineTuneEventType>(type: E, listener: (event: Extract<FineTuneEvent, { type: E }>) => void): void
  emit(event: FineTuneEvent): void
  clear(): void
}

type AnyListener = (event: FineTuneEvent) => void

export class FineTuneEvents implements FineTuneEventBus {
  private readonly listeners = new Map<FineTuneEventType, Set<AnyListener>>()

  on<E extends FineTuneEventType>(type: E, listener: (event: Extract<FineTuneEvent, { type: E }>) => void): () => void {
    const set = this.listeners.get(type) ?? new Set<AnyListener>()
    set.add(listener as AnyListener)
    this.listeners.set(type, set)
    return () => this.off(type, listener)
  }

  once<E extends FineTuneEventType>(type: E, listener: (event: Extract<FineTuneEvent, { type: E }>) => void): () => void {
    const wrapper: AnyListener = (event) => {
      this.off(type, wrapper)
      listener(event as Extract<FineTuneEvent, { type: E }>)
    }
    this.on(type, wrapper)
    return () => this.off(type, wrapper)
  }

  off<E extends FineTuneEventType>(type: E, listener: (event: Extract<FineTuneEvent, { type: E }>) => void): void {
    const set = this.listeners.get(type)
    if (!set) return
    set.delete(listener as AnyListener)
    if (set.size === 0) this.listeners.delete(type)
  }

  emit(event: FineTuneEvent): void {
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
