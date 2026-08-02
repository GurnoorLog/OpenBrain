import type { Brain, BrainNode, EntityId, ExecutionStatus, NodeStatus, Timestamp } from '../domain'
import type { ExecutionLog, JsonValue } from '../domain'
import type { NodeExecutorRegistry } from './NodeExecutorRegistry'
import type { NodeInputs, NodeOutputs } from './NodeExecutor'
import { ExecutionScheduler } from './ExecutionScheduler'
import { ExecutionContext } from './ExecutionContext'
import {
  ExecutionAlreadyRunningError,
  ExecutionCancelledError,
  ExecutionEmptyGraphError,
} from './ExecutionErrors'
import {
  ExecutionEventType,
  createExecutionEvent,
  type ExecutionEventBus,
} from './ExecutionEvents'
import { ExecutionEvents } from './ExecutionEvents'

export interface ExecutionResult {
  readonly runId: EntityId
  readonly brainId: EntityId
  readonly status: ExecutionStatus
  readonly executionOrder: readonly EntityId[]
  readonly outputs: ReadonlyMap<EntityId, NodeOutputs>
  readonly nodeStatuses: ReadonlyMap<EntityId, NodeStatus>
  readonly logs: readonly ExecutionLog[]
  readonly startedAt: Timestamp
  readonly endedAt: Timestamp
  readonly durationMs: number
  readonly progress: number
}

export interface ExecutionEngineDependencies {
  readonly registry: NodeExecutorRegistry
  readonly scheduler?: ExecutionScheduler
  readonly events?: ExecutionEventBus
}

interface ActiveRun {
  readonly runId: EntityId
  readonly brain: Brain
  readonly context: ExecutionContext
  readonly order: readonly EntityId[]
  readonly abortController: AbortController
  readonly startedAt: Timestamp
  readonly startedAtMs: number
  status: ExecutionStatus
  paused: boolean
  resumeResolvers: (() => void)[]
}

export interface ActiveRunSnapshot {
  readonly runId: EntityId
  readonly brainId: EntityId
  readonly status: ExecutionStatus
}

// Orchestrates a Brain's execution: computes the dependency order, runs each
// node with inputs gathered from its incoming edges, tracks status and logs
// in the per-run ExecutionContext, and reports progress through events.
// The Brain is never mutated; all execution state lives in the context.
export class ExecutionEngine {
  readonly events: ExecutionEventBus

  private readonly registry: NodeExecutorRegistry
  private readonly scheduler: ExecutionScheduler
  private activeRun: ActiveRun | null = null

  constructor(deps: ExecutionEngineDependencies) {
    this.registry = deps.registry
    this.scheduler = deps.scheduler ?? new ExecutionScheduler()
    this.events = deps.events ?? new ExecutionEvents()
  }

  async run(brain: Brain): Promise<ExecutionResult> {
    if (this.activeRun) {
      throw new ExecutionAlreadyRunningError(this.activeRun.runId)
    }
    if (brain.nodes.length === 0) {
      throw new ExecutionEmptyGraphError('Cannot run a Brain with no nodes.')
    }

    const order = this.scheduler.computeOrder(brain)
    const abortController = new AbortController()
    const runId = crypto.randomUUID()
    const context = new ExecutionContext({ runId, brain, signal: abortController.signal })
    const run: ActiveRun = {
      runId,
      brain,
      context,
      order,
      abortController,
      startedAt: new Date().toISOString(),
      startedAtMs: performance.now(),
      status: 'running',
      paused: false,
      resumeResolvers: [],
    }
    this.activeRun = run

    for (const node of brain.nodes) {
      context.setNodeStatus(node.id, 'pending')
    }
    context.log(`Run started with ${order.length} nodes.`)
    this.events.emit(
      createExecutionEvent(ExecutionEventType.Started, runId, brain.id, { executionOrder: order }),
    )

    let terminalStatus: Extract<ExecutionStatus, 'completed' | 'failed' | 'cancelled'> = 'completed'
    let terminalError = ''
    let failedNodeId: EntityId | null = null

    for (const nodeId of order) {
      if (abortController.signal.aborted) {
        terminalStatus = 'cancelled'
        terminalError = 'Execution was cancelled.'
        break
      }
      await this.waitIfPaused(run)
      if (abortController.signal.aborted) {
        terminalStatus = 'cancelled'
        terminalError = 'Execution was cancelled.'
        break
      }
      const node = brain.nodes.find((entry) => entry.id === nodeId)
      if (!node) continue
      try {
        await this.runNode(node, context)
      } catch (error) {
        failedNodeId = nodeId
        terminalStatus = abortController.signal.aborted ? 'cancelled' : 'failed'
        terminalError = error instanceof Error ? error.message : String(error)
        break
      }
    }

    const durationMs = Math.round(performance.now() - run.startedAtMs)
    if (terminalStatus === 'completed') {
      run.status = 'completed'
      context.log('Execution completed.', { level: 'success' })
      this.events.emit(
        createExecutionEvent(ExecutionEventType.Completed, runId, brain.id, {
          durationMs,
          progress: 1,
        }),
      )
    } else {
      run.status = terminalStatus
      context.log(terminalError, {
        level: terminalStatus === 'cancelled' ? 'warning' : 'error',
        nodeId: failedNodeId,
      })
      this.events.emit(
        createExecutionEvent(ExecutionEventType.Failed, runId, brain.id, {
          status: terminalStatus,
          nodeId: failedNodeId,
          error: terminalError,
        }),
      )
    }

    return this.finish(run, terminalStatus, durationMs)
  }

