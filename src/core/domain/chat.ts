import type { Attachment, ChatRole, EntityId, JsonValue, Timestamp, TokenUsage, ToolCall } from './common'
import type { ProviderId } from './provider'

export interface MessageMetadata {
  readonly providerId?: ProviderId
  readonly model?: string
  readonly tokens?: TokenUsage
  readonly attachments?: readonly Attachment[]
  readonly toolCalls?: readonly ToolCall[]
  readonly hidden?: boolean
  readonly custom?: Readonly<Record<string, JsonValue>>
}

export interface ChatMessage {
  readonly id: EntityId
  readonly role: ChatRole
  readonly content: string
  readonly timestamp: Timestamp
  readonly metadata: MessageMetadata
}

export interface Chat {
  readonly id: EntityId
  readonly title?: string
  readonly messages: readonly ChatMessage[]
  readonly createdAt: Timestamp
  readonly updatedAt: Timestamp
}
