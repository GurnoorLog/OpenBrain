import { useState } from 'react'
import type { RefObject } from 'react'
import { useBrainStore } from '../store/useBrainStore'
import HelpPanel from './HelpPanel'

interface BottomControlsProps {
  zoomRef: RefObject<HTMLDivElement | null>
}

export default function BottomControls({ zoomRef }: BottomControlsProps) {
  const undo = useBrainStore((state) => state.undo)
  const redo = useBrainStore((state) => state.redo)
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <div className="flex items-center gap-3">
      <div className="glass-panel px-3 py-2 flex items-center gap-4 text-gray-400">
        <button
          id="undo-btn"
          className="hover:text-white transition-colors"
          onClick={undo}
          aria-label="Undo"
          title="Undo"
        >
          <iconify-icon icon="lucide:undo-2"></iconify-icon>
        </button>
        <button
          id="redo-btn"
          className="hover:text-white transition-colors"
          onClick={redo}
          aria-label="Redo"
          title="Redo"
        >
          <iconify-icon icon="lucide:redo-2"></iconify-icon>
        </button>
      </div>
      <div
        ref={zoomRef}
        className="glass-panel px-4 py-2 text-[11px] text-gray-400 font-bold tracking-[0.2em]"
      >
        100%
      </div>
      <button
        id="help-btn"
        className="glass-panel w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white"
        onClick={() => setHelpOpen(true)}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts"
      >
        <iconify-icon icon="lucide:help-circle" className="text-lg"></iconify-icon>
      </button>

      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
