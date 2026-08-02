// In-browser LLM inference via Transformers.js. The library (~MBs) is imported
// dynamically only when a Local Model node actually runs, so the main app
// bundle stays small. Models stream from the HuggingFace CDN and are cached by
// the browser across runs. This path needs no API key and never sends the
// prompt off the device.

export interface LocalInferenceOptions {
  readonly modelId: string
  readonly prompt: string
  readonly maxNewTokens?: number
  readonly temperature?: number
  readonly signal?: AbortSignal
  readonly onProgress?: (progress: { phase: 'download' | 'load' | 'generate'; detail: string }) => void
}

export interface LocalInferenceResult {
  readonly response: string
  readonly modelId: string
  readonly tokens: number
}

type LoadedTransformer = typeof import('@huggingface/transformers')

let libraryPromise: Promise<LoadedTransformer> | null = null

// Loads the Transformers.js web build lazily. Each model's pipeline is cached
// after first load so repeat runs reuse the loaded weights.
const pipelines = new Map<string, Promise<unknown>>()

async function loadLibrary(): Promise<LoadedTransformer> {
  libraryPromise ??= import('@huggingface/transformers')
  return libraryPromise
}

function onAbort(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Local model generation was aborted.', 'AbortError')
  }
}

export function getModelTask(modelId: string): string {
  const lower = modelId.toLowerCase()
  if (lower.includes('whisper')) return 'automatic-speech-recognition'
  if (lower.includes('clip') || lower.includes('vision')) return 'zero-shot-image-classification'
  return 'text-generation'
}

async function getPipeline(
  modelId: string,
  onProgress?: LocalInferenceOptions['onProgress'],
  signal?: AbortSignal,
): Promise<unknown> {
  const cached = pipelines.get(modelId)
  if (cached) {
    try {
      await cached
      return cached
    } catch {
      pipelines.delete(modelId)
    }
  }
  const library = await loadLibrary()
  onAbort(signal)
  const task = getModelTask(modelId)
  onProgress?.({ phase: 'download', detail: `Fetching ${modelId}…` })
  const pipelinePromise = library
    .pipeline(task as Parameters<typeof library.pipeline>[0], modelId, {
      progress_callback: (progress: { status?: string; file?: string; progress?: number }) => {
        const { status, file, progress: pct } = progress
        if (status === 'download' && file) {
          onProgress?.({ phase: 'download', detail: file })
        } else if (status === 'ready') {
          onProgress?.({ phase: 'load', detail: 'Model ready' })
        } else if (pct !== undefined) {
          onProgress?.({ phase: 'download', detail: `Downloading ${Math.round(pct)}%` })
        }
      },
    })
    .catch((error: unknown) => {
      pipelines.delete(modelId)
      throw error
    })
  pipelines.set(modelId, pipelinePromise)
  return pipelinePromise
}

// Runs a single text-generation pass and normalizes the shape across library
// versions (output may be a string or an array of { generated_text }).
export async function runLocalInference(options: LocalInferenceOptions): Promise<LocalInferenceResult> {
  const { modelId, prompt, signal } = options
  onAbort(signal)
  const pipe = await getPipeline(modelId, options.onProgress, signal)
  onAbort(signal)
  options.onProgress?.({ phase: 'generate', detail: 'Generating…' })

  const generator = pipe as (text: string, config: Record<string, unknown>) => Promise<unknown>
  const raw = await generator(prompt, {
    max_new_tokens: options.maxNewTokens ?? 220,
    temperature: options.temperature ?? 0.7,
    do_sample: true,
  })

  onAbort(signal)

  let response = ''
  if (typeof raw === 'string') {
    response = raw
  } else if (Array.isArray(raw)) {
    const first = raw[0] as { generated_text?: string } | string | undefined
    if (typeof first === 'string') response = first
    else if (first && typeof first === 'object' && 'generated_text' in first) {
      response = String((first as { generated_text: string }).generated_text)
    }
  }

  // Trim an echoed prompt prefix (instruct models often prepend it) — but only
  // when it is actually a prefix. Stripping a substring match anywhere would
  // mangle models that reformat the prompt and leak the prompt into the output.
  const promptText = prompt.trim()
  let trimmed = response.trim()
  if (promptText !== '' && trimmed.startsWith(promptText)) {
    trimmed = trimmed.slice(promptText.length).trim()
  }
  return {
    response: trimmed !== '' ? trimmed : response.trim() || 'Local model finished (empty response).',
    modelId,
    tokens: Math.max(1, Math.round(trimmed.length / 4)),
  }
}

export async function warmUpModel(modelId: string, signal?: AbortSignal): Promise<void> {
  const pipe = await getPipeline(modelId, undefined, signal)
  void pipe
}
