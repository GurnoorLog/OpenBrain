import type { Node } from '@xyflow/react'
import type { BrainNode, NodeConfiguration, NodePort, NodeStatus, NodeType } from '../domain'
import { RendererInvalidNodeError } from './RendererErrors'

export const DEFAULT_NODE_WIDTH = 220
export const DEFAULT_NODE_HEIGHT = 84

export type RenderedNodeData = {
  readonly capability: NodeType
  readonly label: string
  readonly description: string
  readonly status: NodeStatus
  readonly inputs: readonly NodePort[]
  readonly outputs: readonly NodePort[]
  readonly configuration: NodeConfiguration
  readonly output?: unknown
  readonly error?: string
}

export type RenderedBrainNode = Node<RenderedNodeData, 'brain'>

export interface NodeRenderOptions {
  readonly width?: number
  readonly selected?: boolean
}

// Converts a domain BrainNode into a React Flow node. Pure transformation:
// never mutates the input.
export class NodeRenderer {
  renderNode(node: BrainNode, options: NodeRenderOptions = {}): RenderedBrainNode {
    if (!node.id) {
      throw new RendererInvalidNodeError(node.id)
    }
    return {
      id: node.id,
      type: 'brain',
      position: { x: node.position.x, y: node.position.y },
      data: {
        capability: node.type,
        label: node.title || node.type,
        description: node.description,
        status: node.status,
        inputs: node.inputs,
        outputs: node.outputs,
        configuration: node.configuration,
      },
      style: { width: options.width ?? DEFAULT_NODE_WIDTH },
      ...(options.selected ? { selected: true } : {}),
    }
  }

  renderNodes(nodes: readonly BrainNode[], options: NodeRenderOptions = {}): RenderedBrainNode[] {
    return nodes.map((node) => this.renderNode(node, options))
  }
}
