import type { ExecutionMode, JsonValue, KnowledgeSourceType, MemoryKind, MemoryScope, NodeType, ProviderId } from '../domain'

// Relative layout hint; the transformer converts it to pixel coordinates.
export interface PositionHint {
  readonly column: number
  readonly row: number
}

export interface SpecificationNode {
  readonly id: string
  readonly type: NodeType
  readonly title: string
  readonly description: string
  readonly reason: string
  readonly configuration: Readonly<Record<string, JsonValue>>
  readonly positionHint?: PositionHint
  readonly required: boolean
}

export interface SpecificationEdge {
  readonly source: string
  readonly sourcePort?: string
  readonly target: string
  readonly targetPort?: string
  readonly reason: string
}

export interface MemoryRecommendation {
  readonly enabled: boolean
  readonly kind: MemoryKind
  readonly scope: MemoryScope
}

export interface KnowledgeRecommendation {
  readonly required: boolean
  readonly description?: string
  readonly sourceTypes?: readonly KnowledgeSourceType[]
  readonly embeddingModel?: string
}

// An AI-generated design for a Brain, produced before it becomes a domain
// Brain. It is deliberately decoupled from the canvas and the runtime.
export interface BrainSpecification {
  readonly name: string
  readonly description: string
  readonly goal: string
  readonly providerRecommendation: ProviderId
  readonly modelRecommendation: string
  readonly memoryRecommendation?: MemoryRecommendation
  readonly knowledgeRecommendation?: KnowledgeRecommendation
  readonly executionMode: ExecutionMode
  readonly nodes: readonly SpecificationNode[]
  readonly edges: readonly SpecificationEdge[]
  readonly reasoning: string
  readonly warnings: readonly string[]
  readonly metadata: Readonly<Record<string, JsonValue>>
}

export function isBrainSpecification(value: unknown): value is BrainSpecification {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record['name'] === 'string' &&
    typeof record['goal'] === 'string' &&
    Array.isArray(record['nodes']) &&
    Array.isArray(record['edges'])
  )
}
