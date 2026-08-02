import {
  EnvTokenProvider,
  FineTuneConfirmationRequiredError,
  FineTuneEventType,
  FIREWORKS_TOKEN_ENV_KEY,
  FireworksProvider,
  HF_TOKEN_ENV_KEY,
  HuggingFaceProvider,
} from '../../core/finetune'
import type { FineTuneJobSpec } from '../../core/finetune'
import { FineTuneExecutor, FineTunePlanner, FineTuneValidator } from '../../core/finetune'
import type { FineTuneExecutorOptions, TokenProvider } from '../../core/finetune'
import { useBrainStore } from '../../store/useBrainStore'
import type { BrainSpec, CapabilityType } from '../../core/types'

// Adapter bridging the fine-tune core module into the legacy store/canvas.
// Mirrors architectAdapter: a facade around the domain services with honest
// logging. Tokens always flow through the injected TokenProvider instances —
// the adapter never reads the environment variables itself.

interface FineTuneServices {
  readonly plannerProvider: HuggingFaceProvider
  readonly launchProvider: FireworksProvider
  readonly planner: FineTunePlanner
  readonly validator: FineTuneValidator
  readonly executor: FineTuneExecutor
}

interface FineTuneTokenSources {
  readonly hfTokenProvider: TokenProvider
  readonly launchTokenProvider: TokenProvider
}

function createServices(
  tokens: FineTuneTokenSources,
  executorOverrides: Partial<Pick<FineTuneExecutorOptions, 'pollIntervalMs' | 'maxPollAttempts'>> = {},
): FineTuneServices {
  // The planner reads the Hugging Face Hub (model/dataset lists) — read-only.
  // The executor launches real jobs on Fireworks. Each gets its own token
  // source so the Fireworks key is never sent to Hugging Face and vice versa.
  const plannerProvider = new HuggingFaceProvider({ tokenProvider: tokens.hfTokenProvider })
  const launchProvider = new FireworksProvider({ tokenProvider: tokens.launchTokenProvider })
  const planner = new FineTunePlanner({ provider: plannerProvider })
  const validator = new FineTuneValidator()
  // dryRun stays false here: the confirmed:true flag (only ever set by
  // confirmAndLaunch) is what flips the real path on. Planning keeps calling
  // with confirmed:false, which is the true dry-run.
  const executor = new FineTuneExecutor({
    provider: launchProvider,
    tokenProvider: tokens.launchTokenProvider,
    validator,
    dryRun: false,
    ...executorOverrides,
  })
  return { plannerProvider, launchProvider, planner, validator, executor }
}

function defaultTokens(): FineTuneTokenSources {
  return {
    hfTokenProvider: new EnvTokenProvider(HF_TOKEN_ENV_KEY),
    launchTokenProvider: new EnvTokenProvider(FIREWORKS_TOKEN_ENV_KEY),
  }
}

let services: FineTuneServices = createServices(defaultTokens())

// Swaps the token sources. The app uses EnvTokenProvider today; a per-user
// storage backend (e.g. Supabase) can be wired here later without touching the
// core executor or provider. Also the test seam.
export function setFineTuneTokenProvider(
  tokens: Partial<FineTuneTokenSources>,
  executorOverrides?: Partial<Pick<FineTuneExecutorOptions, 'pollIntervalMs' | 'maxPollAttempts'>>,
): void {
  services = createServices({ ...defaultTokens(), ...tokens }, executorOverrides)
}

// Sole "set/not set" signal for the Hugging Face (planner) token. The token
// value itself never leaves the TokenProvider.
export function isHfTokenConfigured(): boolean {
  return services.plannerProvider.isConfigured()
}

export async function listHuggingFaceHealth() {
  return services.plannerProvider.health()
}

// Keyword recognition, mirroring legacyArchitect.generateBrain. Keeps routing
// deterministic and free of provider round trips.
export function isFinetuneIntent(prompt: string): boolean {
  const text = prompt.toLowerCase()
  return (
    /\b(fine[- ]?tune|finetune|train|retrain)\b/.test(text) &&
    /\b(model|llm|lm|language model|transformer)\b/.test(text) &&
    !/\b(design|diagram|draw|make a flow|build a brain)\b/.test(text)
  )
}

// Plans a fine-tune job from natural language and materializes it onto the
// canvas as a finetune node feeding an output node. Never touches the job API —
// the planner only reads the (read-only) model/dataset lists.
export async function planFineTune(
  prompt: string,
  viewport: { width: number; height: number },
): Promise<FineTuneJobSpec> {
  const store = useBrainStore.getState()
  store.addLog('Fine-tune planner analyzing request…', 'info')

  const spec = await services.planner.plan({ prompt })
  const errors = services.validator.validate(spec)
  if (errors.length > 0) {
    store.addLog(`Fine-tune spec invalid: ${errors.map((e) => e.message).join(' ')}`, 'warning')
  }

  const specNode = buildSpecNodes(viewport)
  store.setBrain(specNode)
  store.setPendingFineTune(spec)
  store.addLog(
    `Fine-tune planned: ${spec.method} on ${spec.baseModel} with ${spec.dataset} (est. $${spec.estimatedCost.estimatedUsd}, ~${spec.estimatedCost.gpuHours}h on ${spec.estimatedCost.gpuType})`,
    'success',
  )
  store.addLog('Review the plan and confirm before any job is submitted.', 'warning')
  return spec
}

