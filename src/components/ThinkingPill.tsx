import { useBrainStore } from '../store/useBrainStore'

// Live "AI thinking" pill pinned to the left-center of the studio, just above
// the agent log. While the architect is generating it streams the model's
// reasoning in real time. If generation fails, it flips to a red error card.
// Is NOT a chat — read-only status + errors only.
export default function ThinkingPill() {
  const generating = useBrainStore((state) => state.generating)
  const thinking = useBrainStore((state) => state.thinking)
  const generationError = useBrainStore((state) => state.generationError)

  if (!generating && !generationError) return null

  if (generationError && !generating) {
    return (
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-40 max-w-xs pointer-events-auto">
        <div className="flex items-start gap-3 bg-red-950/70 backdrop-blur border border-red-500/40 rounded-2xl px-4 py-3 shadow-xl">
          <iconify-icon icon="lucide:triangle-alert" className="text-red-400 text-lg shrink-0 mt-0.5"></iconify-icon>
          <div className="min-w-0">
            <div className="text-white/80 text-xs font-bold uppercase tracking-wider">
              Generation failed
            </div>
            <p className="mt-1 text-xs text-red-200/90 leading-snug break-words">{generationError}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-40 max-w-xs pointer-events-none">
      <div className="flex items-start gap-3 bg-black/60 backdrop-blur border border-teal-400/25 rounded-2xl px-4 py-3 shadow-xl">
        <div className="relative mt-0.5 shrink-0">
          <div className="w-3 h-3 rounded-full bg-teal-400 animate-ping"></div>
          <div className="absolute inset-0 w-3 h-3 rounded-full bg-teal-400"></div>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-white/70 text-xs font-bold uppercase tracking-wider">
            <span>AI is thinking</span>
            <span className="inline-flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1 h-1 rounded-full bg-teal-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                ></span>
              ))}
            </span>
          </div>
          <p className="mt-1 text-xs text-teal-100/80 leading-snug line-clamp-3">{thinking}</p>
        </div>
      </div>
    </div>
  )
}