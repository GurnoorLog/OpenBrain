import { KEYBOARD_SHORTCUTS } from './keyboardShortcuts'

interface HelpPanelProps {
  readonly open: boolean
  readonly onClose: () => void
}

// Rendered straight from the same KEYBOARD_SHORTCUTS list that App.tsx uses
// to drive the real keydown handler — it can never drift out of sync.
export default function HelpPanel({ open, onClose }: HelpPanelProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>
      <div className="relative glass-panel w-[24rem] max-w-[90vw] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold tracking-tight text-lg">Keyboard shortcuts</h2>
          <button
            className="toolbar-btn w-8 h-8 text-gray-400 hover:text-white"
            onClick={onClose}
            aria-label="Close shortcuts"
          >
            <iconify-icon icon="lucide:x"></iconify-icon>
          </button>
        </div>

        <div className="flex flex-col gap-1">
          {KEYBOARD_SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10"
            >
              <span className="text-sm text-gray-300">{shortcut.description}</span>
              <span className="text-[11px] text-gray-500 font-mono">{shortcut.combo}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
