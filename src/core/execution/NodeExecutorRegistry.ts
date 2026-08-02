import type { NodeType } from '../domain'
import { ExecutionUnsupportedNodeError } from './ExecutionErrors'
import type { NodeExecutor } from './NodeExecutor'

export type NodeExecutorMap = Readonly<Record<string, NodeExecutor>>

// Maps NodeType to the NodeExecutor responsible for it. Mirrors the Strategy
// pattern used by the Architect providers: swapping the executor for a type
// (e.g. a real LLM executor backed by AIProvider) requires zero changes to
// the scheduler or engine.
export class NodeExecutorRegistry {
  private readonly executors = new Map<string, NodeExecutor>()

  constructor(private readonly fallback?: NodeExecutor) {}

  register(nodeType: NodeType, executor: NodeExecutor): void {
    this.executors.set(nodeType, executor)
  }

  registerAll(executors: NodeExecutorMap): void {
    for (const [nodeType, executor] of Object.entries(executors)) {
      this.executors.set(nodeType, executor)
    }
  }

  unregister(nodeType: NodeType): void {
    this.executors.delete(nodeType)
  }

  has(nodeType: NodeType): boolean {
    return this.executors.has(nodeType) || this.fallback !== undefined
  }

  resolve(nodeType: NodeType): NodeExecutor {
    const executor = this.executors.get(nodeType)
    if (executor) return executor
    if (this.fallback) return this.fallback
    throw new ExecutionUnsupportedNodeError(nodeType)
  }

  list(): readonly { readonly nodeType: string; readonly executor: NodeExecutor }[] {
    return [...this.executors.entries()].map(([nodeType, executor]) => ({ nodeType, executor }))
  }
}
