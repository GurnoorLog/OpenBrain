import type { Edge } from '@xyflow/react'
import type { BrainEdge } from '../domain'
import { RendererInvalidEdgeError } from './RendererErrors'

export type RenderedEdgeData = {
  readonly from: string
  readonly fromPort: string
  readonly to: string
  readonly toPort: string
}

export type RenderedBrainEdge = Edge<RenderedEdgeData>

// Converts a domain BrainEdge into a React Flow edge. Pure transformation:
// never mutates the input.
export class EdgeRenderer {
  renderEdge(edge: BrainEdge): RenderedBrainEdge {
    if (!edge.id || !edge.source || !edge.target) {
      throw new RendererInvalidEdgeError(edge.id)
    }
    return {
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourcePort,
      target: edge.target,
      targetHandle: edge.targetPort,
      animated: edge.animated,
      ...(edge.label ? { label: edge.label } : {}),
      data: {
        from: edge.source,
        fromPort: edge.sourcePort,
        to: edge.target,
        toPort: edge.targetPort,
      },
    }
  }

  renderEdges(edges: readonly BrainEdge[]): RenderedBrainEdge[] {
    return edges.map((edge) => this.renderEdge(edge))
  }
}
