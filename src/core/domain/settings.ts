import type { ProviderConfiguration } from './provider'

export type ThemeName = 'dark' | 'light' | 'system'

export type ExecutionMode = 'manual' | 'auto'

export interface GridSettings {
  readonly size: number
  readonly visible: boolean
}

export interface BrainSettings {
  readonly autoSave: boolean
  readonly theme: ThemeName
  readonly grid: GridSettings
  readonly snapToGrid: boolean
  readonly executionMode: ExecutionMode
  readonly provider: ProviderConfiguration
  readonly debug: boolean
}
