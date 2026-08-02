import { useBrainStore } from '../../store/useBrainStore'
import type { BrainNodeSpec, Connection } from '../types'
import { getComposioApiKey } from '../tools/toolRegistry'

const CLOUD_TIMEOUT_MS = 150000

interface CloudRunPayload {
  ok?: boolean
  error?: string
  outputs?: Record<string, Record<string, unknown>>
  order?: string[]
  durationMs?: number
  log?: { message: string; level?: string; nodeId?: string | null }[]
}

let cloudController: AbortController | null = null
let cloudStopRequested = false

// Aborts an in-flight cloud run. No-op when nothing is running.
export function stopRunInCloud(): void {
  cloudStopRequested = true
  cloudController?.abort()
}

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
  cloudController = controller
  cloudStopRequested = false
  const timeout = window.setTimeout(() => controller.abort(), CLOUD_TIMEOUT_MS)

  const brain: { nodes: BrainNodeSpec[]; connections: Connection[] } = {
    nodes: store.nodes.map(({ id, type, x, y, content, reason, model, configuration }) => ({
      id,
      type,
      x,
      y,
      content,
      reason,
      model,
      configuration,
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
      body: JSON.stringify({
        brain,
        // The Composio key is already bundled in this build (VITE_ env var),
        // so sending it along lets the cloud executor run GitHub/MCP nodes
        // without needing a COMPOSIO_API_KEY set in Render's dashboard.
        composioApiKey: getComposioApiKey() ?? undefined,
      }),
      signal: controller.signal,
    })

    // Defensive parse: Render's free tier can answer with an HTML error page
    // (cold start / 502) instead of JSON. Never let JSON.parse throw and lose
    // the whole response to a confusing "Unexpected token" message.
    const text = await response.text()
    let payload: CloudRunPayload | null = null
    if (text.trim() !== '') {
      try {
        payload = JSON.parse(text) as CloudRunPayload
      } catch {
        payload = null
      }
    }
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error ?? `Cloud executor returned HTTP ${response.status}`)
    }
    if (payload === null) {
      throw new Error(`Cloud executor returned an unparseable response (HTTP ${response.status})`)
    }

    for (const entry of payload.log ?? []) {
      store.addLog(entry.message, (entry.level as 'success' | 'warning' | 'error' | 'info') ?? 'info')
    }
    for (const [nodeId, outputs] of Object.entries(payload.outputs ?? {})) {
      store.setNode(nodeId, { status: 'success', output: outputs })
    }
    // A successful run means every node finished. Any node still marked
    // running (the server may omit nodes with no output) is settled now, so
    // nothing strands in the "running" state.
    for (const node of useBrainStore.getState().nodes) {
      if (node.status === 'running') store.setNode(node.id, { status: 'success' })
    }
    store.addLog(
      `Brain ran in the cloud in ${payload.durationMs ?? 0}ms — results written back`,
      'success',
    )
  } catch (error) {
    store.setRunning(false)
    if (cloudStopRequested) {
      for (const node of useBrainStore.getState().nodes) {
        if (node.status === 'running') store.setNode(node.id, { status: 'idle' })
      }
      store.addLog('Cloud run stopped', 'warning')
    } else {
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
    }
  } finally {
    window.clearTimeout(timeout)
    if (cloudController === controller) cloudController = null
    store.setRunning(false)
  }
}
