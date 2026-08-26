import { useState } from 'react'
import { useBrainStore } from '../store/useBrainStore'

// Live "AI thinking" pill pinned to the left-center of the studio. While the
// architect generates it streams the model's reasoning in real time, sliding
// in with an animation. After generation the final reasoning stays visible
// (collapsed) — click the pill to expand it and read the full reasoning. If
// generation fails, it flips to a red error card.
export default function ThinkingPill() {
  const generating = useBrainStore((state) => state.generating)
  const thinking = useBrainStore((state) => state.thinking)
  const lastReasoning = useBrainStore((state) => state.lastReasoning)
  const generationError = useBrainStore((state) => state.generationError)
  const [expanded, setExpanded] = useState(false)

  const visible = generating || lastReasoning.trim() !== '' || generationError
  if (!visible) return null

  if (generationError && !generating) {
    return (
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-40 max-w-xs pointer-events-auto thinking-slide-in">
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

  const isLive = generating
  const text = isLive ? thinking : lastReasoning
  const collapsed = !isLive && !expanded

  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-40 max-w-sm pointer-events-auto thinking-slide-in">
      <button
        className="text-left w-full group"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={!isLive && expanded}
        title={isLive ? undefined : expanded ? 'Collapse reasoning' : 'Expand full reasoning'}
      >
        <div
          className={`flex items-start gap-3 bg-black/60 backdrop-blur border rounded-2xl px-4 py-3 shadow-xl transition-colors ${
            isLive ? 'border-teal-400/25' : 'border-white/10 hover:border-white/25'
          }`}
        >
          {isLive ? (
            <div className="relative mt-0.5 shrink-0">
              <div className="w-3 h-3 rounded-full bg-teal-400 animate-ping"></div>
              <div className="absolute inset-0 w-3 h-3 rounded-full bg-teal-400"></div>
            </div>
          ) : (
            <iconify-icon icon="lucide:brain" className="text-teal-400 text-lg shrink-0 mt-0.5"></iconify-icon>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-white/70 text-xs font-bold uppercase tracking-wider">
                {isLive ? <span>AI is thinking</span> : <span>Last reasoning</span>}
                {isLive && (
                  <span className="inline-flex gap-0.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1 h-1 rounded-full bg-teal-400 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      ></span>
                    ))}
                  </span>
                )}
              </div>
              {!isLive && (
                <iconify-icon
                  icon={expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                  className="text-gray-500 text-sm shrink-0"
                ></iconify-icon>
              )}
            </div>
            <p
              className={`mt-1 text-xs text-teal-100/80 leading-snug break-words ${
                collapsed ? 'line-clamp-3' : 'reasoning-scroll'
              }`}
            >
              {text}
            </p>
          </div>
        </div>
      </button>
    </div>
  )
}
