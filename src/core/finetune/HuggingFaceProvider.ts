import type { ProviderHealth } from '../domain'
import { FineTuneProviderError, FineTuneUnconfiguredError } from './FineTuneErrors'
import type { FineTuneJobSpec, FineTuneMethod } from './FineTuneJobSpec'
import type { TokenProvider } from './TokenProvider'

export const HF_BASE_URL = 'https://huggingface.co/api'
export const HF_AUTOTRAIN_BASE_URL = 'https://api.autotrain.huggingface.co'

export interface HuggingFaceProviderOptions {
  readonly tokenProvider: TokenProvider
  readonly baseUrl?: string
  readonly autoTrainBaseUrl?: string
  readonly timeoutMs?: number
}

export interface HubModelSummary {
  readonly id: string
  readonly downloads: number
  readonly likes: number
}

export interface HubDatasetSummary {
  readonly id: string
  readonly downloads: number
  readonly likes: number
}

export type JobStatusState = 'queued' | 'running' | 'completed' | 'failed' | 'unknown'

export interface JobStatus {
  readonly status: JobStatusState
  readonly progress: number
  readonly message?: string
  readonly providerStatus?: unknown
}

// Talks to the Hugging Face Hub + AutoTrain APIs. The token always comes from
// the injected TokenProvider — never read from the environment here. All
// requests carry a request-level timeout and surface HTTP/network failures as
// FineTuneProviderError.
export class HuggingFaceProvider {
  readonly baseUrl: string
  readonly autoTrainBaseUrl: string
  private readonly tokenProvider: TokenProvider
  private readonly timeoutMs: number

  constructor(options: HuggingFaceProviderOptions) {
    this.tokenProvider = options.tokenProvider
    this.baseUrl = (options.baseUrl ?? HF_BASE_URL).replace(/\/+$/, '')
    this.autoTrainBaseUrl = (options.autoTrainBaseUrl ?? HF_AUTOTRAIN_BASE_URL).replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs ?? 15_000
  }

