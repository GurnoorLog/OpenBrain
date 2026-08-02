import type { EntityId, Timestamp } from './common'
import type { RecordMetadata } from './metadata'

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
