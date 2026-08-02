import type { HuggingFaceProvider } from './HuggingFaceProvider'
import type {
  FineTuneCostEstimate,
  FineTuneJobSpec,
  FineTuneMethod,
  FineTuneTrainingType,
} from './FineTuneJobSpec'

export interface FineTunePlannerOptions {
  readonly provider: HuggingFaceProvider
  readonly maxBaseModelCandidates?: number
  readonly maxDatasetCandidates?: number
}

export interface FineTunePlanInput {
  readonly prompt: string
  readonly context?: string
}

// Turns a natural-language goal into a structured FineTuneJobSpec. Follows the
// legacy architect pattern (keyword/recognition-based, no LLM round trip) so
// it stays deterministic, testable, and free of hidden provider calls. It only
// queries the Hugging Face Hub to pick concrete base-model and dataset ids —
// both are read-only, dry-run-safe operations.
export class FineTunePlanner {
  readonly provider: HuggingFaceProvider
  private readonly maxBaseModelCandidates: number
  private readonly maxDatasetCandidates: number

  constructor(options: FineTunePlannerOptions) {
    this.provider = options.provider
    this.maxBaseModelCandidates = options.maxBaseModelCandidates ?? 5
    this.maxDatasetCandidates = options.maxDatasetCandidates ?? 5
  }

  async plan(input: FineTunePlanInput): Promise<FineTuneJobSpec> {
    const { prompt, context } = input
    const goal = pickLongestLine(prompt) ?? prompt
    const { datasetKeywords, datasetHint } = inferDataset(context ?? '')
    const [baseModel, dataset] = await Promise.all([
      this.selectBaseModel(goal, datasetHint),
      this.selectDataset(goal, datasetKeywords),
    ])
    const method = inferMethod(goal)
    const trainingType = inferTrainingType(goal)
    const rank = method === 'lora' ? 16 : method === 'qlora' ? 8 : 0
    const epochs = inferEpochs(goal)
    const learningRate = method === 'full' ? 2e-5 : 1e-4
    const estimatedCost = estimateFineTuneCost(method, epochs, rank, trainingType)
    const warnings = buildFineTuneWarnings(baseModel, dataset, method, trainingType)
    return {
      name: 'Fine-tune ' + (baseModel ?? 'a base model') + ' for ' + goal,
      description: `${trainingType.toUpperCase()} ${method.toUpperCase()} fine-tune of ${baseModel ?? 'unknown base model'} on ${dataset ?? 'unknown dataset'}, targeting the goal: ${goal}`,
      goal,
      baseModel,
      dataset,
      method,
      trainingType,
      hyperparameters: {
        epochs,
        learningRate,
        rank,
        batchSize: 4,
      },
      estimatedCost,
      estimatedDurationHours: estimatedCost.gpuHours,
      targetRepoName: defaultRepoName(goal),
      reasoning: this.buildReasoning(goal, baseModel, dataset, method, trainingType, estimatedCost),
      warnings,
    }
  }

  private async selectBaseModel(goal: string, datasetHint: string): Promise<string> {
    const query = inferBaseModelQuery(goal, datasetHint)
    try {
      const candidates = await this.provider.listBaseModels(query, this.maxBaseModelCandidates)
      const chosen = pickBestCandidates(candidates.map((candidate) => candidate.id))[0]
      return chosen ?? inferFallbackBaseModel(goal, datasetHint)
    } catch {
      return inferFallbackBaseModel(goal, datasetHint)
    }
  }

  private async selectDataset(goal: string, keywords: readonly string[]): Promise<string> {
    if (keywords.length > 0) {
      const query = keywords.join(' ')
      try {
        const candidates = await this.provider.listDatasets(query, this.maxDatasetCandidates)
        const chosen = pickBestCandidates(candidates.map((candidate) => candidate.id))[0]
        if (chosen) return chosen
      } catch {
        /* fall back to first keyword */
      }
      return keywords[0]
    }
    return inferFallbackDataset(goal)
  }

