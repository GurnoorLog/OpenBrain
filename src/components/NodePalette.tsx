import { useState } from 'react'
import { CAPABILITY_LIST } from '../core/registry'
import type { CapabilityType } from '../core/types'
import { useBrainStore } from '../store/useBrainStore'
import { screenToFlowPosition } from './canvas/flowInstance'

// Premium node palette popup. Opens from the grid toolbar button. Every node
// type is shown as a card in a grid; drag a card anywhere on the overlay to
// place it exactly, or click a card to drop it at the viewport center.
export default function NodePalette() {
  const open = useBrainStore((state) => state.paletteOpen)
  const setPaletteOpen = useBrainStore((state) => state.setPaletteOpen)
  const addNode = useBrainStore((state) => state.addNode)
  const [dragging, setDragging] = useState(false)

  if (!open) return null

  const addAtCenter = (type: CapabilityType) => {
    const point = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    })
    addNode(type, point.x, point.y)
  }

  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('text/plain')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragging(true)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const capability = e.dataTransfer.getData('text/plain') as CapabilityType
    if (!capability) return
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addNode(capability, position.x, position.y)
    setPaletteOpen(false)
  }

  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto palette-fade-in ${
          dragging ? 'palette-drop-zone' : ''
        }`}
        onClick={() => setPaletteOpen(false)}
        onDragOver={onDragOver}
        onDrop={onDrop}
      ></div>

      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-50 pointer-events-auto">
        <div className="palette-pop">
          <div className="w-[420px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#0b0d13]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-400/10 border border-teal-400/20 flex items-center justify-center">
                <iconify-icon icon="lucide:layout-grid" className="text-teal-400 text-lg"></iconify-icon>
              </div>
              <div>
                <h3 className="text-white font-bold tracking-tight text-base leading-tight">Add a node</h3>
                <p className="text-xs text-gray-400">Drag a card onto the canvas or click to drop</p>
              </div>
            </div>
            <button
              id="palette-close-btn"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              onClick={() => setPaletteOpen(false)}
              title="Close palette"
            >
              <iconify-icon icon="lucide:x" className="text-lg"></iconify-icon>
            </button>
          </div>

          <div className="p-4 palette-grid-scroll">
            <div className="grid grid-cols-2 gap-2.5">
              {CAPABILITY_LIST.map((def) => (
                <button
                  key={def.type}
                  id={`palette-${def.type}-btn`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', def.type)
                    e.dataTransfer.effectAllowed = 'copy'
                    e.dataTransfer.setData(
                      'application/json',
                      JSON.stringify({ type: def.type, icon: def.icon, accent: def.accent }),
                    )
                  }}
                  onClick={() => addAtCenter(def.type)}
                  className="palette-card group"
                  title={`${def.label} — ${def.description}`}
                >
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                    style={{ background: `${def.accent}1a`, border: `1px solid ${def.accent}33` }}
                  >
                    <iconify-icon icon={def.icon} style={{ color: def.accent }} className="text-xl"></iconify-icon>
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-sm font-semibold text-white leading-tight">{def.label}</span>
                    <span className="block text-[11px] text-gray-400 leading-snug truncate">{def.description}</span>
                  </span>
                  <span className="text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    <iconify-icon icon="lucide:plus" className="text-base"></iconify-icon>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
