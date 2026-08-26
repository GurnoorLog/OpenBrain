import type { JsonValue } from './common'

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