  private buildReasoning(
    goal: string,
    baseModel: string,
    dataset: string,
    method: FineTuneMethod,
    trainingType: FineTuneTrainingType,
    cost: FineTuneCostEstimate,
  ): string {
    const parts = [
      `Goal: ${goal}`,
      `Base model: ${baseModel || 'unspecified (needs manual selection)'}`,
      `Dataset: ${dataset || 'unspecified (needs manual selection)'}`,
      `Method: ${method} (rank ${method === 'full' ? 'n/a' : 8})`,
      `Training type: ${trainingType.toUpperCase()}${trainingType === 'rft' ? ' — free on Fireworks for base models under 16B parameters' : ''}`,
      `Estimated cost: ~$${cost.estimatedUsd} on ${cost.gpuType} for ~${cost.gpuHours}h`,
    ]
    return parts.join('\n')
  }
}

function pickLongestLine(prompt: string): string | null {
  const lines = prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort((a, b) => b.length - a.length)
  return lines[0] ?? null
}

function inferMethod(goal: string): FineTuneMethod {
  const text = goal.toLowerCase()
  if (/\b(full|all layers|full fine[- ]tune)\b/.test(text)) return 'full'
  if (/\bq[ ]?lora|quantized lora\b/.test(text)) return 'qlora'
  return 'lora'
}

function inferTrainingType(goal: string): FineTuneTrainingType {
  const text = goal.toLowerCase()
  if (
    /\b(reinforcement|rft|preference|reward|align(ment)?)\b/.test(text) ||
    /\brl\b/.test(text)
  ) {
    return 'rft'
  }
  return 'sft'
}

function inferEpochs(goal: string): number {
  const match = /(\d+)\s*epochs?/.exec(goal.toLowerCase())
  if (match) {
    const value = Number(match[1])
    if (Number.isFinite(value) && value > 0 && value <= 100) return Math.round(value)
  }
  return 3
}

function inferDataset(context: string): { datasetKeywords: readonly string[]; datasetHint: string } {
  const lines = context
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const matches: string[] = []
  const hintParts: string[] = []
  for (const line of lines) {
    const match = /(?:\bdataset(?:s)?[:=]|\busing\s+)(.+)$/i.exec(line)
    if (match) {
      const value = match[1].trim()
      matches.push(value)
      hintParts.push(value)
    }
  }
  return { datasetKeywords: matches, datasetHint: hintParts.join(' ') }
}

function inferBaseModelQuery(goal: string, datasetHint: string): string {
  const text = `${goal} ${datasetHint}`.toLowerCase()
  const domainKeywords = [
    'medical',
    'health',
    'legal',
    'code',
    'coding',
    'finance',
    'sql',
    'math',
    'science',
    'chat',
    'instruct',
    'translation',
    'summarization',
  ]
  const domain = domainKeywords.find((keyword) => text.includes(keyword))
  return domain ?? 'instruction'
}

function inferFallbackBaseModel(goal: string, datasetHint: string): string {
  const query = inferBaseModelQuery(goal, datasetHint)
  const known: Readonly<Record<string, string>> = {
    medical: 'mistralai/Mistral-7B-Instruct-v0.3',
    health: 'mistralai/Mistral-7B-Instruct-v0.3',
    legal: 'mistralai/Mistral-7B-Instruct-v0.3',
    code: 'bigcode/starcoder2-3b',
    coding: 'bigcode/starcoder2-3b',
    finance: 'Qwen/Qwen2.5-7B-Instruct',
    sql: 'Qwen/Qwen2.5-7B-Instruct',
    math: 'Qwen/Qwen2.5-7B-Instruct',
    science: 'Qwen/Qwen2.5-7B-Instruct',
    chat: 'mistralai/Mistral-7B-Instruct-v0.3',
    instruct: 'mistralai/Mistral-7B-Instruct-v0.3',
    translation: 'Qwen/Qwen2.5-7B-Instruct',
    summarization: 'Qwen/Qwen2.5-7B-Instruct',
  }
  return known[query] ?? 'mistralai/Mistral-7B-Instruct-v0.3'
}

