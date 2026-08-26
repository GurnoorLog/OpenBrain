import type { ProviderHealth } from '../domain'
import { FineTuneProviderError, FineTuneUnconfiguredError } from './FineTuneErrors'
import type { FineTuneJobProvider, JobStatus, JobStatusState } from './FineTuneJobProvider'
import type { FineTuneJobSpec } from './FineTuneJobSpec'
import type { TokenProvider } from './TokenProvider'

export const FIREWORKS_BASE_URL = 'https://api.fireworks.ai'

// The Fireworks managed fine-tuning surface. This provider implements the
// FineTuneJobProvider port so the executor (and its confirmation gate) can
// launch real jobs without knowing anything about Fireworks.
//
// API shape (verified against docs.fireworks.ai):
//   - account id  : GET  /v1/accounts            -> { accounts: [{ name: "accounts/<id>" }] }
//   - dataset     : POST /v1/accounts/{id}/datasets            body { datasetId, dataset: { userUploaded: {} } }
//   - upload      : POST /v1/accounts/{id}/datasets/{ds}:upload  (multipart file)
//   - SFT job     : POST /v1/accounts/{id}/supervisedFineTuningJobs
//   - RFT job     : POST /v1/accounts/{id}/reinforcementFineTuningJobs
//   - job status  : GET  /v1/accounts/{id}/supervisedFineTuningJobs/{job}  (or .../reinforcementFineTuningJobs/...)
//
// Job ids are Fireworks resource names (e.g.
// "accounts/x/supervisedFineTuningJobs/<uuid>") so getJobStatus can parse the
// resource type without an extra round trip.
export interface FireworksProviderOptions {
  readonly tokenProvider: TokenProvider
  readonly baseUrl?: string
  readonly timeoutMs?: number
  // Optional Fireworks base model resource name. Fireworks has its own catalog
  // (the planner's HF model ids are descriptive only). Defaults to a small,
  // tunable, <16B model so RFT stays free.
  readonly baseModel?: string
  // Optional reward evaluator resource name, REQUIRED for RFT jobs, e.g.
  // "accounts/<accountId>/evaluators/<name>".
  readonly evaluatorResourceName?: string
  // Optional precomputed account id (test seam). When unset it is resolved
  // from GET /v1/accounts on first use and cached.
  readonly accountId?: string
  // Optional JSONL training data to upload as the dataset. When present, the
  // provider creates + uploads the dataset before launching. When absent, the
  // dataset must already exist under the spec-derived name.
  readonly datasetJsonl?: string
}

export class FireworksProvider implements FineTuneJobProvider {
  readonly baseUrl: string
  private readonly tokenProvider: TokenProvider
  private readonly timeoutMs: number
  private readonly baseModel: string
  private readonly evaluatorResourceName: string | undefined
  private readonly injectedAccountId: string | undefined
  private readonly datasetJsonl: string | undefined
  private resolvedAccountId: string | null = null

