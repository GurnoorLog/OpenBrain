import { centerBrainView, clearBrainSelection, fitBrainView } from './canvas/flowInstance'
import { useBrainStore } from '../store/useBrainStore'

// Single source of truth for every keyboard shortcut. App.tsx drives the
// real keydown handler from this list; the Help panel renders the same list,
// so the two can never drift apart.
export interface KeyboardShortcut {
  readonly id: string
  readonly combo: string
  readonly description: string
  readonly preventDefault: boolean
  readonly matches: (event: KeyboardEvent) => boolean
  readonly run: () => void
}

const mod = (event: KeyboardEvent): boolean => event.ctrlKey || event.metaKey
const key = (event: KeyboardEvent): string => event.key.toLowerCase()

export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcut[] = [
  {
    id: 'undo',
    combo: 'Ctrl/Cmd+Z',
    description: 'Undo',
    preventDefault: true,
    matches: (e) => mod(e) && key(e) === 'z' && !e.shiftKey,
    run: () => useBrainStore.getState().undo(),
  },
  {
    id: 'redo',
    combo: 'Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y',
    description: 'Redo',
    preventDefault: true,
    matches: (e) => (mod(e) && key(e) === 'z' && e.shiftKey) || (mod(e) && key(e) === 'y'),
    run: () => useBrainStore.getState().redo(),
  },
  {
    id: 'copy',
    combo: 'Ctrl/Cmd+C',
    description: 'Copy selection',
    preventDefault: true,
    matches: (e) => mod(e) && key(e) === 'c',
    run: () => useBrainStore.getState().copySelection(),
  },
  {
    id: 'paste',
    combo: 'Ctrl/Cmd+V',
    description: 'Paste from clipboard',
    preventDefault: true,
    matches: (e) => mod(e) && key(e) === 'v',
    run: () => useBrainStore.getState().paste(),
  },
  {
    id: 'clear-selection',
    combo: 'Esc',
    description: 'Clear selection',
    preventDefault: false,
    matches: (e) => e.key === 'Escape',
    run: () => clearBrainSelection(),
  },
  {
    id: 'fit-view',
    combo: 'F',
    description: 'Fit brain to view',
    preventDefault: false,
    matches: (e) => key(e) === 'f',
    run: () => fitBrainView(),
  },
  {
    id: 'center-view',
    combo: 'C',
    description: 'Center the canvas',
    preventDefault: false,
    matches: (e) => key(e) === 'c',
    run: () => centerBrainView(),
  },
]

// Consumes a KeyboardEvent against the shortcut list, in order. The first
// matching shortcut wins; returns true if it was handled.
export function runShortcut(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return false

  for (const shortcut of KEYBOARD_SHORTCUTS) {
    if (shortcut.matches(event)) {
      if (shortcut.preventDefault) event.preventDefault()
      shortcut.run()
      return true
    }
  }
  return false
}
