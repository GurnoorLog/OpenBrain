import type { EntityId, JsonValue, Timestamp } from './common'

export type ExecutionStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'debug'

export interface ExecutionLog {
  readonly id: EntityId
  readonly timestamp: Timestamp
  readonly nodeId: EntityId | null
  readonly level: LogLevel
  readonly message: string
  readonly durationMs?: number
  readonly data?: Readonly<Record<string, JsonValue>>
}

export interface ExecutionState {
  readonly status: ExecutionStatus
  readonly currentNodeId: EntityId | null
  readonly startTime: Timestamp | null
  readonly endTime: Timestamp | null
  readonly executionOrder: readonly EntityId[]
  readonly logs: readonly ExecutionLog[]
  readonly progress: number
}
