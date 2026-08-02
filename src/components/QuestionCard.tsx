import { useState } from 'react'
import { useBrainStore } from '../store/useBrainStore'

// Shown when the architect has clarifying questions before designing. One
// answer per question; submitting feeds the answers into the real design call
// so the generated brain matches what the user actually meant.
export default function QuestionCard() {
  const clarify = useBrainStore((state) => state.clarify)
  const submitClarify = useBrainStore((state) => state.submitClarify)
  const [answers, setAnswers] = useState<string[]>([])

  if (!clarify) return null

  const setAnswer = (index: number, value: string) => {
    setAnswers((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const allAnswered = clarify.questions.every((_, index) => (answers[index] ?? '').trim() !== '')

  const submit = () => {
    submitClarify(answers)
  }

  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-40 w-96 pointer-events-auto thinking-slide-in">
      <div className="flex max-h-[min(78vh,560px)] flex-col bg-[#0d1117]/90 backdrop-blur border border-teal-400/25 rounded-2xl px-4 py-4 shadow-2xl">
        <div className="flex items-center gap-2 mb-1">
          <iconify-icon icon="lucide:message-circle-question" className="text-teal-400 text-lg"></iconify-icon>
          <h3 className="text-white font-bold tracking-tight text-sm">A few questions first</h3>
        </div>
        <p className="text-xs text-gray-400 leading-snug mb-3">
          The architect wants to nail your intent before designing the brain.
        </p>

        <div className="question-scroll flex flex-col gap-3">
          {clarify.questions.map((question, index) => (
            <div key={index}>
              <label className="text-xs text-gray-200 font-medium leading-snug">{question}</label>
              <input
                type="text"
                value={answers[index] ?? ''}
                onChange={(e) => setAnswer(index, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && allAnswered) submit()
                }}
                placeholder="Your answer…"
                autoFocus={index === 0}
                className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-teal-400/50"
              />
            </div>
          ))}
        </div>

        <button
          className={`mt-4 w-full rounded-lg text-black font-bold text-sm py-2 transition-colors ${
            allAnswered
              ? 'bg-teal-500 hover:bg-teal-400'
              : 'bg-white/10 text-white/40 cursor-not-allowed'
          }`}
          disabled={!allAnswered}
          onClick={() => submitClarify(answers)}
        >
          Design it
        </button>
      </div>
    </div>
  )
}