  constructor(options: FireworksProviderOptions) {
    this.tokenProvider = options.tokenProvider
    this.baseUrl = (options.baseUrl ?? FIREWORKS_BASE_URL).replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs ?? 20_000
    this.baseModel = options.baseModel ?? 'accounts/fireworks/models/qwen3-4b'
    this.evaluatorResourceName = options.evaluatorResourceName
    this.injectedAccountId = options.accountId
    this.datasetJsonl = options.datasetJsonl
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
        message: 'Fireworks fine-tuning is not configured (missing API key).',
      }
    }
    const started = Date.now()
    try {
      await this.request('/v1/accounts', { method: 'GET' })
      return {
        status: 'available',
        latencyMs: Date.now() - started,
        checkedAt,
        message: 'Fireworks API is reachable.',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { status: 'unavailable', latencyMs: Date.now() - started, checkedAt, message }
    }
  }

  async launchJob(spec: FineTuneJobSpec): Promise<{ jobId: string }> {
    this.requireConfigured()
    const accountId = await this.resolveAccountId()
    const datasetName = await this.ensureDataset(accountId, spec)

    if (spec.trainingType === 'rft') {
      return this.launchRftJob(accountId, spec, datasetName)
    }
    return this.launchSftJob(accountId, spec, datasetName)
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    this.requireConfigured()
    const parsed = parseJobResource(jobId)
    if (!parsed) {
      return { status: 'unknown', progress: 0, message: `Unrecognized job id: ${jobId}` }
    }
    const accountId = parsed.accountId ?? (await this.resolveAccountId())
    const path =
      parsed.kind === 'rft'
        ? `/v1/accounts/${encodeURIComponent(accountId)}/reinforcementFineTuningJobs/${encodeURIComponent(parsed.id)}`
        : `/v1/accounts/${encodeURIComponent(accountId)}/supervisedFineTuningJobs/${encodeURIComponent(parsed.id)}`
    const data = await this.request(path, { method: 'GET' })
    return readJobStatus(data)
  }

  // ---- internal helpers ---------------------------------------------------

  private requireConfigured(): void {
    if (!this.tokenProvider.getToken()) {
      throw new FineTuneUnconfiguredError()
    }
  }

  private authHeaders(): Readonly<Record<string, string>> {
    const token = this.tokenProvider.getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  private async resolveAccountId(): Promise<string> {
    if (this.injectedAccountId) return this.injectedAccountId
    if (this.resolvedAccountId) return this.resolvedAccountId
    const data = await this.request('/v1/accounts', { method: 'GET' })
    const accountId = readAccountId(data)
    if (!accountId) {
      throw new FineTuneProviderError('Fireworks did not return any account for this API key.')
    }
    this.resolvedAccountId = accountId
    return accountId
  }

  // Creates (and uploads) the training dataset if datasetJsonl is configured,
  // otherwise assumes the dataset already exists under the spec-derived name.
  // Returns the dataset resource name used in the job body.
  private async ensureDataset(accountId: string, spec: FineTuneJobSpec): Promise<string> {
    const datasetId = resourceIdFor(spec.dataset)
    if (this.datasetJsonl) {
      await this.createDatasetEntry(accountId, datasetId)
      await this.uploadDatasetFile(accountId, datasetId, this.datasetJsonl)
    }
    return `accounts/${accountId}/datasets/${datasetId}`
  }

  private async createDatasetEntry(accountId: string, datasetId: string): Promise<void> {
    const data = await this.request(`/v1/accounts/${encodeURIComponent(accountId)}/datasets`, {
      method: 'POST',
      body: { datasetId, dataset: { userUploaded: {} } },
    })
    const record = asRecord(data)
    const name = typeof record['name'] === 'string' ? record['name'] : undefined
    if (name && !name.includes(datasetId)) {
      throw new FineTuneProviderError(`Fireworks created an unexpected dataset resource "${name}".`)
    }
  }

  private async uploadDatasetFile(accountId: string, datasetId: string, jsonl: string): Promise<void> {
    const form = new FormData()
    form.append('file', new Blob([jsonl], { type: 'application/jsonl' }), `${datasetId}.jsonl`)
    await this.request(`/v1/accounts/${encodeURIComponent(accountId)}/datasets/${encodeURIComponent(datasetId)}:upload`, {
      method: 'POST',
      body: form,
      form: true,
    })
  }

  private async launchSftJob(
    accountId: string,
    spec: FineTuneJobSpec,
    datasetName: string,
  ): Promise<{ jobId: string }> {
    const data = await this.request(
      `/v1/accounts/${encodeURIComponent(accountId)}/supervisedFineTuningJobs`,
      {
        method: 'POST',
        body: buildSftBody(accountId, spec, datasetName, this.baseModel),
      },
    )
    return readJobId(data)
  }

  private async launchRftJob(
    accountId: string,
    spec: FineTuneJobSpec,
    datasetName: string,
  ): Promise<{ jobId: string }> {
    if (!this.evaluatorResourceName) {
      throw new FineTuneProviderError(
        'RFT requires a reward evaluator resource in your Fireworks account. Create one, then set it on the fine-tune provider before confirming an RFT job.',
      )
    }
    const data = await this.request(
      `/v1/accounts/${encodeURIComponent(accountId)}/reinforcementFineTuningJobs`,
      {
        method: 'POST',
        body: buildRftBody(accountId, spec, datasetName, this.baseModel, this.evaluatorResourceName),
      },
    )
    return readJobId(data)
  }

  private async request(
    path: string,
    options: { method?: 'GET' | 'POST'; body?: unknown; form?: boolean } = {},
  ): Promise<unknown> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const isForm = options.form === true && options.body instanceof FormData
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method ?? 'POST',
        headers: {
          ...(isForm ? {} : { 'Content-Type': 'application/json' }),
          ...this.authHeaders(),
        },
        body: isForm ? (options.body as FormData) : options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      })
      const text = await response.text()
      if (!response.ok) {
        const detail = text.trim() ? text.slice(0, 500) : response.statusText
        throw new FineTuneProviderError(`Fireworks HTTP ${response.status}: ${detail}`)
      }
      return text.trim() === '' ? {} : JSON.parse(text)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new FineTuneProviderError(`Fireworks request timed out after ${this.timeoutMs}ms.`)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

// ---- request body builders ------------------------------------------------

function buildSftBody(
  accountId: string,
  spec: FineTuneJobSpec,
  datasetName: string,
  baseModel: string,
): Readonly<Record<string, unknown>> {
  return {
    dataset: datasetName,
    baseModel,
    outputModel: `accounts/${accountId}/models/${resourceIdFor(spec.targetRepoName)}`,
    epochs: spec.hyperparameters.epochs,
    learningRate: spec.hyperparameters.learningRate,
    loraRank: spec.method === 'full' ? undefined : spec.hyperparameters.rank,
    batchSizeSamples: spec.hyperparameters.batchSize,
    evalAutoCarveout: true,
  }
}

