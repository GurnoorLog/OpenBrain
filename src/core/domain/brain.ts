import type { EntityId, Timestamp } from './common'
import type { BrainNode } from './node'
import type { BrainEdge } from './edge'
import type { BrainSettings } from './settings'
import type { KnowledgeBase } from './knowledge'
import type { MemoryConfiguration } from './memory'
import type { Chat } from './chat'
import type { ExecutionLog, ExecutionState } from './execution'
import type { BrainMetadata } from './metadata'
import type { ProviderConfiguration } from './provider'
import { BrainLifecycleState } from './lifecycle'

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
