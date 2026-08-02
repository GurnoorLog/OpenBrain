import type { EntityId, Timestamp } from './common'
import type { BrainNode } from './node'
import type { BrainEdge } from './edge'
import type { BrainSettings } from './settings'
import type { KnowledgeBase } from './knowledge'
import type { MemoryConfiguration } from './memory'
import type { ProviderConfiguration } from './provider'

export type TemplateCategory =
  | 'starter'
  | 'workflow'
  | 'rag'
  | 'agent'
  | 'research'
  | 'marketing'
  | 'coding'
  | (string & {})

export interface TemplateBrainSpec {
  readonly name: string
  readonly description: string
  readonly provider?: ProviderConfiguration
  readonly nodes: readonly BrainNode[]
  readonly edges: readonly BrainEdge[]
  readonly settings?: Partial<BrainSettings>
  readonly knowledge?: KnowledgeBase
  readonly memory?: MemoryConfiguration
}

export interface BrainTemplate {
  readonly id: EntityId
  readonly name: string
  readonly description: string
  readonly category: TemplateCategory
  readonly version: string
  readonly author?: string
  readonly thumbnail?: string
  readonly tags?: readonly string[]
  readonly brain: TemplateBrainSpec
  readonly createdAt: Timestamp
  readonly updatedAt: Timestamp
}
