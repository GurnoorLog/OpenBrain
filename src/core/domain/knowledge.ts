import type { EntityId, JsonValue, RecordMetadata, Timestamp } from './common'

export type KnowledgeSourceType =
  | 'text'
  | 'file'
  | 'url'
  | 'database'
  | 'markdown'
  | 'pdf'
  | 'api'
  | 'custom'

export type KnowledgeSourceStatus = 'pending' | 'indexed' | 'failed' | 'stale'

export type VectorDatabaseType =
  | 'none'
  | 'in-memory'
  | 'local'
  | 'pinecone'
  | 'weaviate'
  | 'qdrant'
  | 'chroma'
  | (string & {})

export type RetrievalStrategy = 'similarity' | 'mmr' | 'hybrid' | 'keyword'

export interface KnowledgeSource {
  readonly id: EntityId
  readonly name: string
  readonly type: KnowledgeSourceType
  readonly location: string
  readonly status: KnowledgeSourceStatus
  readonly chunkCount?: number
  readonly contentHash?: string
  readonly metadata: RecordMetadata
  readonly createdAt: Timestamp
  readonly updatedAt: Timestamp
}

export interface KnowledgeBase {
  readonly id: EntityId
  readonly name: string
  readonly sources: readonly KnowledgeSource[]
  readonly vectorDatabase: VectorDatabaseType
  readonly embeddingModel: string
  readonly chunkSize: number
  readonly chunkOverlap: number
  readonly retrievalStrategy: RetrievalStrategy
  readonly topK: number
}

// How a brain keeps context across runs, separate from its static knowledge
// base: working memory is the current run, the other kinds persist history.
export type MemoryKind = 'working' | 'long-term' | 'episodic' | 'semantic'

export type MemoryScope = 'brain' | 'global' | 'shared'

export type MemoryStorage = 'in-memory' | 'vector' | 'database'

export interface MemoryConfiguration {
  readonly enabled: boolean
  readonly kind: MemoryKind
  readonly scope: MemoryScope
  readonly storage: MemoryStorage
  readonly capacity: number
  readonly ttlSeconds?: number
  readonly embeddingModel?: string
  readonly custom?: Readonly<Record<string, JsonValue>>
}
