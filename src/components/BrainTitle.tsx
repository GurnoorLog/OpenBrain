import { useEffect, useRef, useState } from 'react'
import { useBrainStore } from '../store/useBrainStore'

// Editable canvas title pinned to the top-center of the studio. The architect
// names the brain from the prompt; the user can click the pencil and rename it.
export default function BrainTitle() {
  const brainTitle = useBrainStore((state) => state.brainTitle)
  const projectName = useBrainStore((state) => state.projectName)
  const setBrainTitle = useBrainStore((state) => state.setBrainTitle)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const label = brainTitle || projectName || 'Untitled Brain'

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = () => {
    setEditing(false)
    setBrainTitle(draft.trim() || label)
  }

  if (editing) {
    return (
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 px-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="border border-white/20 bg-black/60 backdrop-blur text-white text-sm font-semibold rounded-lg px-3 py-1.5 outline-none w-64"
          aria-label="Brain title"
        />
      </div>
    )
  }

  return (
    <button
      onClick={() => {
        setDraft(label)
        setEditing(true)
      }}
      className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 bg-black/50 backdrop-blur border border-white/10 rounded-full text-white text-sm font-semibold hover:bg-black/70 hover:border-white/25 transition-all"
      aria-label="Rename brain"
    >
      <span className="truncate max-w-[40vw]">{label}</span>
      <iconify-icon icon="lucide:pencil" className="text-xs text-white/40"></iconify-icon>
    </button>
  )
}