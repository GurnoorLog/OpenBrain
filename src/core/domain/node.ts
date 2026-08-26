import type { EntityId, JsonValue } from './common'
import type { NodeMetadata } from './metadata'

export type NodeStatus = 'idle' | 'pending' | 'running' | 'success' | 'error'

// Known node types plus an open string extension point so MCP, agents, and
// future capabilities can be added without changing this union's consumers.
export type NodeType =
  | 'llm'
  | 'memory'
  | 'planner'
  | 'browser'
  | 'github'
  | 'filesystem'
  | 'python'
  | 'rag'
  | 'output'
  | 'mcp'
  | 'agent'
  | 'subbrain'
  | 'trigger'
  | 'gate'
  | 'tool'
  | (string & {})

export interface NodePosition {
  readonly x: number
  readonly y: number
}

export type PortDirection = 'input' | 'output'

export type PortKind =
  | 'text'
  | 'number'
  | 'boolean'
  | 'any'
  | 'list'
  | 'image'
  | 'audio'
  | 'file'
  | 'event'
  | 'tool'

export interface NodePort {
  readonly id: string
  readonly label: string
  readonly kind: PortKind
  readonly description?: string
  readonly required?: boolean
}

export type NodeConfiguration = Readonly<Record<string, JsonValue>>

export interface BrainNode {
  readonly id: EntityId
  readonly type: NodeType
  readonly title: string
  readonly description: string
  readonly status: NodeStatus
  readonly position: NodePosition
  readonly inputs: readonly NodePort[]
  readonly outputs: readonly NodePort[]
  readonly configuration: NodeConfiguration
  readonly metadata: NodeMetadata
}
