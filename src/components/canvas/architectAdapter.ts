import { BrainFactory } from '../../core/brain'
import {
  Architect,
  ArchitectCancelledError,
  FireworksArchitect,
  OllamaArchitect,
  PromptBuilder,
  PROVIDER_CATALOG,
  SpecificationTransformer,
  SpecificationValidator,
} from '../../core/architect'
import { useBrainStore } from '../../store/useBrainStore'
import { getBrainMemoryStore } from '../../core/memory/brainMemory'
import { isFinetuneIntent, planFineTune } from './finetuneAdapter'
import { isFireworksModel } from '../../core/providers/fireworksModels'
import { DEFAULT_PROVIDER } from '../../core/brain/defaults'
import type { Brain, ProviderHealth, ProviderId } from '../../core/domain'
import type { BrainSpec, CapabilityType } from '../../core/types'
import type { ArchitectProvider, SpecificationNode } from '../../core/architect'

const factory = new BrainFactory()
const validator = new SpecificationValidator()
const transformer = new SpecificationTransformer(factory)
const promptBuilder = new PromptBuilder()

// Real Architect facade. Fireworks is the default provider; Ollama is the
// local option. Until the providers implement invokeModel, design() throws
// ArchitectProviderNotImplementedError and the adapter falls back to the
// offline draft generator.
const providers: Readonly<Record<ProviderId, ArchitectProvider>> = {
  fireworks: new FireworksArchitect(promptBuilder, validator),
  ollama: new OllamaArchitect(promptBuilder, validator),
}

const architect = new Architect({
  providers,
  validator,
  transformer,
  promptBuilder,
  defaultProviderId: 'fireworks',
})

// Keeps chain-of-thought readable in the log panel without swallowing it.
const MAX_REASONING_CHARS = 900

function clipReasoning(reasoning: string): string {
  const normalized = reasoning.replace(/\s+/g, ' ').trim()
  if (normalized.length <= MAX_REASONING_CHARS) return normalized
  return `${normalized.slice(0, MAX_REASONING_CHARS)}…`
}

const revealDelay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

// "Think out loud" reveal. Instead of dropping the whole graph at once, nodes
// appear one by one — each stamped with the architect's reason for placing it —
// then the edges draw themselves in. A narrated design feels alive rather than
// instant. Respects the AbortSignal so Stop cancels the reveal too.
async function revealBrainDesign(
  spec: BrainSpec,
  specNodes: readonly SpecificationNode[],
  signal?: AbortSignal,
): Promise<void> {
  const store = useBrainStore.getState()
  const reasons = new Map(specNodes.map((node) => [node.id, node.reason]))
  store.beginReveal()

  for (const node of spec.nodes) {
    if (signal?.aborted) {
      store.endReveal()
      return
    }
    const reason = reasons.get(node.id) ?? ''
    store.setDesignNarration(reason)
    store.revealNode({ ...node, reason, status: 'idle' })
    await revealDelay(420)
  }

  for (const connection of spec.connections) {
    if (signal?.aborted) {
      store.endReveal()
      return
    }
    store.revealConnection(connection)
    await revealDelay(160)
  }

  store.endReveal()
}

export function isFireworksApiKeyConfigured(): boolean {
  const env = (import.meta as { env?: Readonly<Record<string, string | undefined>> }).env
  const value = env?.VITE_FIREWORKS_API_KEY
  return typeof value === 'string' && value.trim() !== ''
}

export function getActiveProviderId(): ProviderId {
  return useBrainStore.getState().activeProviderId
}

const FIREWORKS_MODEL_KEY = 'openbrain:fireworks-model'

// The Fireworks model chosen in Settings, or null when the user hasn't
// overridden the default. This drives the architect's model AND the model
// baked into newly generated brains.
export function getSelectedFireworksModel(): string | null {
  try {
    const value = localStorage.getItem(FIREWORKS_MODEL_KEY)
    return value !== null && isFireworksModel(value) ? value : null
  } catch {
    return null
  }
}

export function setSelectedFireworksModel(modelId: string): void {
  try {
    if (isFireworksModel(modelId)) {
      localStorage.setItem(FIREWORKS_MODEL_KEY, modelId)
    }
  } catch {
    /* storage unavailable — ignore */
  }
}

export interface ProviderOverview {
  readonly id: ProviderId
  readonly name: string
  readonly model: string
  readonly health: ProviderHealth
}

// Live health for every catalogued provider, in catalog order. Each status
// comes from a real .health() call — nothing is faked as available. Failures
// (e.g. a local Ollama unreachable from a deployed origin) are reported as
// unavailable instead of rejecting the whole list. Local providers (Ollama)
// are never network-checked from a non-localhost origin — the browser would
// just throw CORS errors on every health poll.
function isLocalOrigin(): boolean {
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.startsWith('192.168.')
}

export async function listProviderHealth(): Promise<readonly ProviderOverview[]> {
  const overviews: ProviderOverview[] = []
  for (const entry of PROVIDER_CATALOG) {
    const provider = providers[entry.id]
    let health: ProviderHealth
    if (!provider || (entry.kind === 'local' && !isLocalOrigin())) {
      health = { status: 'unavailable', checkedAt: new Date().toISOString() }
    } else {
      try {
        health = await provider.health()
      } catch {
        health = { status: 'unavailable', checkedAt: new Date().toISOString() }
      }
    }
    overviews.push({ id: entry.id, name: entry.name, model: entry.defaultModel, health })
  }
  return overviews
}

