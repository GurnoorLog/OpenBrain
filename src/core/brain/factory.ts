import { BrainLifecycleState } from '../domain'
import type { Brain, BrainTemplate, EntityId, ProviderConfiguration, TemplateBrainSpec } from '../domain'
import { BRAIN_VERSION } from './constants'
import {
  DEFAULT_PROVIDER,
  createDefaultExecution,
  createDefaultKnowledge,
  createDefaultMemory,
  createDefaultSettings,
} from './defaults'

export interface CreateBrainInput {
  readonly name: string
  readonly description?: string
  readonly provider?: ProviderConfiguration
  readonly template?: BrainTemplate
  readonly templateSpec?: TemplateBrainSpec
}

export interface DuplicateBrainInput {
  readonly name?: string
  readonly description?: string
}

function createId(): EntityId {
  return crypto.randomUUID()
}

export class BrainFactory {
  create(input: CreateBrainInput): Brain {
    const now = new Date().toISOString()
    const templateBrain = input.templateSpec ?? input.template?.brain
    const provider = input.provider ?? templateBrain?.provider ?? DEFAULT_PROVIDER
    const settings = templateBrain?.settings
      ? { ...createDefaultSettings(provider), ...templateBrain.settings, provider }
      : createDefaultSettings(provider)

    return {
      id: createId(),
      name: input.name,
      description: input.description ?? templateBrain?.description ?? '',
      createdAt: now,
      updatedAt: now,
      version: BRAIN_VERSION,
      lifecycle: BrainLifecycleState.Created,
      provider,
      model: provider.model,
      nodes: templateBrain?.nodes ? structuredClone(templateBrain.nodes) : [],
      edges: templateBrain?.edges ? structuredClone(templateBrain.edges) : [],
      settings,
      knowledge: templateBrain?.knowledge ? structuredClone(templateBrain.knowledge) : createDefaultKnowledge(),
      memory: templateBrain?.memory ? structuredClone(templateBrain.memory) : createDefaultMemory(),
      chats: [],
      logs: [],
      metadata: { createdAt: now, updatedAt: now, tags: [] },
      executionState: createDefaultExecution(),
    }
  }

  duplicate(source: Brain, input: DuplicateBrainInput = {}): Brain {
    const now = new Date().toISOString()
    return {
      ...structuredClone(source),
      id: createId(),
      name: input.name ?? `${source.name} (copy)`,
      description: input.description ?? source.description,
      createdAt: now,
      updatedAt: now,
      lifecycle: BrainLifecycleState.Created,
      metadata: { ...source.metadata, createdAt: now, updatedAt: now },
      chats: [],
      logs: [],
      executionState: createDefaultExecution(),
    }
  }
}
