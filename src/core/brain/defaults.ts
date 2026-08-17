import type { BrainSettings } from '../domain'
import type { ExecutionState } from '../domain'
import type { KnowledgeBase } from '../domain'
import type { MemoryConfiguration } from '../domain'
import type { ProviderConfiguration } from '../domain'

// Cloud Mode: Fireworks AI is the primary cloud inference provider.
export const DEFAULT_PROVIDER: ProviderConfiguration = {
  providerId: 'fireworks',
  providerName: 'Fireworks AI',
  providerType: 'cloud',
  model: 'accounts/fireworks/models/deepseek-v4-flash',
  baseUrl: 'https://api.fireworks.ai/inference/v1',
  apiKey: null,
  temperature: 0.7,
  maxTokens: 4096,
  contextWindow: 32768,
  streaming: true,
  visionSupport: false,
  toolCalling: true,
  embeddingSupport: true,
  status: 'unconfigured',
  metadata: {},
}

// Local Mode: Ollama is the primary local inference provider. Default model: qwen2.5:7b.
export const DEFAULT_LOCAL_PROVIDER: ProviderConfiguration = {
  providerId: 'ollama',
  providerName: 'Ollama',
  providerType: 'local',
  model: 'qwen2.5:7b',
  baseUrl: 'http://127.0.0.1:11434',
  apiKey: null,
  temperature: 0.7,
  maxTokens: 2048,
  contextWindow: 8192,
  streaming: true,
  visionSupport: false,
  toolCalling: false,
  embeddingSupport: true,
  status: 'unconfigured',
  metadata: {},
}

export function createDefaultSettings(provider: ProviderConfiguration): BrainSettings {
  return {
    autoSave: true,
    theme: 'dark',
    grid: { size: 32, visible: true },
    snapToGrid: true,
    executionMode: 'manual',
    provider,
    debug: false,
  }
}

export function createDefaultMemory(): MemoryConfiguration {
  return {
    enabled: true,
    kind: 'working',
    scope: 'brain',
    storage: 'in-memory',
    capacity: 1024,
  }
}

export function createDefaultKnowledge(): KnowledgeBase {
  return {
    id: crypto.randomUUID(),
    name: 'Knowledge Base',
    sources: [],
    vectorDatabase: 'none',
    embeddingModel: '',
    chunkSize: 800,
    chunkOverlap: 100,
    retrievalStrategy: 'similarity',
    topK: 4,
  }
}

export function createDefaultExecution(): ExecutionState {
  return {
    status: 'idle',
    currentNodeId: null,
    startTime: null,
    endTime: null,
    executionOrder: [],
    logs: [],
    progress: 0,
  }
}
