import type { ProviderHealth } from '../domain'
import { ArchitectCancelledError, ArchitectProviderError, ArchitectProviderUnconfiguredError } from './ArchitectErrors'
import { BaseArchitect, invokeJson } from './ArchitectProvider'
import type { ModelResult } from './ArchitectProvider'
import type { PromptBuilder, StructuredPrompt } from './PromptBuilder'
import type { SpecificationValidator } from './SpecificationValidator'

export const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1'
export const FIREWORKS_DEFAULT_MODEL = 'accounts/fireworks/models/deepseek-v4-flash'

export interface FireworksArchitectOptions {
  readonly apiKey?: string | null
  readonly baseUrl?: string
  readonly defaultModel?: string
  readonly timeoutMs?: number
}

// Primary cloud architect provider. Talks to Fireworks AI's OpenAI-compatible
// chat completions endpoint. The API key is read from the VITE_FIREWORKS_API_KEY
// environment variable unless one is injected explicitly.
export class FireworksArchitect extends BaseArchitect {
  readonly baseUrl: string
  readonly defaultModel: string
  readonly apiKey: string | null
  private readonly timeoutMs: number

  constructor(
    promptBuilder: PromptBuilder,
    validator: SpecificationValidator,
    options: FireworksArchitectOptions = {},
  ) {
    super('fireworks', promptBuilder, validator)
    this.baseUrl = (options.baseUrl ?? FIREWORKS_BASE_URL).replace(/\/+$/, '')
    this.defaultModel = options.defaultModel ?? FIREWORKS_DEFAULT_MODEL
    this.apiKey = options.apiKey ?? readEnvKey('VITE_FIREWORKS_API_KEY')
    this.timeoutMs = options.timeoutMs ?? 60_000
  }

