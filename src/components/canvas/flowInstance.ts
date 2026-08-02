import type { ReactFlowInstance } from '@xyflow/react'
import type { Edge, Node } from '@xyflow/react'
import { useBrainStore } from '../../store/useBrainStore'

let instance: ReactFlowInstance<Node, Edge> | null = null

export function setFlowInstance(flow: ReactFlowInstance<Node, Edge> | null): void {
  instance = flow
}

export function fitBrainView(): void {
  void instance?.fitView({ padding: 0.2, duration: 400 })
}

export function centerBrainView(): void {
  void instance?.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 400 })
}

export function clearBrainSelection(): void {
  if (instance) {
    instance.setNodes((nodes) => nodes.map((node) => ({ ...node, selected: false })))
    instance.setEdges((edges) => edges.map((edge) => ({ ...edge, selected: false })))
  }
  useBrainStore.getState().setSelection([])
}
