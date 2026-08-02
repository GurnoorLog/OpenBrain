import { ArchitectCancelledError, ArchitectParsingError } from './ArchitectErrors'
import { isBrainSpecification } from './BrainSpecification'
import type { BrainSpecification } from './BrainSpecification'
import type { PromptBuilder } from './PromptBuilder'
import type { StructuredPrompt } from './PromptBuilder'
import type { SpecificationValidator } from './SpecificationValidator'
import type { ProviderHealth, ProviderId } from '../domain'

export interface DesignContext {
  readonly providerId?: ProviderId
  readonly model?: string
  readonly constraints?: readonly string[]
}

export interface DesignRequest {
  readonly prompt: string
  readonly context?: DesignContext
  readonly signal?: AbortSignal
  // Optional event: the provider emitted chain-of-thought alongside its answer.
  readonly onReasoning?: (reasoning: string) => void
  // Optional live sink: called repeatedly with new reasoning chunks as they
  // stream in, BEFORE the completion finishes. Enables the real-time
  // "AI is thinking" pill. Providers that don't stream send only the final
  // reasoning via onReasoning.
  readonly onReasoningStream?: (reasoning: string) => void
}

// Strategy contract. Every architect provider (cloud, local, future) plugs
// into the system through this interface only.
export interface ArchitectProvider {
  readonly id: ProviderId
  designBrain(request: DesignRequest): Promise<BrainSpecification>
  health(): Promise<ProviderHealth>
  supportsStreaming(): boolean
}

export interface JsonRequestOptions {
  readonly method?: 'GET' | 'POST'
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: unknown
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

// Result of a single provider completion: the parsed JSON content plus any
// chain-of-thought "reasoning" the model emitted alongside it (e.g. Fireworks
// reasoning_content, Ollama thinking). Reasoning is informational only.
export interface ModelResult {
  readonly content: string
  readonly reasoning?: string
}

// Shared network seam for provider calls. Returns the parsed JSON body on
// 2xx; throws an Error (with response text) on failure or timeout. If an
// external signal aborts the request, throws ArchitectCancelledError.
export async function invokeJson(url: string, options: JsonRequestOptions = {}): Promise<unknown> {
  const { method = 'POST', headers = {}, body, timeoutMs = 60_000, signal } = options
  const controller = new AbortController()
  const onExternalAbort = () => controller.abort()
  signal?.addEventListener('abort', onExternalAbort, { once: true })
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) {
      const detail = text.trim() ? text.slice(0, 500) : response.statusText
      throw new Error(`HTTP ${response.status}: ${detail}`)
    }
    return text.trim() === '' ? {} : JSON.parse(text)
  } catch (error) {
    if (signal?.aborted) {
      throw new ArchitectCancelledError()
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms.`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', onExternalAbort)
  }
}

// Shared pipeline: build prompt -> invoke model -> parse -> validate.
// Concrete providers implement the network seam (invokeModel).
export abstract class BaseArchitect implements ArchitectProvider {
  constructor(
    readonly id: ProviderId,
    protected readonly promptBuilder: PromptBuilder,
    protected readonly validator: SpecificationValidator,
  ) {}

  supportsStreaming(): boolean {
    return true
  }

  async health(): Promise<ProviderHealth> {
    return { status: 'unconfigured', checkedAt: new Date().toISOString() }
  }

  async designBrain(request: DesignRequest): Promise<BrainSpecification> {
    const prompt = this.promptBuilder.build(request)
    const result = request.onReasoning
      ? await this.invokeModel(prompt, request.signal, request.onReasoning)
      : await this.invokeModel(prompt, request.signal)
    if (result.reasoning && !request.onReasoningStream) {
      request.onReasoning?.(result.reasoning)
    }
    const specification = this.parseSpecification(result.content)
    this.validator.validateOrThrow(specification)
    return specification
  }

  protected abstract invokeModel(
    prompt: StructuredPrompt,
    signal?: AbortSignal,
    onReasoning?: (reasoning: string) => void,
  ): Promise<ModelResult>

  protected parseSpecification(raw: string): BrainSpecification {
    const candidate = extractJson(raw)
    let parsed: unknown
    try {
      parsed = JSON.parse(candidate)
    } catch {
      throw new ArchitectParsingError(`Architect provider "${this.id}" returned malformed JSON.`)
    }
    if (!isBrainSpecification(parsed)) {
      throw new ArchitectParsingError(`Architect provider "${this.id}" returned an invalid specification.`)
    }
    return parsed
  }
}

// Strips markdown code fences (```json ... ```) around a JSON reply so models
// that wrap their output still parse.
function extractJson(raw: string): string {
  const trimmed = raw.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) return fence[1].trim()
  return trimmed
}
