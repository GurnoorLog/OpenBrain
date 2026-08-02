export class ExecutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class ExecutionCycleError extends ExecutionError {
  constructor(readonly nodeIds: readonly string[]) {
    super(`Execution graph contains a cycle involving nodes: ${nodeIds.join(', ')}.`)
  }
}

export class ExecutionInvalidGraphError extends ExecutionError {}

export class ExecutionEmptyGraphError extends ExecutionError {}

export class ExecutionUnsupportedNodeError extends ExecutionError {
  constructor(readonly nodeType: string) {
    super(`No executor registered for node type "${nodeType}".`)
  }
}

export class ExecutionAlreadyRunningError extends ExecutionError {
  constructor(readonly runId: string) {
    super(`An execution run "${runId}" is already in progress.`)
  }
}

export class ExecutionNotRunningError extends ExecutionError {}

export class ExecutionCancelledError extends ExecutionError {}
