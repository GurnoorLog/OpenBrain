import type {
  ChatRole,
  EntityId,
  JsonObject,
  JsonValue,
  Timestamp,
  TokenUsage,
  ToolCall,
  ToolDefinition,
} from './common'

export type ProviderId = 'fireworks' | 'ollama' | (string & {})

export type ProviderKind = 'cloud' | 'local'

export type ProviderStatus = 'unconfigured' | 'available' | 'degraded' | 'unavailable'

export type ProviderMetadata = Readonly<Record<string, JsonValue>>

export interface ProviderConfiguration {
  readonly providerId: ProviderId
  readonly providerName: string
  readonly providerType: ProviderKind
  readonly model: string
  readonly baseUrl: string
  readonly apiKey: string | null
  readonly temperature: number
  readonly maxTokens: number
  readonly contextWindow: number
  readonly streaming: boolean
  readonly visionSupport: boolean
  readonly toolCalling: boolean
  readonly embeddingSupport: boolean
  readonly status: ProviderStatus
  readonly metadata: ProviderMetadata
}

export interface ModelDescriptor {
  readonly id: string
  readonly name: string
  readonly contextWindow: number
  readonly maxTokens: number
  readonly vision: boolean
  readonly toolCalling: boolean
  readonly embedding: boolean
  readonly streaming: boolean
  readonly costPer1kInputTokens?: number
  readonly costPer1kOutputTokens?: number
}

export interface ProviderDescriptor {
  readonly id: ProviderId
  readonly name: string
  readonly kind: ProviderKind
  readonly requiresApiKey: boolean
  readonly defaultBaseUrl: string
  readonly defaultModel: string
  readonly models: readonly ModelDescriptor[]
}

export interface FireworksProviderDescriptor extends ProviderDescriptor {
  readonly id: 'fireworks'
}

export interface OllamaProviderDescriptor extends ProviderDescriptor {
  readonly id: 'ollama'
}

export type ResponseFormat =
  | { readonly kind: 'text' }
  | { readonly kind: 'json' }
  | { readonly kind: 'json_schema'; readonly schema: JsonObject }

export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error'

export interface ProviderMessage {
  readonly role: ChatRole
  readonly content: string
  readonly name?: string
  readonly toolCallId?: string
  readonly toolCalls?: readonly ToolCall[]
}

export interface CompletionRequest {
  readonly messages: readonly ProviderMessage[]
  readonly model?: string
  readonly temperature?: number
  readonly maxTokens?: number
  readonly stream?: boolean
  readonly tools?: readonly ToolDefinition[]
  readonly stop?: readonly string[]
  readonly responseFormat?: ResponseFormat
  readonly signal?: AbortSignal
}

export interface CompletionResponse {
  readonly content: string
  readonly finishReason: FinishReason
  readonly usage?: TokenUsage
  readonly toolCalls?: readonly ToolCall[]
}

export interface CompletionChunk {
  readonly id: EntityId
  readonly delta: string
  readonly finishReason: FinishReason | null
  readonly usage?: TokenUsage
}

export interface EmbeddingRequest {
  readonly input: string | readonly string[]
  readonly model?: string
}

export interface EmbeddingResponse {
  readonly embeddings: readonly (readonly number[])[]
  readonly usage?: TokenUsage
}

export interface ProviderHealth {
  readonly status: ProviderStatus
  readonly latencyMs?: number
  readonly checkedAt: Timestamp
  readonly message?: string
}

// The entire application communicates with model providers exclusively
// through this port. No subsystem may know whether a response came from
// Fireworks, Ollama, or any future provider.
export interface AIProvider {
  readonly descriptor: ProviderDescriptor
  readonly config: ProviderConfiguration
  complete(request: CompletionRequest): Promise<CompletionResponse>
  stream(request: CompletionRequest): AsyncIterable<CompletionChunk>
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>
  listModels(): Promise<readonly ModelDescriptor[]>
  health(): Promise<ProviderHealth>
}
