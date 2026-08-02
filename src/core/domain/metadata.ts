import type { EntityId, JsonValue, Timestamp } from './common'

export interface RecordMetadata {
  readonly createdAt?: Timestamp
  readonly updatedAt?: Timestamp
  readonly tags?: readonly string[]
  readonly notes?: string
  readonly custom?: Readonly<Record<string, JsonValue>>
}

export interface BrainMetadata extends RecordMetadata {
  readonly author?: string
  readonly thumbnail?: string
  readonly versionNote?: string
  readonly forkOf?: EntityId
}

export interface NodeMetadata extends RecordMetadata {
  readonly locked?: boolean
  readonly groupId?: EntityId
}

export interface EdgeMetadata extends RecordMetadata {}
