import type { ProviderHealth } from '../domain'
import { ArchitectProviderError } from './ArchitectErrors'
import { BaseArchitect, invokeJson } from './ArchitectProvider'
import type { ModelResult } from './ArchitectProvider'
import type { PromptBuilder, StructuredPrompt } from './PromptBuilder'
import type { SpecificationValidator } from './SpecificationValidator'

export const OLLAMA_BASE_URL = 'http://localhost:11434'
export const OLLAMA_DEFAULT_MODEL = 'qwen2.5:7b'

export interface OllamaArchitectOptions {
  readonly baseUrl?: string
  readonly defaultModel?: string
  readonly timeoutMs?: number
}

// Primary local architect provider. Talks to a local Ollama server via its
// /api/chat endpoint; no API key required.
export class OllamaArchitect extends BaseArchitect {
  readonly baseUrl: string
  readonly defaultModel: string
  private readonly timeoutMs: number

  constructor(
    promptBuilder: PromptBuilder,
    validator: SpecificationValidator,
    options: OllamaArchitectOptions = {},
  ) {
    super('ollama', promptBuilder, validator)
    this.baseUrl = (options.baseUrl ?? OLLAMA_BASE_URL).replace(/\/+$/, '')
    this.defaultModel = options.defaultModel ?? OLLAMA_DEFAULT_MODEL
    this.timeoutMs = options.timeoutMs ?? 60_000
  }

  override async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString()
    const started = Date.now()
    try {
      await invokeJson(`${this.baseUrl}/api/tags`, { method: 'GET', timeoutMs: 10_000 })
      return { status: 'available', latencyMs: Date.now() - started, checkedAt, message: 'Ollama is running.' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { status: 'unavailable', latencyMs: Date.now() - started, checkedAt, message }
    }
  }

  protected override async invokeModel(prompt: StructuredPrompt, signal?: AbortSignal): Promise<ModelResult> {
    const data = await invokeJson(`${this.baseUrl}/api/chat`, {
      body: {
        model: this.defaultModel,
        messages: prompt.messages,
        stream: false,
        options: { temperature: prompt.temperature, num_predict: prompt.maxTokens },
      },
      timeoutMs: this.timeoutMs,
      signal,
    })
    const result = readOllamaResult(data)
    if (result.content === null) {
      throw new ArchitectProviderError(this.id, 'Ollama returned an empty completion.')
    }
    return { content: result.content, reasoning: result.reasoning ?? undefined }
  }
}

// Extracts content and optional thinking from an Ollama /api/chat response.
// Reasoning-capable models (e.g. qwen3, deepseek-r1) emit chain-of-thought in
// message.reasoning or message.thinking.
function readOllamaResult(data: unknown): { content: string | null; reasoning: string | null } {
  if (typeof data !== 'object' || data === null) return { content: null, reasoning: null }
  const message = (data as Record<string, unknown>)['message']
  if (typeof message !== 'object' || message === null) return { content: null, reasoning: null }
  const content = (message as Record<string, unknown>)['content']
  const reasoning =
    (message as Record<string, unknown>)['reasoning'] ?? (message as Record<string, unknown>)['thinking']
  return {
    content: typeof content === 'string' && content.trim() !== '' ? content : null,
    reasoning: typeof reasoning === 'string' && reasoning.trim() !== '' ? reasoning : null,
  }
}
