import type { Brain, ProviderConfiguration, ProviderId } from '../domain'
import { ArchitectUnsupportedProviderError } from './ArchitectErrors'
import type { ArchitectProvider, DesignRequest } from './ArchitectProvider'
import type { BrainSpecification } from './BrainSpecification'
import type { PromptBuildOptions, PromptBuilder, StructuredPrompt } from './PromptBuilder'
import type { SpecificationTransformer } from './SpecificationTransformer'
import type { SpecificationValidator } from './SpecificationValidator'

export interface ArchitectDependencies {
  readonly providers: Readonly<Record<string, ArchitectProvider>>
  readonly validator: SpecificationValidator
  readonly transformer: SpecificationTransformer
  readonly promptBuilder: PromptBuilder
  readonly defaultProviderId: ProviderId
}

// Facade for the Architect layer. It is the only component responsible for
// designing Brains; providers are injected strategies.
export class Architect {
  constructor(private readonly deps: ArchitectDependencies) {}

  async design(request: DesignRequest, providerId?: ProviderId): Promise<BrainSpecification> {
    const provider = this.resolveProvider(providerId)
    const specification = await provider.designBrain(request)
    this.deps.validator.validateOrThrow(specification)
    return specification
  }

  materialize(specification: BrainSpecification, provider?: ProviderConfiguration): Brain {
    this.deps.validator.validateOrThrow(specification)
    return this.deps.transformer.transform(specification, { provider })
  }

  buildPrompt(request: DesignRequest, options?: PromptBuildOptions): StructuredPrompt {
    return this.deps.promptBuilder.build(request, options)
  }

  listProviders(): readonly ArchitectProvider[] {
    return Object.values(this.deps.providers)
  }

  private resolveProvider(providerId?: ProviderId): ArchitectProvider {
    const id = providerId ?? this.deps.defaultProviderId
    const provider = this.deps.providers[id]
    if (!provider) {
      throw new ArchitectUnsupportedProviderError(id)
    }
    return provider
  }
}
