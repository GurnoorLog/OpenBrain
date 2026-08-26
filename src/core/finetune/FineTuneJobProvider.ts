import type { ProviderHealth } from '../domain'
import type { FineTuneJobSpec } from './FineTuneJobSpec'

export type JobStatusState = 'queued' | 'running' | 'completed' | 'failed' | 'unknown'

export interface JobStatus {
  readonly status: JobStatusState
  readonly progress: number
  readonly message?: string
  readonly providerStatus?: unknown
}

// Port that launches and polls a fine-tune job. The executor depends only on
// this contract — it never knows which cloud (AutoTrain, Fireworks, ...)
// actually runs the job. Concrete providers (FireworksProvider, and later
// HuggingFaceProvider when the HF backend is revived) implement it.
export interface FineTuneJobProvider {
  isConfigured(): boolean
  health(): Promise<ProviderHealth>
  launchJob(spec: FineTuneJobSpec): Promise<{ jobId: string }>
  getJobStatus(jobId: string): Promise<JobStatus>
}