function inferFallbackDataset(goal: string): string {
  const text = goal.toLowerCase()
  const known: Readonly<Record<string, string>> = {
    medical: 'medalpaca/medical_meadow_medical_flashcards',
    health: 'medalpaca/medical_meadow_medical_flashcards',
    legal: 'lexlms/legalbench',
    code: 'bigcode/the-stack-smol',
    coding: 'bigcode/the-stack-smol',
    finance: 'Anthropic-RL/DiligentFinance',
    sql: 'gretelai/synthetic_text_to_sql',
    math: 'math_qa',
    science: 'camel-ai/physics',
    chat: 'databricks/databricks-dolly-15k',
    instruct: 'databricks/databricks-dolly-15k',
    translation: 'Helsinki-NLP/opus-100',
    summarization: 'xsum',
  }
  const match = Object.keys(known).find((keyword) => text.includes(keyword))
  return known[match ?? inferBaseModelQuery(goal, '')] ?? 'databricks/databricks-dolly-15k'
}

function pickBestCandidates(ids: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const id of ids) {
    if (id && !seen.has(id)) {
      seen.add(id)
      unique.push(id)
    }
  }
  return unique.sort((a, b) => a.length - b.length)
}

function estimateFineTuneCost(
  method: FineTuneMethod,
  epochs: number,
  rank: number,
  trainingType: FineTuneTrainingType,
): FineTuneCostEstimate {
  // RFT is free on Fireworks for base models under 16B parameters, so the
  // estimated GPU cost is zero (RL rollouts still consume inference time, but
  // Fireworks does not bill them for eligible models).
  if (trainingType === 'rft') {
    const gpuHours = roundHours(epochs * 0.7)
    return { gpuType: 'GPU', gpuHours, estimatedUsd: 0 }
  }
  if (method === 'full') {
    const gpuHours = roundHours(epochs * 2.5)
    return { gpuType: 'A100 80GB', gpuHours, estimatedUsd: roundUsd(gpuHours * 3.5) }
  }
  if (method === 'qlora') {
    const gpuHours = roundHours(epochs * 0.35)
    return { gpuType: 'T4', gpuHours, estimatedUsd: roundUsd(gpuHours * 0.5) }
  }
  const gpuHours = roundHours(epochs * 0.7 + rank / 16)
  return { gpuType: 'T4', gpuHours, estimatedUsd: roundUsd(gpuHours * 0.5) }
}

function roundHours(value: number): number {
  return Math.round(value * 10) / 10
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100
}

function defaultRepoName(goal: string): string {
  const slug = goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `fine-tune-${slug || 'model'}`
}

function buildFineTuneWarnings(
  baseModel: string,
  dataset: string,
  method: FineTuneMethod,
  trainingType: FineTuneTrainingType,
): readonly string[] {
  const warnings: string[] = []
  if (!baseModel) warnings.push('No base model was selected; the job cannot run until one is specified.')
  if (!dataset) warnings.push('No dataset was found; the job cannot run until one is specified.')
  if (method === 'full') warnings.push('Full fine-tuning is expensive; consider LoRA or QLoRA for most tasks.')
  if (trainingType === 'rft') {
    warnings.push(
      'Reinforcement fine-tuning is FREE on Fireworks for base models under 16B parameters, but it requires a reward evaluator resource in your Fireworks account.',
    )
  }
  return warnings
}

// Returns a copy of `spec` with a different training type and everything that
// depends on it (cost estimate, duration, description, warnings) recomputed.
// Used by the confirmation screen so the user can switch SFT/RFT before
// launch without the planner round trip.
export function deriveSpecForTrainingType(
  spec: FineTuneJobSpec,
  trainingType: FineTuneTrainingType,
): FineTuneJobSpec {
  if (spec.trainingType === trainingType) return spec
  const estimatedCost = estimateFineTuneCost(
    spec.method,
    spec.hyperparameters.epochs,
    spec.hyperparameters.rank,
    trainingType,
  )
  const warnings = buildFineTuneWarnings(spec.baseModel, spec.dataset, spec.method, trainingType)
  return {
    ...spec,
    trainingType,
    estimatedCost,
    estimatedDurationHours: estimatedCost.gpuHours,
    description: `${trainingType.toUpperCase()} ${spec.method.toUpperCase()} fine-tune of ${spec.baseModel ?? 'unknown base model'} on ${spec.dataset ?? 'unknown dataset'}, targeting the goal: ${spec.goal}`,
    warnings,
  }
}

export { estimateFineTuneCost, buildFineTuneWarnings }
