import type { SpecificationError } from './SpecificationValidator'

export class ArchitectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class ArchitectValidationError extends ArchitectError {
  constructor(readonly errors: readonly SpecificationError[]) {
    super(errors.map((error) => error.message).join('; '))
  }
}

export class ArchitectParsingError extends ArchitectError {}

export class ArchitectProviderError extends ArchitectError {
  constructor(readonly providerId: string, message: string) {
    super(message)
  }
}

export class ArchitectProviderNotImplementedError extends ArchitectProviderError {
  constructor(providerId: string) {
    super(providerId, `Architect provider "${providerId}" has no API integration yet.`)
  }
}

export class ArchitectProviderUnconfiguredError extends ArchitectProviderError {
  constructor(providerId: string, message?: string) {
    super(
      providerId,
      message ?? `Architect provider "${providerId}" is not configured (missing API key or base URL).`,
    )
  }
}

export class ArchitectUnsupportedProviderError extends ArchitectError {
  constructor(readonly providerId: string) {
    super(`Unsupported architect provider "${providerId}".`)
  }
}

export class ArchitectCancelledError extends ArchitectError {
  constructor() {
    super('Generation was cancelled by the user.')
  }
}
