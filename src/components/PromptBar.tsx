import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useBrainStore } from '../store/useBrainStore'
import ProviderPill from './ProviderPill'

export default function PromptBar() {
  const [prompt, setPrompt] = useState('')
  const generateFromPrompt = useBrainStore((state) => state.generateFromPrompt)
  const stopGeneration = useBrainStore((state) => state.stopGeneration)
  const generating = useBrainStore((state) => state.generating)

  const submit = () => {
    if (!prompt.trim()) return
    generateFromPrompt(prompt, { width: window.innerWidth, height: window.innerHeight })
    setPrompt('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex-1 max-w-2xl px-8 mb-2">
      <div
        className={`glass-panel p-1.5 focus-within:border-teal-500/30 ${generating ? 'chat-thinking' : ''}`}
        aria-busy={generating}
      >
        <div className="px-4 pt-3 pb-1 text-gray-300 text-[15px] font-medium">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={generating ? 'Architect is thinking…' : 'What would you like to change or create?'}
            className="w-full bg-transparent border-none outline-none placeholder:text-gray-500"
          />
        </div>
        <div className="flex items-center justify-between px-2 pb-2 mt-2">
          <div className="flex items-center gap-2">
            <button className="toolbar-btn w-8 h-8 opacity-60 hover:opacity-100">
              <iconify-icon icon="lucide:plus"></iconify-icon>
            </button>
            <div className="h-4 w-px bg-white/10 mx-1"></div>
            <span className="text-lg text-gray-700">/</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="toolbar-btn w-8 h-8 opacity-60 hover:opacity-100">
              <iconify-icon icon="lucide:sticky-note"></iconify-icon>
            </button>
            <button className="toolbar-btn w-8 h-8 opacity-60 hover:opacity-100">
              <iconify-icon icon="lucide:brain-circuit"></iconify-icon>
            </button>
            <ProviderPill />
            <button className="toolbar-btn w-8 h-8 opacity-60 hover:opacity-100">
              <iconify-icon icon="lucide:wand-2"></iconify-icon>
            </button>
            {generating ? (
              <button
                className="w-8 h-8 rounded-lg bg-red-500 text-black flex items-center justify-center shadow-lg shadow-red-500/20 hover:bg-red-400 transition-all"
                onClick={stopGeneration}
                aria-label="Stop generation"
                title="Stop generation"
              >
                <iconify-icon icon="lucide:square" className="text-sm font-bold"></iconify-icon>
              </button>
            ) : (
              <button
                className="w-8 h-8 rounded-lg bg-teal-500 text-black flex items-center justify-center shadow-lg shadow-teal-500/20 hover:bg-teal-400 transition-all"
                onClick={submit}
                aria-label="Generate brain"
                title="Generate brain"
              >
                <iconify-icon icon="lucide:arrow-up" className="text-lg font-bold"></iconify-icon>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
