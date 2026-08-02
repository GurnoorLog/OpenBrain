import type { FineTuneSpecError } from './FineTuneJobSpec'

export class FineTuneError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class FineTuneValidationError extends FineTuneError {
  constructor(readonly errors: readonly FineTuneSpecError[]) {
    super(errors.map((error) => error.message).join('; '))
  }
}

export class FineTuneUnconfiguredError extends FineTuneError {
  constructor(message = 'Hugging Face is not configured (missing token).') {
    super(message)
  }
}

export class FineTuneProviderError extends FineTuneError {
  constructor(message: string) {
    super(message)
  }
}

export class FineTuneConfirmationRequiredError extends FineTuneError {
  constructor() {
    super('Fine-tune job requires explicit confirmation before it can be launched.')
  }
}
