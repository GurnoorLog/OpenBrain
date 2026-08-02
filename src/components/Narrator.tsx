import { useBrainStore } from '../store/useBrainStore'

// Top-center "design narrator": while the architect reveals the brain node by
// node, this bar shows the reason it's placing the current node — the
// "think out loud" moment. Fades in/out with each node.
export default function Narrator() {
  const narration = useBrainStore((state) => state.designNarration)

  if (!narration.trim()) return null

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none narrator-in">
      <div className="flex items-start gap-2.5 max-w-xl rounded-2xl border border-teal-400/30 bg-black/70 backdrop-blur px-4 py-2.5 shadow-2xl">
        <iconify-icon
          icon="lucide:sparkles"
          className="text-teal-400 text-base shrink-0 mt-0.5"
        ></iconify-icon>
        <p className="text-sm text-teal-50/90 leading-snug">{narration}</p>
      </div>
    </div>
  )
}