  override async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString()
    if (!this.apiKey) {
      return {
        status: 'unconfigured',
        checkedAt,
        message: 'Fireworks AI API integration is not configured (missing API key).',
      }
    }
    const started = Date.now()
    try {
      await invokeJson(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.authHeaders(),
        timeoutMs: 10_000,
      })
      return { status: 'available', latencyMs: Date.now() - started, checkedAt, message: 'Fireworks AI is reachable.' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { status: 'unavailable', latencyMs: Date.now() - started, checkedAt, message }
    }
  }

  // Cheap first pass (no streaming): asks the model what it needs to know to
  // design a great brain for this request. Returns up to 4 questions, or []
  // when the request is already clear. Robust to failures — a clarify step
  // that errors out simply yields no questions.
  override async askClarifyingQuestions(request: {
    prompt: string
    signal?: AbortSignal
  }): Promise<string[]> {
    if (!this.apiKey) return []
    try {
      const data = await invokeJson(`${this.baseUrl}/chat/completions`, {
        headers: this.authHeaders(),
        body: {
          model: this.defaultModel,
          messages: [
            {
              role: 'system',
              content: [
                'You are the OpenBrain architect doing a brief intake interview.',
                'Decide whether the user\'s request is specific enough to design an agent graph for immediately.',
                'If it is clear enough, respond with the JSON array [] (empty).',
                'If you need more context, ask at most 3 concise clarifying questions that would materially improve the design.',
                'Respond with ONLY a JSON array of question strings. No prose, no markdown.',
              ].join(' '),
            },
            { role: 'user', content: request.prompt },
          ],
          temperature: 0.2,
          max_tokens: 300,
        },
        timeoutMs: 20_000,
        signal: request.signal,
      })
      const result = readChatResult(data)
      if (result.content === null) return []
      const questions = parseQuestionList(result.content)
      return questions.length > 0 ? questions.slice(0, 3) : []
    } catch {
      return []
    }
  }

  protected override async invokeModel(
    prompt: StructuredPrompt,
    signal?: AbortSignal,
    onReasoning?: (reasoning: string) => void,
  ): Promise<ModelResult> {
    if (!this.apiKey) {
      throw new ArchitectProviderUnconfiguredError(this.id)
    }
    if (onReasoning && this.supportsStreaming()) {
      return this.invokeStreaming(prompt, signal, onReasoning)
    }
    const data = await invokeJson(`${this.baseUrl}/chat/completions`, {
      headers: this.authHeaders(),
      body: {
        model: this.defaultModel,
        messages: prompt.messages,
        temperature: prompt.temperature,
        max_tokens: prompt.maxTokens,
      },
      timeoutMs: this.timeoutMs,
      signal,
    })
    const result = readChatResult(data)
    if (result.content === null) {
      throw new ArchitectProviderError(this.id, 'Fireworks AI returned an empty completion.')
    }
    return { content: result.content, reasoning: result.reasoning ?? undefined }
  }

  // Streams the chat completion over Server-Sent Events. Reasoning tokens are
  // delivered live to `onReasoning` so the UI can show the "AI is thinking"
  // animation while the model works. The final assistant content is buffered
  // and returned as the parsed spec.
  private async invokeStreaming(
    prompt: StructuredPrompt,
    signal?: AbortSignal,
    onReasoning?: (reasoning: string) => void,
  ): Promise<ModelResult> {
    const controller = new AbortController()
    const onExternalAbort = () => controller.abort()
    const abortSignal = signal ?? new AbortController().signal
    abortSignal.addEventListener('abort', onExternalAbort, { once: true })
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    const flush = (fn: (fnReasoning: string) => void) => (s: string) => {
      if (s) fn(s)
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.defaultModel,
          messages: prompt.messages,
          temperature: prompt.temperature,
          max_tokens: prompt.maxTokens,
          stream: true,
        }),
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        throw new ArchitectProviderError(this.id, `Fireworks streaming failed: HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let pending = ''
      let content = ''
      const pushReasoning = flush((token) => {
        onReasoning?.(token)
      })

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
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            const delta = parsed?.choices?.[0]?.delta ?? {}
            if (delta.reasoning_content) {
              for (const r of delta.reasoning_content.split(/(?<=\s)/)) pushReasoning(r)
            }
            if (delta.content) {
              content += delta.content
            }
          } catch {
            /* ignore malformed chunk */
          }
        }
      }

      if (content.trim() === '') {
        // Reasoning models can spend the entire token budget on chain-of-thought,
        // leaving content empty. Retry once non-streaming with a doubled budget
        // so a design that "thinks too long" still lands instead of failing.
        return this.retryNonStreaming(prompt, signal)
      }
      // Reasoning was already delivered token-by-token to onReasoning during
      // streaming; returning it again would make BaseArchitect re-send the full
      // reasoning after the stream finishes (the thinking pill shows it twice).
      return { content }
    } catch (error) {
      if (signal?.aborted) throw new ArchitectCancelledError()
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.timeoutMs}ms.`)
      }
      throw error
    } finally {
      clearTimeout(timeout)
      abortSignal.removeEventListener('abort', onExternalAbort)
    }
  }

  private authHeaders(): Readonly<Record<string, string>> {
    return { Authorization: `Bearer ${this.apiKey ?? ''}` }
  }

  // Fallback after a content-empty stream: one non-streaming completion with a
  // doubled token budget. Reasoning is no longer delivered live (the model has
  // already finished), so the caller only gets the final content.
  private async retryNonStreaming(
    prompt: StructuredPrompt,
    signal?: AbortSignal,
  ): Promise<ModelResult> {
    const data = await invokeJson(`${this.baseUrl}/chat/completions`, {
      headers: this.authHeaders(),
      body: {
        model: this.defaultModel,
        messages: prompt.messages,
        temperature: prompt.temperature,
        max_tokens: Math.min(prompt.maxTokens * 2, 16_000),
      },
      timeoutMs: this.timeoutMs,
      signal,
    })
    const result = readChatResult(data)
    if (result.content === null) {
      throw new ArchitectProviderError(this.id, 'Fireworks returned an empty completion.')
    }
    return { content: result.content, reasoning: result.reasoning ?? undefined }
  }
}

function readEnvKey(name: string): string | null {
  const env = (import.meta as { env?: Readonly<Record<string, string | undefined>> }).env
  const value = env?.[name]
  return value && value.trim() !== '' ? value : null
}

// Extracts content and optional reasoning from an OpenAI-compatible response.
// Reasoning models (e.g. DeepSeek) put chain-of-thought in
// choices[0].message.reasoning_content.
function readChatResult(data: unknown): { content: string | null; reasoning: string | null } {
  if (typeof data !== 'object' || data === null) return { content: null, reasoning: null }
  const choices = (data as Record<string, unknown>)['choices']
  if (!Array.isArray(choices)) return { content: null, reasoning: null }
  const first = choices[0]
  if (typeof first !== 'object' || first === null) return { content: null, reasoning: null }
  const message = (first as Record<string, unknown>)['message']
  if (typeof message !== 'object' || message === null) return { content: null, reasoning: null }
  const content = (message as Record<string, unknown>)['content']
  const reasoning = (message as Record<string, unknown>)['reasoning_content']
  return {
    content: typeof content === 'string' && content.trim() !== '' ? content : null,
    reasoning: typeof reasoning === 'string' && reasoning.trim() !== '' ? reasoning : null,
  }
}

// Parses a JSON array of question strings, tolerating code fences and stray
// punctuation around the array. Returns [] for anything non-array-like.
function parseQuestionList(raw: string): string[] {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/i)
  const candidate = fenced ? fenced[1] : trimmed
  const start = candidate.indexOf('[')
  const end = candidate.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []
  try {
    const parsed: unknown = JSON.parse(candidate.slice(start, end + 1))
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
  } catch {
    return []
  }
}
