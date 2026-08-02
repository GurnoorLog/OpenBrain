import type { EntityId } from '../domain'
import {
  FineTuneConfirmationRequiredError,
  FineTuneError,
  FineTuneUnconfiguredError,
} from './FineTuneErrors'
import { createFineTuneEvent, FineTuneEvents, FineTuneEventType } from './FineTuneEvents'
import type { FineTuneJobSpec, FineTuneJobStatus } from './FineTuneJobSpec'
import { FineTuneValidator } from './FineTuneJobSpec'
import type { FineTuneJobProvider, JobStatusState } from './FineTuneJobProvider'
import type { TokenProvider } from './TokenProvider'

export interface FineTuneExecutorOptions {
  readonly provider: FineTuneJobProvider
  readonly tokenProvider: TokenProvider
  readonly validator?: FineTuneValidator
  readonly events?: FineTuneEvents
  readonly dryRun?: boolean
  readonly pollIntervalMs?: number
  readonly maxPollAttempts?: number
}

export interface LaunchFineTuneRequest {
  readonly spec: FineTuneJobSpec
  readonly confirmed?: boolean
}

// Executes a validated FineTuneJobSpec through a FineTuneJobProvider.
// SAFETY RULES (enforced):
//  - Dry-run is the default; a dry-run emits JobPlanned + ConfirmationRequired
//    and never touches the provider.
//  - The real path runs ONLY when confirmed:true is set AND the token provider
//    returns a non-null token. Either missing => a specific error, never a
//    silent fallback.
//  - The spec is re-validated immediately before launch: a stale/edited spec
//    does not skip validation because it was confirmed.
//  - JobStarted is emitted only after the provider API returns a real job id.
//  - Failures emit JobFailed with the real error. No retry, no silent swallow.
export class FineTuneExecutor {
  readonly provider: FineTuneJobProvider
  readonly tokenProvider: TokenProvider
  readonly validator: FineTuneValidator
  readonly events: FineTuneEvents
  readonly dryRun: boolean
  readonly pollIntervalMs: number
  readonly maxPollAttempts: number

  constructor(options: FineTuneExecutorOptions) {
    this.provider = options.provider
    this.tokenProvider = options.tokenProvider
    this.validator = options.validator ?? new FineTuneValidator()
    this.events = options.events ?? new FineTuneEvents()
    this.dryRun = options.dryRun ?? true
    this.pollIntervalMs = options.pollIntervalMs ?? 10_000
    this.maxPollAttempts = options.maxPollAttempts ?? 180
  }

  async launch(request: LaunchFineTuneRequest): Promise<EntityId> {
    const { spec } = request
    this.validator.validateOrThrow(spec)

    const jobId = crypto.randomUUID()

    if (this.dryRun) {
      this.events.emit(createFineTuneEvent(FineTuneEventType.JobPlanned, jobId, { spec }))
      this.events.emit(createFineTuneEvent(FineTuneEventType.ConfirmationRequired, jobId, { spec }))
      return jobId
    }

    if (!request.confirmed) {
      this.events.emit(createFineTuneEvent(FineTuneEventType.ConfirmationRequired, jobId, { spec }))
      throw new FineTuneConfirmationRequiredError()
    }

    // Re-validate immediately before launch in case the spec was edited after
    // it was confirmed. A stale spec must not skip validation.
    this.validator.validateOrThrow(spec)

    if (!this.tokenProvider.getToken()) {
      throw new FineTuneUnconfiguredError()
    }

    try {
      const launched = await this.provider.launchJob(spec)
      this.events.emit(
        createFineTuneEvent(FineTuneEventType.JobStarted, jobId, {
          providerJobId: launched.jobId,
        }),
      )
      void this.poll(launched.jobId, jobId, spec.targetRepoName)
      return jobId
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.events.emit(createFineTuneEvent(FineTuneEventType.JobFailed, jobId, { error: message }))
      if (error instanceof FineTuneError) throw error
      throw new FineTuneError(message)
    }
  }

  // Polls the provider for status and emits JobProgress until a terminal state
  // (completed/failed). No auto-retry: a failed job just emits JobFailed once.
  private async poll(providerJobId: string, jobId: EntityId, targetRepoName: string): Promise<void> {
    for (let attempt = 1; attempt <= this.maxPollAttempts; attempt++) {
      await sleep(this.pollIntervalMs)
      let status
      try {
        status = await this.provider.getJobStatus(providerJobId)
      } catch (error) {
        this.events.emit(
          createFineTuneEvent(FineTuneEventType.JobProgress, jobId, {
            status: 'running',
            progress: 0,
            message: `Polling error: ${error instanceof Error ? error.message : String(error)}`,
          }),
        )
        continue
      }
      if (status.status === 'completed') {
        this.events.emit(
          createFineTuneEvent(FineTuneEventType.JobCompleted, jobId, { targetRepoName }),
        )
        return
      }
      if (status.status === 'failed') {
        this.events.emit(
          createFineTuneEvent(FineTuneEventType.JobFailed, jobId, {
            error: status.message ?? 'Fine-tune job failed on the provider.',
          }),
        )
        return
      }
      this.events.emit(
        createFineTuneEvent(FineTuneEventType.JobProgress, jobId, {
          status: mapToJobStatus(status.status),
          progress: status.progress,
          message: status.message ?? status.status,
        }),
      )
    }
    // Polling budget exhausted without a terminal state: report the last known
    // running state rather than a failure. The user can keep watching via logs.
    this.events.emit(
      createFineTuneEvent(FineTuneEventType.JobProgress, jobId, {
        status: 'running',
        progress: 0,
        message: 'Still running — polling budget exhausted, job continues on the provider.',
      }),
    )
  }
}

function mapToJobStatus(state: JobStatusState): FineTuneJobStatus {
  if (state === 'completed') return 'completed'
  if (state === 'failed') return 'failed'
  return 'running'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
