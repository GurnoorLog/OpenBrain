export type EntityId = string

export type Timestamp = string

export type JsonPrimitive = string | number | boolean | null

export interface JsonObject {
  readonly [key: string]: JsonValue
}

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[]

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool' | 'function'

export interface TokenUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly totalTokens: number
}

export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: JsonObject
}

export interface ToolCall {
  readonly id: string
  readonly name: string
  readonly arguments: JsonObject
}

export interface Attachment {
  readonly id: EntityId
  readonly kind: 'image' | 'audio' | 'video' | 'file'
  readonly mimeType: string
  readonly uri: string
  readonly metadata?: Readonly<Record<string, JsonValue>>
}

// Metadata that any persisted record can carry (timestamps, tags, notes).
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
