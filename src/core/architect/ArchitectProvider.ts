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
  // Cheap first pass: returns up to a few clarifying questions (empty array
  // when the request is clear enough to design immediately). Answers feed the
  // real design call. Implementations that can't ask questions return [].
  askClarifyingQuestions(request: { prompt: string; signal?: AbortSignal }): Promise<string[]>
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

  async askClarifyingQuestions(_request: { prompt: string; signal?: AbortSignal }): Promise<string[]> {
    return []
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
      // The model can exceed its output budget on very large designs and
      // return truncated JSON. Try to recover a parseable prefix before giving
      // up so big specs don't hard-fail.
      const recovered = recoverJson(candidate)
      if (recovered === null) {
        throw new ArchitectParsingError(`Architect provider "${this.id}" returned malformed JSON.`)
      }
      parsed = recovered
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

// Attempts to recover a parseable JSON value from text that was truncated
// mid-structure (large designs can outgrow the model's output budget). Handles
// unclosed arrays/objects, trailing commas, and values cut mid-string. Returns
// the parsed value or null.
function recoverJson(raw: string): unknown {
  const text = raw.trim()
  if (text === '') return null
  const start = text.indexOf('{')
  if (start === -1) return null

  const balance = (segment: string): string => {
    const stack: string[] = []
    const inString = { open: false, escape: false }
    const tokens: string[] = []
    for (const ch of segment) {
      if (inString.open) {
        tokens.push(ch)
        if (inString.escape) inString.escape = false
        else if (ch === '\\') inString.escape = true
        else if (ch === '"') inString.open = false
        continue
      }
      switch (ch) {
        case '"':
          inString.open = true
          tokens.push(ch)
          break
        case '{':
        case '[':
          stack.push(ch)
          tokens.push(ch)
          break
        case '}':
          if (stack[stack.length - 1] === '{') stack.pop()
          tokens.push(ch)
          break
        case ']':
          if (stack[stack.length - 1] === '[') stack.pop()
          tokens.push(ch)
          break
        default:
          tokens.push(ch)
      }
    }
    // Drop a trailing unterminated string value, then close unclosed brackets.
    if (inString.open) {
      const joined = tokens.join('')
      const lastQuote = joined.lastIndexOf('"')
      tokens.length = lastQuote === -1 ? 0 : lastQuote
    }
    let candidate = tokens.join('')
    while (stack.length > 0) {
      const closer = stack.pop()
      candidate += closer === '{' ? '}' : ']'
    }
    // Remove trailing commas left dangling before a closing bracket.
    candidate = candidate.replace(/,\s*([}\]])/g, '$1')
    return candidate
  }

  // If full balancing fails, salvage by trimming back to progressively earlier
  // structural points (end of last value, last object, last array).
  const tryParse = (segment: string): unknown => {
    try {
      return JSON.parse(balance(segment))
    } catch {
      return undefined
    }
  }

  const direct = tryParse(text.slice(start))
  if (direct !== undefined) return direct

  const scan = text.slice(start)
  const cuts: number[] = []
  for (let i = scan.length - 1; i > start; i--) {
    const ch = scan[i]
    if (ch === ',' || ch === '{' || ch === '[') {
      cuts.push(i)
      if (cuts.length > 8) break
    }
  }
  for (const cut of cuts) {
    const recovered = tryParse(scan.slice(0, cut))
    if (recovered !== undefined) return recovered
  }
  return null
}
