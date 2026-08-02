import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { Background, BackgroundVariant, ReactFlow, SelectionMode } from '@xyflow/react'
import { useBrainStore } from '../../store/useBrainStore'
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
  const [spaceHeld, setSpaceHeld] = useState(false)
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

  return (
    <div className={`canvas-container ${panning ? 'pan-mode' : ''}`}>
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
        <Background
          variant={BackgroundVariant.Dots}
          gap={32}
          size={1}
          color="rgba(255, 255, 255, 0.06)"
        />
      </ReactFlow>
    </div>
  )
}
