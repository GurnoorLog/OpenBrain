import type { Brain, BrainEdge, BrainNode, KnowledgeBase, KnowledgeSource, MemoryConfiguration, ProviderConfiguration, TemplateBrainSpec } from '../domain'
import { createDefaultKnowledge, createDefaultMemory, DEFAULT_LOCAL_PROVIDER, DEFAULT_PROVIDER } from '../brain/defaults'
import type { BrainFactory } from '../brain/factory'
import type { BrainSpecification, KnowledgeRecommendation, MemoryRecommendation, SpecificationEdge, SpecificationNode } from './BrainSpecification'
import { getNodeCatalogEntry } from './PromptBuilder'

const COLUMN_WIDTH = 260
const ROW_HEIGHT = 140

export interface TransformOptions {
  readonly provider?: ProviderConfiguration
}

// Converts an AI-generated BrainSpecification into a domain Brain through the
// BrainFactory. This is the single boundary between AI output and the domain.
export class SpecificationTransformer {
  constructor(private readonly factory: BrainFactory) {}

  transform(specification: BrainSpecification, options: TransformOptions = {}): Brain {
    const provider = options.provider ?? this.resolveProvider(specification.providerRecommendation)
    const nodes = specification.nodes.map((node, index) => this.toDomainNode(node, index))
    const edges = specification.edges.map((edge) => this.toDomainEdge(edge, nodes))

    const templateSpec: TemplateBrainSpec = {
      name: specification.name,
      description: specification.description,
      provider,
      nodes,
      edges,
      settings: { executionMode: specification.executionMode },
      memory: this.toMemoryConfiguration(specification.memoryRecommendation),
      knowledge: this.toKnowledgeBase(specification.knowledgeRecommendation),
    }

    return this.factory.create({
      name: specification.name,
      description: specification.description,
      provider,
      templateSpec,
    })
  }

  private toDomainNode(node: SpecificationNode, index: number): BrainNode {
    const entry = getNodeCatalogEntry(node.type)
    const hint = node.positionHint ?? { column: index, row: 0 }
    return {
      id: node.id,
      type: node.type,
      title: node.title,
      description: node.description,
      status: 'idle',
      position: { x: hint.column * COLUMN_WIDTH, y: hint.row * ROW_HEIGHT },
      inputs: entry?.inputs ?? [],
      outputs: entry?.outputs ?? [],
      configuration: node.configuration,
      metadata: {},
    }
  }

  private toDomainEdge(edge: SpecificationEdge, nodes: readonly BrainNode[]): BrainEdge {
    const source = nodes.find((node) => node.id === edge.source)
    const target = nodes.find((node) => node.id === edge.target)
    return {
      id: crypto.randomUUID(),
      source: edge.source,
      sourcePort: edge.sourcePort ?? source?.outputs[0]?.id ?? 'out',
      target: edge.target,
      targetPort: edge.targetPort ?? target?.inputs[0]?.id ?? 'in',
      animated: true,
      metadata: {},
    }
  }

  private toMemoryConfiguration(recommendation?: MemoryRecommendation): MemoryConfiguration {
    if (!recommendation) return createDefaultMemory()
    return {
      ...createDefaultMemory(),
      enabled: recommendation.enabled,
      kind: recommendation.kind,
      scope: recommendation.scope,
    }
  }

  private toKnowledgeBase(recommendation?: KnowledgeRecommendation): KnowledgeBase {
    const base = createDefaultKnowledge()
    if (!recommendation || !recommendation.required) return base
    const sources: KnowledgeSource[] = (recommendation.sourceTypes ?? []).map((type) => {
      const now = new Date().toISOString()
      return {
        id: crypto.randomUUID(),
        name: `${type} source`,
        type,
        location: '',
        status: 'pending',
        metadata: {},
        createdAt: now,
        updatedAt: now,
      }
    })
    return { ...base, sources, embeddingModel: recommendation.embeddingModel ?? '' }
  }

  private resolveProvider(providerId: string): ProviderConfiguration {
    return providerId === 'ollama' ? DEFAULT_LOCAL_PROVIDER : DEFAULT_PROVIDER
  }
}