function buildRftBody(
  accountId: string,
  spec: FineTuneJobSpec,
  datasetName: string,
  baseModel: string,
  evaluatorResourceName: string,
): Readonly<Record<string, unknown>> {
  return {
    dataset: datasetName,
    evaluator: evaluatorResourceName,
    trainingConfig: {
      baseModel,
      outputModel: `accounts/${accountId}/models/${resourceIdFor(spec.targetRepoName)}`,
      learningRate: spec.hyperparameters.learningRate,
      loraRank: spec.method === 'full' ? undefined : spec.hyperparameters.rank,
      epochs: spec.hyperparameters.epochs,
      batchSizeSamples: spec.hyperparameters.batchSize,
    },
    inferenceParameters: {
      maxOutputTokens: 256,
      temperature: 0.7,
      topP: 0.95,
      responseCandidatesCount: 2,
    },
    lossConfig: { method: 'GRPO', klBeta: 0.1 },
    evalAutoCarveout: true,
  }
}

// ---- response parsing -----------------------------------------------------

function readAccountId(data: unknown): string | null {
  const record = asRecord(data)
  const accounts = record['accounts']
  if (!Array.isArray(accounts)) return null
  for (const entry of accounts) {
    if (typeof entry !== 'object' || entry === null) continue
    const name = asRecord(entry)['name']
    if (typeof name === 'string') {
      const match = /^accounts\/(.+)$/.exec(name)
      if (match && match[1] !== '') return match[1]
    }
  }
  return null
}

function readJobId(data: unknown): { jobId: string } {
  const record = asRecord(data)
  const name = typeof record['name'] === 'string' ? record['name'] : undefined
  if (name && name.includes('FineTuningJobs/')) return { jobId: name }
  const jobId = record['jobId'] ?? record['id'] ?? record['supervisedFineTuningJobId']
  if (typeof jobId === 'string' && jobId.trim() !== '') return { jobId }
  throw new FineTuneProviderError('Fireworks did not return a job id for the launched job.')
}

function readJobStatus(data: unknown): JobStatus {
  const record = asRecord(data)
  const rawState = typeof record['state'] === 'string' ? (record['state'] as string) : 'JOB_STATE_UNSPECIFIED'
  const progress = readProgress(record['jobProgress'])
  const status = record['status']
  const message =
    typeof status === 'object' && status !== null && typeof asRecord(status)['message'] === 'string'
      ? (asRecord(status)['message'] as string)
      : undefined
  const mapped = mapState(rawState)
  return {
    status: mapped,
    progress,
    message: message ?? (mapped === 'unknown' ? rawState : undefined),
    providerStatus: data,
  }
}

function readProgress(value: unknown): number {
  if (typeof value !== 'object' || value === null) return 0
  const percent = asRecord(value)['percent']
  return typeof percent === 'number' && Number.isFinite(percent) ? percent : 0
}

function mapState(state: string): JobStatusState {
  switch (state) {
    case 'JOB_STATE_COMPLETED':
      return 'completed'
    case 'JOB_STATE_FAILED':
    case 'JOB_STATE_CANCELLED':
    case 'JOB_STATE_CANCELLING':
    case 'JOB_STATE_EARLY_STOPPED':
    case 'JOB_STATE_EXPIRED':
    case 'JOB_STATE_PAUSED':
    case 'JOB_STATE_DELETED':
    case 'JOB_STATE_ARCHIVED':
      return 'failed'
    case 'JOB_STATE_RUNNING':
    case 'JOB_STATE_WRITING_RESULTS':
    case 'JOB_STATE_VALIDATING':
    case 'JOB_STATE_CREATING_INPUT_DATASET':
      return 'running'
    case 'JOB_STATE_CREATING':
    case 'JOB_STATE_PENDING':
    case 'JOB_STATE_RE_QUEUEING':
    case 'JOB_STATE_IDLE':
      return 'queued'
    default:
      return 'unknown'
  }
}

function parseJobResource(jobId: string): { kind: 'sft' | 'rft'; accountId: string | null; id: string } | null {
  const match = /^accounts\/([^/]+)\/(supervisedFineTuningJobs|reinforcementFineTuningJobs)\/(.+)$/.exec(
    jobId,
  )
  if (!match) return null
  return { kind: match[2] === 'reinforcementFineTuningJobs' ? 'rft' : 'sft', accountId: match[1], id: match[3] }
}

// ---- helpers --------------------------------------------------------------

function resourceIdFor(value: string): string {
  const id = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return id === '' ? 'fine-tune' : id.slice(0, 120)
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

export function isFireworksJobResourceName(value: string): boolean {
  return parseJobResource(value) !== null
}
