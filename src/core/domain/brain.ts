import type {
  Attachment,
  BrainMetadata,
  ChatRole,
  EntityId,
  JsonValue,
  Timestamp,
  TokenUsage,
  ToolCall,
} from './common'
import type { BrainEdge, BrainNode } from './node'
import type { BrainSettings, ProviderConfiguration, ProviderId } from './provider'
import type { KnowledgeBase, MemoryConfiguration } from './knowledge'
import type { ExecutionLog, ExecutionState } from './execution'

export enum BrainLifecycleState {
  Created = 'created',
  Designing = 'designing',
  Generating = 'generating',
  Ready = 'ready',
  Running = 'running',
  Paused = 'paused',
  Idle = 'idle',
  Error = 'error',
  Archived = 'archived',
}

// The Brain is the highest-level aggregate in the system. Everything belongs
// to exactly one Brain. It is fully immutable.
export interface Brain {
  readonly id: EntityId
  readonly name: string
  readonly description: string
  readonly createdAt: Timestamp
  readonly updatedAt: Timestamp
  readonly version: string
  readonly lifecycle: BrainLifecycleState
  readonly provider: ProviderConfiguration
  // Mirrors provider.model for quick access to the active model.
  readonly model: string
  readonly nodes: readonly BrainNode[]
  readonly edges: readonly BrainEdge[]
  readonly settings: BrainSettings
  readonly knowledge: KnowledgeBase
  readonly memory: MemoryConfiguration
  readonly chats: readonly Chat[]
  readonly logs: readonly ExecutionLog[]
  readonly metadata: BrainMetadata
  readonly executionState: ExecutionState
}

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
