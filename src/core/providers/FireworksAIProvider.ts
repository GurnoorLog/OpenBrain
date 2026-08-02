import type {
  AIProvider,
  CompletionChunk,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ModelDescriptor,
  ProviderConfiguration,
  ProviderDescriptor,
  ProviderHealth,
  ProviderMessage,
} from '../domain'
import { FIREWORKS_BASE_URL, FIREWORKS_DEFAULT_MODEL } from '../architect/FireworksArchitect'

function readEnvKey(name: string): string | null {
  const env = (import.meta as { env?: Readonly<Record<string, string | undefined>> }).env
  const value = env?.[name]
  return value && value.trim() !== '' ? value : null
}

function finishReason(raw: unknown): CompletionResponse['finishReason'] {
  if (raw === 'length') return 'length'
  if (raw === 'tool_calls') return 'tool_calls'
  if (raw === 'content_filter') return 'content_filter'
  return 'stop'
}

function readMessage(message: Record<string, unknown>): { content: string; reasoning: string | null } {
  const content = message['content']
  const reasoning = message['reasoning_content']
  return {
    content: typeof content === 'string' ? content : '',
    reasoning: typeof reasoning === 'string' && reasoning.trim() !== '' ? reasoning : null,
  }
}

// Real AIProvider backed by Fireworks' OpenAI-compatible chat completions
// endpoint. Used by the execution engine so LLM nodes actually reason instead
// of returning canned placeholder text. The API key is read from
// VITE_FIREWORKS_API_KEY; the architect never sees it.
export class FireworksAIProvider implements AIProvider {
  readonly descriptor: ProviderDescriptor
  readonly config: ProviderConfiguration
  private readonly apiKey: string | null
  private readonly baseUrl: string
  private readonly model: string

  constructor() {
    this.apiKey = readEnvKey('VITE_FIREWORKS_API_KEY')
    this.baseUrl = FIREWORKS_BASE_URL
    this.model = FIREWORKS_DEFAULT_MODEL
    this.descriptor = {
      id: 'fireworks',
      name: 'Fireworks AI',
      kind: 'cloud',
      requiresApiKey: true,
      defaultBaseUrl: this.baseUrl,
      defaultModel: this.model,
      models: [],
    }
    this.config = {
      providerId: 'fireworks',
      providerName: 'Fireworks AI',
      providerType: 'cloud',
      model: this.model,
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      temperature: 0.6,
      maxTokens: 1024,
      contextWindow: 16384,
      streaming: true,
      visionSupport: false,
      toolCalling: false,
      embeddingSupport: false,
      status: this.apiKey ? 'available' : 'unconfigured',
      metadata: {},
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (!this.apiKey) throw new Error('Fireworks AI is not configured (missing API key).')
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model ?? this.model,
        messages: request.messages,
        temperature: request.temperature ?? this.config.temperature,
        max_tokens: request.maxTokens ?? this.config.maxTokens,
      }),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`Fireworks API HTTP ${response.status}: ${text.slice(0, 300)}`)
    const data = JSON.parse(text) as { choices?: { message?: Record<string, unknown>; finish_reason?: unknown }[] }
    const choice = data.choices?.[0]
    if (!choice?.message) throw new Error('Fireworks returned an empty completion.')
    const message = readMessage(choice.message)
    if (message.content === '') throw new Error('Fireworks returned an empty completion.')
    return { content: message.content, finishReason: finishReason(choice.finish_reason) }
  }

  async *stream(request: CompletionRequest): AsyncIterable<CompletionChunk> {
    if (!this.apiKey) throw new Error('Fireworks AI is not configured (missing API key).')
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model ?? this.model,
        messages: request.messages,
        temperature: request.temperature ?? this.config.temperature,
        max_tokens: request.maxTokens ?? this.config.maxTokens,
        stream: true,
      }),
    })
    if (!response.ok || !response.body) {
      throw new Error(`Fireworks streaming failed: HTTP ${response.status}`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    let id = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      pending += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, idx).trim()
        pending = pending.slice(idx + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') return
        try {
          const parsed = JSON.parse(data) as {
            choices?: { delta?: { content?: string }; finish_reason?: string | null }[]
          }
          const delta = parsed.choices?.[0]?.delta?.content ?? ''
          id += 1
          yield { id: String(id), delta, finishReason: finishReason(parsed.choices?.[0]?.finish_reason ?? null) }
        } catch {
          /* ignore malformed chunk */
        }
      }
    }
  }

  async embed(_request: EmbeddingRequest): Promise<EmbeddingResponse> {
    throw new Error('Fireworks embeddings are not supported.')
  }

  async listModels(): Promise<readonly ModelDescriptor[]> {
    if (!this.apiKey) return []
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
    if (!response.ok) return []
    const data = (await response.json()) as { data?: { id?: string }[] }
    return (data.data ?? [])
      .filter((model) => typeof model.id === 'string')
      .map((model) => ({
        id: model.id as string,
        name: model.id as string,
        contextWindow: 16384,
        maxTokens: 4096,
        vision: false,
        toolCalling: false,
        embedding: false,
        streaming: true,
      }))
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString()
    if (!this.apiKey) {
      return { status: 'unconfigured', checkedAt, message: 'Fireworks AI is not configured (missing API key).' }
    }
    const started = Date.now()
    try {
      const models = await this.listModels()
      if (models.length === 0) throw new Error('no models returned')
      return { status: 'available', latencyMs: Date.now() - started, checkedAt, message: 'Fireworks AI is reachable.' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { status: 'unavailable', latencyMs: Date.now() - started, checkedAt, message }
    }
  }
}

// Convenience: a fully-configured provider singleton for the execution layer.
export function createFireworksAIProvider(): AIProvider {
  return new FireworksAIProvider()
}

export type { ProviderMessage }
