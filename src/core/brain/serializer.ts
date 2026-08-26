import type { Brain, Timestamp } from '../domain'
import { BRAIN_FORMAT, BRAIN_VERSION } from './constants'
import { BrainSerializationError, BrainValidationError } from './errors'

export interface BrainFile {
  readonly format: typeof BRAIN_FORMAT
  readonly version: string
  readonly exportedAt: Timestamp
  readonly brain: Brain
}

export interface BrainMigration {
  readonly from: string
  readonly to: string
  readonly upgrade: (brain: Record<string, unknown>) => Record<string, unknown>
}

export interface BrainSerializerOptions {
  readonly currentVersion?: string
  readonly migrations?: readonly BrainMigration[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class BrainSerializer {
  private readonly currentVersion: string
  private readonly migrations: readonly BrainMigration[]

  constructor(options: BrainSerializerOptions = {}) {
    this.currentVersion = options.currentVersion ?? BRAIN_VERSION
    this.migrations = options.migrations ?? []
  }

  get version(): string {
    return this.currentVersion
  }

  serialize(brain: Brain): string {
    return JSON.stringify(this.toFile(brain), null, 2)
  }

  toFile(brain: Brain): BrainFile {
    return {
      format: BRAIN_FORMAT,
      version: this.currentVersion,
      exportedAt: new Date().toISOString(),
      brain,
    }
  }

  deserialize(json: string): Brain {
    let data: unknown
    try {
      data = JSON.parse(json)
    } catch {
      throw new BrainSerializationError('Brain file is not valid JSON.')
    }
    return this.importData(data)
  }

  importData(data: unknown): Brain {
    const raw = isRecord(data) ? (isRecord(data['brain']) ? data['brain'] : data) : null
    if (!isRecord(raw)) {
      throw new BrainValidationError('Brain data must be a plain object.')
    }
    const migrated = this.migrate(raw)
    return this.toBrain(migrated)
  }

  migrate(raw: Record<string, unknown>): Record<string, unknown> {
    let data = raw
    let version = typeof raw['version'] === 'string' ? raw['version'] : '0.0.0'

    let applied = true
    while (applied) {
      applied = false
      for (const migration of this.migrations) {
        if (version === migration.from) {
          data = migration.upgrade(data)
          version = migration.to
          applied = true
        }
      }
    }

    if (version !== this.currentVersion) {
      throw new BrainValidationError(`Unsupported Brain version "${version}".`)
    }
    return { ...data, version: this.currentVersion }
  }

  toBrain(data: Record<string, unknown>): Brain {
    if (typeof data['id'] !== 'string') {
      throw new BrainValidationError('Brain is missing a valid "id".')
    }
    if (typeof data['name'] !== 'string') {
      throw new BrainValidationError('Brain is missing a valid "name".')
    }
    if (!Array.isArray(data['nodes']) || !Array.isArray(data['edges'])) {
      throw new BrainValidationError('Brain is missing "nodes" or "edges".')
    }
    if (typeof data['provider'] !== 'object' || data['provider'] === null) {
      throw new BrainValidationError('Brain is missing a "provider" configuration.')
    }
    return data as unknown as Brain
  }
}
