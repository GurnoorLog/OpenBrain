import { useCallback, useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { applyEdgeChanges, applyNodeChanges } from '@xyflow/react'
import type {
  Connection,
  Edge,
  EdgeChange,
  IsValidConnection,
  Node,
  NodeTypes,
  OnConnect,
  OnInit,
  OnMove,
  OnNodeDrag,
  OnNodesChange,
  OnEdgesChange,
  ReactFlowInstance,
} from '@xyflow/react'
import { canConnect, useBrainStore } from '../../store/useBrainStore'
import BrainNodeComponent from './BrainNode'
import { setFlowInstance, fitBrainView } from './flowInstance'
import { renderBrain } from './brainAdapter'

export const NODE_TYPES: NodeTypes = { brain: BrainNodeComponent }

export interface BrainFlowApi {
  rfNodes: Node[]
  rfEdges: Edge[]
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  onNodeDragStop: OnNodeDrag
  isValidConnection: IsValidConnection
  onInit: OnInit
  onMove: OnMove
}

export function useBrainFlow(
  zoomDisplayRef?: RefObject<HTMLDivElement | null>,
): BrainFlowApi {
  const nodes = useBrainStore((state) => state.nodes)
  const connections = useBrainStore((state) => state.connections)
  const selectedNodeIds = useBrainStore((state) => state.selectedNodeIds)
  const fitToken = useBrainStore((state) => state.fitToken)

  const [rfNodes, setRfNodes] = useState<Node[]>([])
  const [rfEdges, setRfEdges] = useState<Edge[]>([])

  useEffect(() => {
    if (fitToken <= 0) return
    const id = window.setTimeout(() => fitBrainView(), 50)
    return () => window.clearTimeout(id)
  }, [fitToken])

  useEffect(() => {
    const result = renderBrain({ nodes, connections, selectedNodeIds })
    setRfNodes((prev) =>
      result.nodes.map((node) => {
        const existing = prev.find((entry) => entry.id === node.id)
        return {
          ...node,
          selected: node.selected || (existing?.selected ?? false),
          measured: existing?.measured,
        }
      }),
    )
    setRfEdges(result.edges)
  }, [nodes, connections, selectedNodeIds])

  const onNodesChange: OnNodesChange = useCallback((changes) => {
    setRfNodes((current) => applyNodeChanges(changes, current))

    const selectionChanges = changes.filter((change) => change.type === 'select')
    if (selectionChanges.length > 0) {
      useBrainStore.getState().setSelection(
        selectionChanges.filter((change) => change.selected).map((change) => change.id),
      )
    }

    const removed = changes.filter((change) => change.type === 'remove')
    if (removed.length > 0) {
      useBrainStore.getState().removeElements(removed.map((change) => change.id), [])
    }
  }, [])

  const onEdgesChange: OnEdgesChange = useCallback((changes) => {
    setRfEdges((current) => applyEdgeChanges(changes, current))

    const removed = changes.filter((change): change is Extract<EdgeChange, { type: 'remove' }> => change.type === 'remove')
    if (removed.length > 0) {
      useBrainStore.getState().removeConnections(removed.map((change) => change.id))
    }
  }, [])

  const onConnect: OnConnect = useCallback((connection: Connection) => {
    const { source, sourceHandle, target, targetHandle } = connection
    if (!source || !sourceHandle || !target || !targetHandle) return
    useBrainStore.getState().connectConnection(source, sourceHandle, target, targetHandle)
  }, [])

  const isValidConnection: IsValidConnection = useCallback((connection) => {
    const { source, sourceHandle, target, targetHandle } = connection
    if (!source || !sourceHandle || !target || !targetHandle) return false
    return canConnect(
      useBrainStore.getState().connections,
      source,
      sourceHandle,
      target,
      targetHandle,
    )
  }, [])

  const onNodeDragStop: OnNodeDrag = useCallback((_event, node) => {
    const store = useBrainStore.getState()
    store.moveNode(node.id, node.position.x, node.position.y)
    store.commit()
  }, [])

  const onInit: OnInit = useCallback((instance: ReactFlowInstance) => {
    setFlowInstance(instance)
  }, [])

  const onMove: OnMove = useCallback(
    (_event, viewport) => {
      if (zoomDisplayRef?.current) {
        zoomDisplayRef.current.textContent = `${Math.round(viewport.zoom * 100)}%`
      }
    },
    [zoomDisplayRef],
  )

  return {
    rfNodes,
    rfEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeDragStop,
    isValidConnection,
    onInit,
    onMove,
  }
}
