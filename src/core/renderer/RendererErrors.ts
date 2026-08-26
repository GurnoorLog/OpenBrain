export class RendererError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class RendererInvalidNodeError extends RendererError {
  constructor(readonly nodeId: string) {
    super(`Cannot render node "${nodeId}": it is missing required fields.`)
  }
}

export class RendererInvalidEdgeError extends RendererError {
  constructor(readonly edgeId: string) {
    super(`Cannot render edge "${edgeId}": it is missing required fields.`)
  }
}

export class RendererMissingPortError extends RendererError {
  constructor(readonly edgeId: string, readonly portId: string) {
    super(`Edge "${edgeId}" references missing port "${portId}".`)
  }
}

export class RendererUnknownNodeTypeError extends RendererError {
  constructor(readonly nodeType: string) {
    super(`Cannot render node of unknown type "${nodeType}".`)
  }
}

export class RendererLayoutError extends RendererError {}

export class RendererSelectionError extends RendererError {}

export class RendererViewportError extends RendererError {}
