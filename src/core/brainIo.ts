import { useBrainStore } from '../store/useBrainStore'
import type { BrainNodeSpec, Connection } from './types'
import {
  buildBrainFile,
  parseBrainFile,
  upgradeLegacyExport,
  type BrainFile,
} from './brain/brainFile'

function serializeBrain(): { nodes: BrainNodeSpec[]; connections: Connection[] } {
  const { nodes, connections } = useBrainStore.getState()
  return {
    nodes: nodes.map(({ id, type, x, y, content, reason, model, configuration }) => ({
      id,
      type,
      x,
      y,
      content,
      reason,
      model,
      configuration,
    })),
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
  // Defer the revoke: Firefox/Safari cancel the download if the URL dies
  // synchronously with click().
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  useBrainStore.getState().addLog('Brain exported as JSON', 'success')
}

// Downloads the current brain as a first-class .brain project file.
export function exportBrainFile(): void {
  const store = useBrainStore.getState()
  const file = buildBrainFile(
    {
      nodes: serializeBrain().nodes,
      connections: serializeBrain().connections,
    },
    { name: store.projectName ?? undefined },
  )
  const blob = new Blob([JSON.stringify(file, null, 2)], {
    type: 'application/vnd.openbrain.brain+json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const slug = (file.name || 'brain').trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-')
  link.href = url
  link.download = `${slug || 'brain'}.brain`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  store.addLog(`Brain exported as ${link.download}`, 'success')
}

// Opens a .brain file (or a legacy brain.json export) from the disk and loads
// it into the canvas. Returns true on success.
export async function importBrainFile(file: File): Promise<boolean> {
  const store = useBrainStore.getState()
  try {
    const raw = await file.text()
    const parsed = parseBrainFile(raw)
    const target = parsed.problems.length > 0 ? upgradeLegacyExport(JSON.parse(raw)) : parsed.file
    if (!target) {
      store.addLog(`Cannot open "${file.name}": invalid .brain file`, 'error')
      return false
    }
    applyBrainFile(target)
    store.addLog(`Opened ${file.name} (${parsed.problems.length} warnings)`, 'success')
    return true
  } catch (error) {
    store.addLog(
      `Cannot open "${file.name}": ${error instanceof Error ? error.message : String(error)}`,
      'error',
    )
    return false
  }
}

export function applyBrainFile(file: BrainFile): void {
  useBrainStore.getState().setBrain({
    nodes: [...file.graph.nodes],
    connections: [...file.graph.connections],
  })
  if (file.name) useBrainStore.getState().setBrainTitle(file.name)
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
    // Consume the hash so opening a fresh project afterwards doesn't re-apply
    // the old shared brain.
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    return true
  } catch {
    useBrainStore.getState().addLog('Shared brain link is invalid', 'error')
    return false
  }
}
