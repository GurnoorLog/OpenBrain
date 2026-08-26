import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { Background, BackgroundVariant, ReactFlow, SelectionMode } from '@xyflow/react'
import { useBrainStore } from '../../store/useBrainStore'
import type { CapabilityType } from '../../core/types'
import { screenToFlowPosition } from './flowInstance'
import { NODE_TYPES, useBrainFlow } from './useBrainFlow'

interface BrainCanvasProps {
  zoomDisplayRef?: RefObject<HTMLDivElement | null>
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.isContentEditable
  )
}

export default function BrainCanvas({ zoomDisplayRef }: BrainCanvasProps) {
  const mode = useBrainStore((state) => state.mode)
  const showGrid = useBrainStore((state) => state.showGrid)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const {
    rfNodes,
    rfEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeDragStop,
    isValidConnection,
    onInit,
    onMove,
  } = useBrainFlow(zoomDisplayRef)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isEditableTarget(e.target)) return
      setSpaceHeld(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      setSpaceHeld(false)
    }
    const onBlur = () => setSpaceHeld(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const panning = mode === 'pan' || spaceHeld

  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('text/plain')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }

  const onDragLeave = () => setDragOver(false)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const capability = e.dataTransfer.getData('text/plain') as CapabilityType
    if (!capability) return
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    useBrainStore.getState().addNode(capability, position.x, position.y)
  }

  return (
    <div
      className={`canvas-container ${panning ? 'pan-mode' : ''} ${dragOver ? 'palette-dragging' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        isValidConnection={isValidConnection}
        onInit={onInit}
        onMove={onMove}
        panOnDrag={panning}
        selectionOnDrag={!panning}
        selectionMode={SelectionMode.Partial}
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        deleteKeyCode={['Delete', 'Backspace']}
        snapToGrid
        snapGrid={[16, 16]}
        minZoom={0.05}
        maxZoom={5}
        nodesDraggable={!panning}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        {showGrid && (
          <Background
            variant={BackgroundVariant.Dots}
            gap={32}
            size={1}
            color="rgba(255, 255, 255, 0.06)"
          />
        )}
      </ReactFlow>
    </div>
  )
}
