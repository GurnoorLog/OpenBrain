import { useBrainStore } from '../store/useBrainStore'

export function exportBrain(): void {
  const { nodes, connections } = useBrainStore.getState()
  const payload = {
    app: 'OpenBrain',
    version: 1,
    exportedAt: new Date().toISOString(),
    brain: {
      nodes: nodes.map(({ id, type, x, y, content }) => ({ id, type, x, y, content })),
      connections,
    },
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

export async function shareBrain(): Promise<void> {
  const { nodes, connections } = useBrainStore.getState()
  const payload = {
    app: 'OpenBrain',
    version: 1,
    brain: {
      nodes: nodes.map(({ id, type, x, y, content }) => ({ id, type, x, y, content })),
      connections,
    },
  }
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload))
    useBrainStore.getState().addLog('Brain spec copied to clipboard', 'success')
  } catch {
    useBrainStore.getState().addLog('Clipboard unavailable', 'error')
  }
}