  async runNode(node: BrainNode, context: ExecutionContext): Promise<NodeOutputs> {
    context.setCurrentNodeId(node.id)
    context.setNodeStatus(node.id, 'running')
    const startedAtMs = performance.now()
    this.events.emit(
      createExecutionEvent(ExecutionEventType.NodeStarted, context.runId, context.brainId, {
        nodeId: node.id,
        nodeType: node.type,
      }),
    )
    try {
      const inputs = this.collectInputs(node, context)
      const executor = this.registry.resolve(node.type)
      const outputs = await executor.execute(inputs, context)
      if (context.signal.aborted) {
        throw new ExecutionCancelledError(`Node "${node.id}" was cancelled.`)
      }
      context.setNodeOutputs(node.id, outputs)
      context.setNodeStatus(node.id, 'success')
      const durationMs = Math.round(performance.now() - startedAtMs)
      context.log(`Node "${node.id}" (${node.type}) completed in ${durationMs}ms.`, {
        level: 'success',
        nodeId: node.id,
        durationMs,
      })
      this.events.emit(
        createExecutionEvent(ExecutionEventType.NodeCompleted, context.runId, context.brainId, {
          nodeId: node.id,
          nodeType: node.type,
          durationMs,
          outputs,
        }),
      )
      return outputs
    } catch (error) {
      context.setNodeStatus(node.id, 'error')
      const durationMs = Math.round(performance.now() - startedAtMs)
      const message = error instanceof Error ? error.message : String(error)
      context.log(`Node "${node.id}" failed: ${message}`, {
        level: 'error',
        nodeId: node.id,
        durationMs,
      })
      this.events.emit(
        createExecutionEvent(ExecutionEventType.NodeFailed, context.runId, context.brainId, {
          nodeId: node.id,
          nodeType: node.type,
          durationMs,
          error: message,
        }),
      )
      throw error
    }
  }

  stop(): void {
    const run = this.activeRun
    if (!run) return
    run.paused = false
    run.abortController.abort()
  }

  pause(): void {
    const run = this.activeRun
    if (!run || run.paused) return
    run.paused = true
    run.status = 'paused'
  }

  resume(): void {
    const run = this.activeRun
    if (!run || !run.paused) return
    run.paused = false
    run.status = 'running'
    const resolvers = run.resumeResolvers
    run.resumeResolvers = []
    for (const resolve of resolvers) resolve()
  }

  isRunning(): boolean {
    return this.activeRun !== null
  }

  getActiveRun(): ActiveRunSnapshot | null {
    const run = this.activeRun
    if (!run) return null
    return { runId: run.runId, brainId: run.brain.id, status: run.status }
  }

  private collectInputs(node: BrainNode, context: ExecutionContext): NodeInputs {
    const inputs: Record<string, JsonValue> = {}
    for (const edge of context.brain.edges) {
      if (edge.target !== node.id) continue
      const sourceOutputs = context.getNodeOutputs(edge.source)
      if (!sourceOutputs) continue
      const value = sourceOutputs[edge.sourcePort]
      if (value !== undefined) {
        inputs[edge.targetPort] = value
      }
    }
    return inputs
  }

  private waitIfPaused(run: ActiveRun): Promise<void> {
    if (!run.paused) return Promise.resolve()
    return new Promise((resolve) => {
      run.resumeResolvers.push(resolve)
    })
  }

  private finish(run: ActiveRun, status: ExecutionStatus, durationMs: number): ExecutionResult {
    this.activeRun = null
    return {
      runId: run.runId,
      brainId: run.brain.id,
      status,
      executionOrder: run.order,
      outputs: run.context.outputs,
      nodeStatuses: run.context.nodeStatuses,
      logs: run.context.logs,
      startedAt: run.startedAt,
      endedAt: new Date().toISOString(),
      durationMs,
      progress: this.computeProgress(run.context, run.order),
    }
  }

  private computeProgress(context: ExecutionContext, order: readonly EntityId[]): number {
    if (order.length === 0) return 0
    const completed = order.filter((id) => context.getNodeStatus(id) === 'success').length
    return completed / order.length
  }
}