// Inverse of brainAdapter's toDomainNode/toDomainEdge: converts an immutable
// domain Brain back into the legacy store shape (id/type/x/y + edges).
export function toLegacyBrainSpec(brain: Brain): BrainSpec {
  return {
    nodes: brain.nodes.map((node) => ({
      id: node.id,
      type: node.type as CapabilityType,
      x: node.position.x,
      y: node.position.y,
      configuration: node.configuration,
    })),
    connections: brain.edges.map((edge) => ({
      id: edge.id,
      from: edge.source,
      fromPort: edge.sourcePort,
      to: edge.target,
      toPort: edge.targetPort,
    })),
  }
}

// Generates a brain from a prompt through the real Architect (design ->
// validate -> materialize). Fine-tune intents are routed to the fine-tune
// planner instead, which designs a dry-run job and surfaces it on the canvas.
// Pass an AbortSignal to allow the user to cancel an in-flight generation.
// When `answers` are provided (from the clarify step) they are appended as
// context and the clarify pass is skipped. A user-cancelled request never
// falls back — it just stops.
export async function generateFromPrompt(
  prompt: string,
  viewport: { width: number; height: number },
  signal?: AbortSignal,
  answers?: readonly string[],
): Promise<void> {
  const store = useBrainStore.getState()

  if (isFinetuneIntent(prompt)) {
    try {
      await planFineTune(prompt, viewport)
    } catch (error) {
      if (signal?.aborted) {
        store.addLog('Fine-tune planning stopped by user', 'warning')
        return
      }
      const detail = error instanceof Error ? error.message : String(error)
      store.addLog(`Fine-tune planning failed (${detail})`, 'error')
    }
    return
  }

  if (!answers) {
    const questions = await askClarifying(prompt, signal)
    if (questions.length > 0) {
      store.setClarify({ prompt, questions, viewport })
      store.addLog('Architect has a few questions before designing', 'info')
      return
    }
  }

  const enrichedPrompt =
    answers && answers.length > 0
      ? buildAnswerContext(prompt, answers)
      : prompt

  store.addLog('Architect analyzing request…', 'info')
  store.setGenerationError(null)
  store.setThinking('Analyzing request…')
  let reasoningBuffer = ''

  try {
    const providerId = getActiveProviderId()
    const selectedModel = getSelectedFireworksModel()
    const specification = await architect.design(
      {
        prompt: enrichedPrompt,
        signal,
        context:
          providerId === 'fireworks' && selectedModel !== null
            ? { providerId, model: selectedModel }
            : undefined,
        onReasoning: (reasoning) => {
          reasoningBuffer += reasoning
          store.setThinking(reasoningBuffer.trim())
        },
      },
      providerId,
    )
    // The Settings model pick is authoritative: bake it into the brain's
    // provider so the LLM executor uses it, overriding the architect's own
    // modelRecommendation.
    const providerOverride =
      providerId === 'fireworks' && selectedModel !== null
        ? { ...DEFAULT_PROVIDER, model: selectedModel }
        : undefined
    const brain = architect.materialize(specification, providerOverride)
    // A fresh design is a new brain: wipe the previous brain's cross-run
    // memory for this project so its old answers don't leak into the new one.
    const projectId = useBrainStore.getState().projectId
    if (projectId) {
      void getBrainMemoryStore().write(projectId, [])
    }
    const spec = toLegacyBrainSpec(brain)
    await revealBrainDesign(spec, specification.nodes, signal)
    store.setBrainTitle(deriveTitle(prompt))
    if (reasoningBuffer.trim()) {
      const clipped = clipReasoning(reasoningBuffer.trim())
      store.setLastReasoning(clipped)
      store.addLog(`Reasoning: ${clipped}`, 'info')
    } else {
      store.setLastReasoning('')
    }
    store.setThinking('')
    store.addLog(`Architect designed a ${spec.nodes.length}-node brain`, 'success')
  } catch (error) {
    if (error instanceof ArchitectCancelledError || signal?.aborted) {
      store.setGenerationError(null)
      store.setThinking('')
      store.addLog('Generation stopped by user', 'warning')
      return
    }
    const providerName =
      PROVIDER_CATALOG.find((entry) => entry.id === getActiveProviderId())?.name ?? 'Provider'
    const detail = error instanceof Error ? error.message : String(error)
    const reason = `${providerName} request failed (${detail})`
    store.setGenerationError(reason)
    store.setThinking('')
    store.addLog(reason, 'error')
  }
}

// First pass: ask the active provider for clarifying questions. Any failure
// yields [] so the design flow proceeds without friction.
async function askClarifying(
  prompt: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const providerId = getActiveProviderId()
  const provider = providers[providerId]
  if (!provider) return []
  try {
    return await provider.askClarifyingQuestions({ prompt, signal })
  } catch {
    return []
  }
}

function buildAnswerContext(prompt: string, answers: readonly string[]): string {
  const lines = answers.map((answer, index) => `Q${index + 1}: ${answer.trim()}`)
  return `${prompt}\n\nUser clarifications:\n${lines.join('\n')}`
}

// Short, human, title cap. Lazy 5-word heading, then fall back to a generic.
function deriveTitle(prompt: string): string {
  const trimmed = prompt.replace(/\s+/g, ' ').trim()
  if (!trimmed) return 'Untitled Brain'
  const words = trimmed.split(/\s+/).filter(Boolean)
  const base = words.length <= 6 ? trimmed : `${words.slice(0, 6).join(' ')} …`
  return base
    .replace(/[.?!/\\]$/, '')
    .replace(/(^|\s)(a|an|the|build|create|design|make|for|of|that)(\s|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48) || 'Untitled Brain'
}
