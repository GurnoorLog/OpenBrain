import { useEffect, useState } from 'react'
import { fetchModelCatalog, type ModelCatalogEntry } from '../core/localModel'
import { useBrainStore } from '../store/useBrainStore'
import { screenToFlowPosition } from './canvas/flowInstance'

function formatMb(sizeMb: number): string {
  if (sizeMb >= 1024) return `${(sizeMb / 1024).toFixed(1)} GB`
  return `${sizeMb} MB`
}

function taskLabel(task: string): string {
  if (task === 'automatic-speech-recognition') return 'Speech → text'
  if (task === 'zero-shot-image-classification') return 'Image classify'
  return 'Text generation'
}

// Model Hub panel: browse downloadable open models from the cloud catalog and
// drop one onto the canvas as a Local Model node. These models run entirely in
// the browser — no API key, private by design.
export default function ModelHub() {
  const open = useBrainStore((state) => state.hubOpen)
  const setHubOpen = useBrainStore((state) => state.setHubOpen)
  const addLocalNode = useBrainStore((state) => state.addLocalNode)
  const [catalog, setCatalog] = useState<readonly ModelCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchModelCatalog().then((items) => {
      if (cancelled) return
      setCatalog(items)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  const addLocalNodeToCanvas = (model: ModelCatalogEntry) => {
    const point = screenToFlowPosition({
      x: window.innerWidth / 2 + 80,
      y: window.innerHeight / 2,
    })
    addLocalNode(model.modelId, point.x, point.y)
    setHubOpen(false)
    useBrainStore.getState().addLog(
      `Local Model node added (${model.name}) — runs in your browser, no key`,
      'success',
    )
  }

  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto palette-fade-in"
        onClick={() => setHubOpen(false)}
      ></div>

      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-50 pointer-events-auto">
        <div className="palette-pop">
          <div className="w-[440px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#0b0d13]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-400/10 border border-sky-400/20 flex items-center justify-center">
                  <iconify-icon icon="lucide:hard-drive-download" className="text-sky-400 text-lg"></iconify-icon>
                </div>
                <div>
                  <h3 className="text-white font-bold tracking-tight text-base leading-tight">Model Hub</h3>
                  <p className="text-xs text-gray-400">Open models that run in your browser — no API key</p>
                </div>
              </div>
              <button
                id="hub-close-btn"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                onClick={() => setHubOpen(false)}
                title="Close Model Hub"
              >
                <iconify-icon icon="lucide:x" className="text-lg"></iconify-icon>
              </button>
            </div>

            <div className="p-4 palette-grid-scroll max-h-[62vh]">
              {loading && (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-400">
                  <iconify-icon icon="lucide:loader-circle" className="text-2xl animate-spin text-sky-400"></iconify-icon>
                  <span className="text-xs">Loading model catalog…</span>
                </div>
              )}

              {!loading && error && (
                <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-xs text-red-200">
                  {error}
                </div>
              )}

              {!loading && !error && (
                <div className="flex flex-col gap-3">
                  {catalog.map((model) => (
                    <div
                      key={model.id}
                      className="rounded-xl border border-white/10 bg-white/[0.03] hover:border-sky-400/40 hover:bg-white/[0.06] transition-colors p-3.5"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: `${model.accent}1a`, border: `1px solid ${model.accent}33` }}
                        >
                          <iconify-icon icon="lucide:brain" style={{ color: model.accent }} className="text-xl"></iconify-icon>
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-white leading-tight">{model.name}</span>
                            <span className="text-[10px] text-gray-500 font-mono whitespace-nowrap">
                              {formatMb(model.sizeMb)}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-400 leading-snug mt-1">{model.description}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full"
                              style={{ background: `${model.accent}1f`, color: model.accent }}
                            >
                              {taskLabel(model.task)}
                            </span>
                            {model.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400">
                                {tag}
                              </span>
                            ))}
                            <span className="text-[10px] text-gray-500 flex items-center gap-1 ml-auto">
                              <iconify-icon icon="lucide:lock" className="text-[10px]"></iconify-icon>
                              runs locally
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        id={`hub-${model.id}-add-btn`}
                        className="mt-3 w-full rounded-lg bg-sky-400/15 hover:bg-sky-400/25 border border-sky-400/30 text-sky-300 hover:text-sky-200 text-xs font-semibold py-2 transition-colors flex items-center justify-center gap-2"
                        onClick={() => addLocalNodeToCanvas(model)}
                      >
                        <iconify-icon icon="lucide:plus"></iconify-icon>
                        Add to canvas
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-white/10 flex items-center gap-2 text-[10px] text-gray-500">
              <iconify-icon icon="lucide:shield-check" className="text-teal-400"></iconify-icon>
              Weights stream from HuggingFace CDN and are cached by your browser. Your prompts never leave this device.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
