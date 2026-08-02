import { BrainLifecycleState } from '../domain'

export class BrainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class BrainNotFoundError extends BrainError {
  constructor(readonly brainId: string) {
    super(`Brain "${brainId}" was not found.`)
  }
}

export class BrainDuplicateError extends BrainError {
  constructor(readonly brainId: string) {
    super(`Brain "${brainId}" already exists.`)
  }
}

export class BrainTransitionError extends BrainError {
  constructor(readonly from: BrainLifecycleState, readonly to: BrainLifecycleState) {
    super(`Cannot transition Brain from "${from}" to "${to}".`)
  }
}

export class BrainValidationError extends BrainError {}

export class BrainSerializationError extends BrainError {}

export class BrainRepositoryError extends BrainError {}