// Runs the executor without confirmation, which emits ConfirmationRequired and
// never submits. Kept for parity; the app flow goes through the confirmation
// modal instead.
export async function confirmAndDryRun(spec: FineTuneJobSpec): Promise<void> {
  const store = useBrainStore.getState()
  store.addLog('Dry-run validating fine-tune spec…', 'info')
  try {
    await services.executor.launch({ spec, confirmed: false })
    store.addLog('Dry-run complete: job would be submitted to Fireworks after confirmation.', 'success')
  } catch (error) {
    if (error instanceof FineTuneConfirmationRequiredError) {
      store.addLog('Dry-run complete: job requires confirmation before any submission.', 'success')
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    store.addLog(`Dry-run failed: ${message}`, 'error')
  }
}

export interface FineTuneJobRun {
  readonly jobId: string
  readonly spec: FineTuneJobSpec
  readonly dispose: () => void
}

// THE ONLY PATH that sets confirmed:true in the entire app. Reached from the
// confirmation screen's "Confirm & Launch" button — no timer, no auto-trigger,
// no other button may call this. Subscribes the live fine-tune node status and
// the Agent Log to the job lifecycle (JobStarted -> JobProgress ->
// JobFailed/JobCompleted) and disposes the listeners when the job ends.
export function confirmAndLaunch(spec: FineTuneJobSpec): FineTuneJobRun {
  const store = useBrainStore.getState()
  store.setNode('finetune', { status: 'running', output: { status: 'submitting…' } })
  store.addLog('Confirming fine-tune job — submitting to Fireworks.', 'info')

  const disposers: (() => void)[] = []
  disposers.push(
    services.executor.events.on(FineTuneEventType.JobStarted, (event) => {
      store.setNode('finetune', { status: 'running', output: { jobId: event.providerJobId } })
      store.addLog(`Fine-tune job started on Fireworks (job ${event.providerJobId}).`, 'success')
    }),
  )
  disposers.push(
    services.executor.events.on(FineTuneEventType.JobProgress, (event) => {
      store.setNode('finetune', { status: 'running', output: { progress: event.progress, message: event.message } })
      store.addLog(`Fine-tune progress: ${event.message} (${event.progress}%).`, 'info')
    }),
  )
  disposers.push(
    services.executor.events.on(FineTuneEventType.JobFailed, (event) => {
      store.setNode('finetune', { status: 'error', error: event.error })
      store.addLog(`Fine-tune job failed: ${event.error}`, 'error')
      for (const dispose of disposers) dispose()
    }),
  )
  disposers.push(
    services.executor.events.on(FineTuneEventType.JobCompleted, (event) => {
      store.setNode('finetune', { status: 'success', output: { model: event.targetRepoName } })
      store.addLog(`Fine-tune complete. Model written to ${event.targetRepoName}.`, 'success')
      for (const dispose of disposers) dispose()
    }),
  )
  disposers.push(
    services.executor.events.on(FineTuneEventType.ConfirmationRequired, () => {
      store.addLog('Job requires confirmation before launch — nothing was submitted.', 'warning')
      for (const dispose of disposers) dispose()
    }),
  )

  const jobId = crypto.randomUUID()
  void services.executor
    .launch({ spec, confirmed: true })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      store.setNode('finetune', { status: 'error', error: message })
      store.addLog(`Fine-tune launch failed: ${message}`, 'error')
      for (const dispose of disposers) dispose()
    })

  return {
    jobId,
    spec,
    dispose: () => {
      for (const dispose of disposers) dispose()
    },
  }
}

function buildSpecNodes(viewport: { width: number; height: number }): BrainSpec {
  const centerX = Math.round(viewport.width / 2)
  const centerY = Math.round(viewport.height / 2)
  const finetuneNode = {
    id: 'finetune',
    type: 'finetune' as CapabilityType,
    x: centerX - 160,
    y: centerY - 40,
  }
  const outputNode = {
    id: 'output',
    type: 'output' as CapabilityType,
    x: centerX + 40,
    y: centerY - 40,
  }
  return {
    nodes: [finetuneNode, outputNode],
    connections: [
      {
        id: 'finetune-to-output',
        from: 'finetune',
        fromPort: 'model',
        to: 'output',
        toPort: 'result',
      },
    ],
  }
}
