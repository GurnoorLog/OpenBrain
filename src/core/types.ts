export type CapabilityType =
  | 'llm'
  | 'local'
  | 'memory'
  | 'planner'
  | 'browser'
  | 'github'
  | 'filesystem'
  | 'python'
  | 'rag'
  | 'finetune'
  | 'news'
  | 'imagegen'
  | 'mcp'
  | 'tool'
  | 'worker'
  | 'output'

export type NodeStatus = 'idle' | 'pending' | 'running' | 'success' | 'error'

export type LogLevel = 'info' | 'success' | 'warning' | 'error'

export interface PortSpec {
  id: string
  label: string
  type: string
}

export interface BrainNode {
  id: string
  type: CapabilityType
  x: number
  y: number
  status: NodeStatus
  output?: Record<string, unknown>
  error?: string
  content?: string
  reason?: string
  model?: string
  configuration?: Readonly<Record<string, unknown>>
}

export interface Connection {
  id: string
  from: string
  fromPort: string
  to: string
  toPort: string
}

export interface PendingConnection {
  from: string
  fromPort: string
  fromX: number
  fromY: number
  toX: number
  toY: number
}

export interface LogEntry {
  id: string
  message: string
  time: string
  level: LogLevel
}

export interface CapabilityDef {
  type: CapabilityType
  label: string
  icon: string
  description: string
  accent: string
  inputs: PortSpec[]
  outputs: PortSpec[]
}

export interface BrainNodeSpec {
  id: string
  type: CapabilityType
  x: number
  y: number
  content?: string
  reason?: string
  model?: string
  configuration?: Readonly<Record<string, unknown>>
}

export interface BrainSpec {
  nodes: BrainNodeSpec[]
  connections: Connection[]
}

export interface ViewState {
  scale: number
  x: number
  y: number
}

export type EditorMode = 'select' | 'pan'