  isConfigured(): boolean {
    return this.tokenProvider.getToken() !== null
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString()
    const token = this.tokenProvider.getToken()
    if (!token) {
      return {
        status: 'unconfigured',
        checkedAt,
        message: 'Hugging Face API integration is not configured (missing token).',
      }
    }
    const started = Date.now()
    try {
      await this.request('/models?limit=1', { method: 'GET' })
      return {
        status: 'available',
        latencyMs: Date.now() - started,
        checkedAt,
        message: 'Hugging Face Hub is reachable.',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { status: 'unavailable', latencyMs: Date.now() - started, checkedAt, message }
    }
  }

  // Lists candidate base models from the Hub. Read-only; safe in dry-run.
  async listBaseModels(query = '', limit = 20): Promise<readonly HubModelSummary[]> {
    this.requireConfigured()
    const params = new URLSearchParams({ limit: String(limit) })
    if (query.trim() !== '') params.set('search', query.trim())
    const data = await this.request(`/models?${params.toString()}`, { method: 'GET' })
    return summarizeHubEntries(data)
  }

  // Lists candidate datasets from the Hub. Read-only; safe in dry-run.
  async listDatasets(query = '', limit = 20): Promise<readonly HubDatasetSummary[]> {
    this.requireConfigured()
    const params = new URLSearchParams({ limit: String(limit) })
    if (query.trim() !== '') params.set('search', query.trim())
    const data = await this.request(`/datasets?${params.toString()}`, { method: 'GET' })
    return summarizeHubEntries(data)
  }

  // Launches a real fine-tune job on AutoTrain (LLM supervised fine-tuning).
  // Only the executor may call this, and only after explicit confirmation.
  // Returns the AutoTrain project id — a real job/run ID from Hugging Face.
  async launchJob(spec: FineTuneJobSpec): Promise<{ jobId: string }> {
    this.requireConfigured()
    const body = {
      projectName: spec.targetRepoName,
      task: 'llm-sft',
      baseModel: spec.baseModel,
      dataset: spec.dataset,
      hardware: hardwareFor(spec.method),
      columnMapping: { text: 'text' },
      hubModel: spec.targetRepoName,
      params: {
        epochs: spec.hyperparameters.epochs,
        batch_size: spec.hyperparameters.batchSize,
        learning_rate: spec.hyperparameters.learningRate,
        lora_r: spec.method === 'full' ? undefined : spec.hyperparameters.rank,
        lora_alpha: spec.method === 'full' ? undefined : spec.hyperparameters.rank * 2,
        use_peft: spec.method !== 'full',
        quantization: spec.method === 'qlora' ? 'int4' : undefined,
      },
    }
    const data = await this.autoTrainRequest('/api/projects', { method: 'POST', body })
    const jobId = readJobId(data)
    if (!jobId) {
      throw new FineTuneProviderError('AutoTrain did not return a job id for the launched project.')
    }
    return { jobId }
  }

  // Polls a launched AutoTrain project for status. Safe to call repeatedly.
  async getJobStatus(jobId: string): Promise<JobStatus> {
    this.requireConfigured()
    const data = await this.autoTrainRequest(`/api/projects/${encodeURIComponent(jobId)}`, {
      method: 'GET',
    })
    return readJobStatus(jobId, data)
  }

  private requireConfigured(): void {
    if (!this.tokenProvider.getToken()) {
      throw new FineTuneUnconfiguredError()
    }
  }

  private authHeaders(): Readonly<Record<string, string>> {
    const token = this.tokenProvider.getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  // Requests against the main Hub API (models, datasets, health).
  private async request(
    path: string,
    options: { method?: 'GET' | 'POST'; body?: unknown } = {},
  ): Promise<unknown> {
    return this.fetchJson(`${this.baseUrl}${path}`, options)
  }

  // Requests against the AutoTrain backend (job creation + polling).
  private async autoTrainRequest(
    path: string,
    options: { method?: 'GET' | 'POST'; body?: unknown } = {},
  ): Promise<unknown> {
    return this.fetchJson(`${this.autoTrainBaseUrl}${path}`, options)
  }

  private async fetchJson(
    url: string,
    options: { method?: 'GET' | 'POST'; body?: unknown },
  ): Promise<unknown> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(url, {
        method: options.method ?? 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      })
      const text = await response.text()
      if (!response.ok) {
        const detail = text.trim() ? text.slice(0, 500) : response.statusText
        throw new FineTuneProviderError(`HTTP ${response.status}: ${detail}`)
      }
      return text.trim() === '' ? {} : JSON.parse(text)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new FineTuneProviderError(`Request timed out after ${this.timeoutMs}ms.`)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

function hardwareFor(method: FineTuneMethod): string {
  if (method === 'full') return 'spaces-a10g-large'
  if (method === 'qlora') return 'spaces-t4-small'
  return 'spaces-t4-small'
}

function readJobId(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const record = data as Record<string, unknown>
  const id = record['id'] ?? record['projectId'] ?? record['jobId']
  return typeof id === 'string' && id.trim() !== '' ? id : typeof id === 'number' ? String(id) : null
}

function readJobStatus(jobId: string, data: unknown): JobStatus {
  if (typeof data !== 'object' || data === null) {
    return { status: 'unknown', progress: 0, message: `Empty response for job ${jobId}.` }
  }
  const record = data as Record<string, unknown>
  const trainingStatus =
    typeof record['training_status'] === 'string' ? record['training_status'] : undefined
  const rawStatus = record['status']
  const progress = toNumber(record['progress'] ?? record['percent_complete'] ?? 0)
  const message =
    typeof record['training_status'] === 'string'
      ? (record['training_status'] as string)
      : typeof record['status'] === 'string'
        ? (record['status'] as string)
        : undefined
  return {
    status: mapStatus(trainingStatus, rawStatus),
    progress,
    message,
    providerStatus: data,
  }
}

function mapStatus(trainingStatus: string | undefined, rawStatus: unknown): JobStatusState {
  if (trainingStatus) {
    const value = trainingStatus.toLowerCase()
    if (value.includes('fail') || value.includes('error')) return 'failed'
    if (value.includes('complet') || value.includes('success')) return 'completed'
    if (value.includes('run') || value.includes('train')) return 'running'
    if (value.includes('process') || value.includes('queued') || value.includes('wait')) return 'queued'
    return 'unknown'
  }
  // Numeric AutoTrain status: >= 20 => running, 3 => data processing (queued),
  // others (e.g. 9) => failed. Fall back to unknown when we can't tell.
  if (typeof rawStatus === 'number') {
    if (rawStatus === 9) return 'failed'
    if (rawStatus >= 20) return 'running'
    if (rawStatus === 3 || rawStatus === 0) return 'queued'
    return 'unknown'
  }
  if (typeof rawStatus === 'string') {
    const value = rawStatus.toLowerCase()
    if (value.includes('fail') || value.includes('error')) return 'failed'
    if (value.includes('complet') || value.includes('success')) return 'completed'
    if (value.includes('run') || value.includes('train')) return 'running'
    return 'unknown'
  }
  return 'unknown'
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function summarizeHubEntries(data: unknown): readonly HubModelSummary[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const record = entry as Record<string, unknown>
    const id = record['id']
    if (typeof id !== 'string' || id === '') return []
    const num = (value: unknown): number => (typeof value === 'number' ? value : 0)
    return [
      {
        id,
        downloads: num(record['downloads']),
        likes: num(record['likes']),
      },
    ]
  })
}
