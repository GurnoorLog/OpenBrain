import { useState } from 'react'
import { useBrainStore } from '../store/useBrainStore'
import { clearToolKey, setToolKey } from '../core/tools/toolRegistry'

// Shown when a run needs an API key for a tool the user hasn't configured yet.
// Password-style masked input + "how to get it" instructions from the tool
// catalog. The key is persisted to localStorage and only read by the tool's
// executor at runtime — the AI architect never sees it.
export default function KeyRequestCard() {
  const request = useBrainStore((state) => state.pendingKeyRequest)
  const setPendingKeyRequest = useBrainStore((state) => state.setPendingKeyRequest)
  const addLog = useBrainStore((state) => state.addLog)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!request) return null

  const save = () => {
    if (value.trim() === '') {
      setError('Enter the API key first.')
      return
    }
    setToolKey(request.toolId, value.trim())
    setPendingKeyRequest(null)
    setValue('')
    setError(null)
    addLog(`${request.name} API key saved`, 'success')
  }

  const dismiss = () => {
    setPendingKeyRequest(null)
    setValue('')
    setError(null)
    clearToolKey(request.toolId)
  }

  return (
    <div className="absolute left-4 bottom-40 z-40 w-80 pointer-events-auto">
      <div className="bg-[#0d1117]/90 backdrop-blur border border-amber-500/30 rounded-2xl px-4 py-4 shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <iconify-icon icon="lucide:key-round" className="text-amber-400 text-lg"></iconify-icon>
            <h3 className="text-white font-bold tracking-tight text-sm">{request.name} API key</h3>
          </div>
          <button
            className="text-gray-500 hover:text-white transition-colors"
            onClick={dismiss}
            aria-label="Dismiss"
          >
            <iconify-icon icon="lucide:x"></iconify-icon>
          </button>
        </div>

        <p className="text-xs text-gray-300 leading-snug">{request.description}</p>

        <div className="mt-3">
          <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
            API key
          </label>
          <input
            type="password"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') dismiss()
            }}
            placeholder="Paste your API key…"
            autoFocus
            className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-teal-400/50"
          />
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        </div>

        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
            How to get it
          </div>
          <ul className="mt-1 space-y-1">
            {request.instructions.map((instruction, index) => (
              <li key={index} className="text-[11px] text-gray-400 leading-snug flex gap-1.5">
                <span className="text-amber-400 shrink-0">•</span>
                <span>{instruction}</span>
              </li>
            ))}
          </ul>
          {request.envHint && (
            <p className="mt-2 text-[10px] text-gray-500">
              Stored locally as <code className="text-gray-400">{request.envHint}</code>
            </p>
          )}
        </div>

        <button
          className="mt-4 w-full rounded-lg bg-amber-500/90 hover:bg-amber-400 text-black font-bold text-sm py-2 transition-colors"
          onClick={save}
        >
          Save key &amp; run
        </button>
      </div>
    </div>
  )
}
