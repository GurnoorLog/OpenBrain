import type { Brain, EntityId, JsonValue, LogLevel, NodeStatus } from '../domain'
import type { ExecutionLog } from '../domain'
import type { NodeOutputs } from './NodeExecutor'

export interface ExecutionContextOptions {
  readonly runId: EntityId
  readonly brain: Brain
  readonly signal: AbortSignal
}

export interface ExecutionLogOptions {
  readonly level?: LogLevel
  readonly nodeId?: EntityId | null
  readonly durationMs?: number
  readonly data?: Readonly<Record<string, JsonValue>>
}

// Per-run context handed to every NodeExecutor. Carries the run identity,
// the immutable Brain, the current node, per-node status, accumulated
// outputs, and an abort signal so executors can cooperate with stop().
export class ExecutionContext {
  readonly runId: EntityId
  readonly brain: Brain
  readonly signal: AbortSignal

  private readonly statuses = new Map<EntityId, NodeStatus>()
  private readonly outputsMap = new Map<EntityId, NodeOutputs>()
  private readonly logEntries: ExecutionLog[] = []
  private currentId: EntityId | null = null
  private logCounter = 0

  constructor(options: ExecutionContextOptions) {
    this.runId = options.runId
    this.brain = options.brain
    this.signal = options.signal
  }

  get brainId(): EntityId {
    return this.brain.id
  }

  get currentNodeId(): EntityId | null {
    return this.currentId
  }

  get nodeStatuses(): ReadonlyMap<EntityId, NodeStatus> {
    return this.statuses
  }

  get outputs(): ReadonlyMap<EntityId, NodeOutputs> {
    return this.outputsMap
  }

  get logs(): readonly ExecutionLog[] {
    return this.logEntries
  }

  setCurrentNodeId(nodeId: EntityId | null): void {
    this.currentId = nodeId
  }

  setNodeStatus(nodeId: EntityId, status: NodeStatus): void {
    this.statuses.set(nodeId, status)
  }

  getNodeStatus(nodeId: EntityId): NodeStatus | undefined {
    return this.statuses.get(nodeId)
  }

  setNodeOutputs(nodeId: EntityId, outputs: NodeOutputs): void {
    this.outputsMap.set(nodeId, outputs)
  }

  getNodeOutputs(nodeId: EntityId): NodeOutputs | undefined {
    return this.outputsMap.get(nodeId)
  }

  log(message: string, options: ExecutionLogOptions = {}): void {
    this.logCounter += 1
    const entry: ExecutionLog = {
      id: `log-${this.logCounter}`,
      timestamp: new Date().toISOString(),
      nodeId: options.nodeId ?? null,
      level: options.level ?? 'info',
      message,
      ...(options.durationMs !== undefined ? { durationMs: options.durationMs } : {}),
      ...(options.data !== undefined ? { data: options.data } : {}),
    }
    this.logEntries.push(entry)
  }
}
