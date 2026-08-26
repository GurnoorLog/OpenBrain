import { FineTuneValidationError } from './FineTuneErrors'

export type FineTuneMethod = 'lora' | 'qlora' | 'full'

// How the job is trained. 'sft' = supervised fine-tuning (billed per train
// token on Fireworks). 'rft' = reinforcement fine-tuning (FREE on Fireworks
// for base models under 16B parameters). The planner infers a default; the
// user can override it in the confirmation modal.
export type FineTuneTrainingType = 'sft' | 'rft'

export type FineTuneJobStatus = 'planned' | 'confirmation_required' | 'running' | 'completed' | 'failed'

export interface FineTuneHyperparameters {
  readonly epochs: number
  readonly learningRate: number
  readonly rank: number
  readonly batchSize: number
}

export interface FineTuneCostEstimate {
  readonly gpuType: string
  readonly gpuHours: number
  readonly estimatedUsd: number
}

// A validated, structured fine-tuning plan. Produced by the FineTunePlanner
// from natural language, consumed by the FineTuneExecutor. It is deliberately
// decoupled from the provider that eventually runs it.
export interface FineTuneJobSpec {
  readonly name: string
  readonly description: string
  readonly goal: string
  readonly baseModel: string
  readonly dataset: string
  readonly method: FineTuneMethod
  readonly trainingType: FineTuneTrainingType
  readonly hyperparameters: FineTuneHyperparameters
  readonly estimatedCost: FineTuneCostEstimate
  readonly estimatedDurationHours: number
  readonly targetRepoName: string
  readonly reasoning: string
  readonly warnings: readonly string[]
}

export enum FineTuneSpecErrorCode {
  MissingBaseModel = 'missing_base_model',
  MissingDataset = 'missing_dataset',
  MissingMethod = 'missing_method',
  InvalidTrainingType = 'invalid_training_type',
  InvalidHyperparameters = 'invalid_hyperparameters',
}

export interface FineTuneSpecError {
  readonly code: FineTuneSpecErrorCode
  readonly message: string
}

export function isFineTuneJobSpec(value: unknown): value is FineTuneJobSpec {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record['baseModel'] === 'string' &&
    typeof record['dataset'] === 'string' &&
    (record['method'] === 'lora' || record['method'] === 'qlora' || record['method'] === 'full') &&
    (record['trainingType'] === 'sft' || record['trainingType'] === 'rft')
  )
}

const METHODS: ReadonlySet<FineTuneMethod> = new Set(['lora', 'qlora', 'full'])
const TRAINING_TYPES: ReadonlySet<FineTuneTrainingType> = new Set(['sft', 'rft'])

// Validates a fine-tuning plan. Mirror of SpecificationValidator for brains:
// a plan is incomplete without a base model, a dataset, and a method, and the
// executor refuses to run (even in dry-run) until the spec is valid.
export class FineTuneValidator {
  validate(spec: FineTuneJobSpec): readonly FineTuneSpecError[] {
    const errors: FineTuneSpecError[] = []

    if (spec.baseModel.trim() === '') {
      errors.push({
        code: FineTuneSpecErrorCode.MissingBaseModel,
        message: 'Fine-tune spec is missing a base model.',
      })
    }
    if (spec.dataset.trim() === '') {
      errors.push({
        code: FineTuneSpecErrorCode.MissingDataset,
        message: 'Fine-tune spec is missing a dataset.',
      })
    }
    if (!METHODS.has(spec.method)) {
      errors.push({
        code: FineTuneSpecErrorCode.MissingMethod,
        message: `Fine-tune spec uses unsupported method "${spec.method}".`,
      })
    }
    if (!TRAINING_TYPES.has(spec.trainingType)) {
      errors.push({
        code: FineTuneSpecErrorCode.InvalidTrainingType,
        message: `Fine-tune spec uses unsupported training type "${spec.trainingType}".`,
      })
    }
    if (
      !Number.isFinite(spec.hyperparameters.epochs) ||
      spec.hyperparameters.epochs <= 0 ||
      !Number.isFinite(spec.hyperparameters.learningRate) ||
      spec.hyperparameters.learningRate <= 0
    ) {
      errors.push({
        code: FineTuneSpecErrorCode.InvalidHyperparameters,
        message: 'Fine-tune spec has invalid hyperparameters (epochs and learning rate must be positive).',
      })
    }

    return errors
  }

  validateOrThrow(spec: FineTuneJobSpec): void {
    const errors = this.validate(spec)
    if (errors.length > 0) {
      throw new FineTuneValidationError(errors)
    }
  }
}
