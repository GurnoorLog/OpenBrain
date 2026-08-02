import { useBrainStore } from '../store/useBrainStore'
import type { BrainNodeSpec, Connection } from './types'

function serializeBrain(): { nodes: BrainNodeSpec[]; connections: Connection[] } {
  const { nodes, connections } = useBrainStore.getState()
  return {
    nodes: nodes.map(({ id, type, x, y, content, reason }) => ({ id, type, x, y, content, reason })),
    connections,
  }
}

export function exportBrain(): void {
  const brain = serializeBrain()
  const payload = {
    app: 'OpenBrain',
    version: 1,
    exportedAt: new Date().toISOString(),
    brain,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'brain.json'
  link.click()
  URL.revokeObjectURL(url)
  useBrainStore.getState().addLog('Brain exported as JSON', 'success')
}

// Copies a full shareable URL (#brain=...) to the clipboard. Anyone opening
// that link loads the exact graph instantly.
export async function shareBrain(): Promise<string | null> {
  const brain = serializeBrain()
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(brain))))
  const url = `${window.location.origin}${window.location.pathname}#brain=${encoded}`
  try {
    await navigator.clipboard.writeText(url)
    useBrainStore.getState().addLog('Share link copied to clipboard', 'success')
    return url
  } catch {
    useBrainStore.getState().addLog('Clipboard unavailable', 'error')
    return null
  }
}

// Reads a #brain=... share link from the current URL and loads it into the
// store. Returns true when a valid shared brain was found and applied.
export function loadSharedBrain(): boolean {
  const hash = window.location.hash
  const match = /#brain=([^&]+)/.exec(hash)
  if (!match) return false
  try {
    const raw = decodeURIComponent(match[1])
    const json = decodeURIComponent(escape(atob(raw)))
    const parsed = JSON.parse(json) as {
      nodes?: BrainNodeSpec[]
      connections?: Connection[]
    }
    if (!Array.isArray(parsed.nodes)) return false
    useBrainStore.getState().setBrain({
      nodes: parsed.nodes,
      connections: parsed.connections ?? [],
    })
    useBrainStore.getState().addLog('Shared brain loaded from link', 'success')
    return true
  } catch {
    useBrainStore.getState().addLog('Shared brain link is invalid', 'error')
    return false
  }
}
