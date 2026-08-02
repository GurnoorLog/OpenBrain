import { useBrainStore } from '../../store/useBrainStore'
import type { BrainNodeSpec, Connection } from '../types'

const CLOUD_TIMEOUT_MS = 150000

// Posts the current brain graph to the shared Render cloud executor and maps
// its per-node results + run log back onto the store, so a "Run in cloud"
// feels identical to a local run. The model API key stays server-side — the
// browser only sends the graph.
export async function runBrainInCloud(): Promise<void> {
  const store = useBrainStore.getState()
  if (store.running || store.nodes.length === 0) return

  const baseUrl = import.meta.env.VITE_CLOUD_EXECUTOR_URL
  if (!baseUrl) {
    store.addLog(
      'Cloud executor not configured — set VITE_CLOUD_EXECUTOR_URL to your Render service URL',
      'error',
    )
    return
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), CLOUD_TIMEOUT_MS)

  const brain: { nodes: BrainNodeSpec[]; connections: Connection[] } = {
    nodes: store.nodes.map(({ id, type, x, y, content, reason, model }) => ({
      id,
      type,
      x,
      y,
      content,
      reason,
      model,
    })),
    connections: store.connections,
  }

  store.setRunning(true)
  store.resetStatuses()
  store.addLog('Sending brain to cloud executor (Render)…', 'info')
  for (const node of store.nodes) {
    store.setNode(node.id, { status: 'running' })
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brain }),
      signal: controller.signal,
    })
    const payload = (await response.json()) as {
      ok?: boolean
      error?: string
      outputs?: Record<string, Record<string, unknown>>
      order?: string[]
      durationMs?: number
      log?: { message: string; level?: string; nodeId?: string | null }[]
    }

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error ?? `Cloud executor returned HTTP ${response.status}`)
    }

    for (const entry of payload.log ?? []) {
      store.addLog(entry.message, (entry.level as 'success' | 'warning' | 'error' | 'info') ?? 'info')
    }
    for (const [nodeId, outputs] of Object.entries(payload.outputs ?? {})) {
      store.setNode(nodeId, { status: 'success', output: outputs })
    }
    for (const nodeId of payload.order ?? []) {
      const node = useBrainStore.getState().nodes.find((entry) => entry.id === nodeId)
      if (node && node.status === 'running' && !payload.outputs?.[nodeId]) {
        store.setNode(nodeId, { status: 'success', output: node.output })
      }
    }
    store.addLog(
      `Brain ran in the cloud in ${payload.durationMs ?? 0}ms — results written back`,
      'success',
    )
  } catch (error) {
    store.setRunning(false)
    for (const node of useBrainStore.getState().nodes) {
      if (node.status === 'running') store.setNode(node.id, { status: 'error' })
    }
    const detail =
      controller.signal.aborted
        ? 'Cloud run timed out (no response within 150s)'
        : error instanceof Error
          ? error.message
          : String(error)
    store.addLog(`Cloud run failed: ${detail}`, 'error')
  } finally {
    window.clearTimeout(timeout)
    store.setRunning(false)
  }
}
