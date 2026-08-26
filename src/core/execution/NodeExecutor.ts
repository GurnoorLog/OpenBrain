import type { JsonValue } from '../domain'
import type { ExecutionContext } from './ExecutionContext'

export type NodeInputs = Readonly<Record<string, JsonValue>>

export type NodeOutputs = Readonly<Record<string, JsonValue>>

// Contract every node type implements. Real executors (e.g. an LLM executor
// backed by AIProvider) are registered per NodeType; the engine only ever
// talks to this interface.
export interface NodeExecutor {
  execute(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs>
}
