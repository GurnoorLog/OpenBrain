import { useEffect, useRef, useState } from 'react'
import { useBrainStore } from '../store/useBrainStore'
import { PROVIDER_CATALOG } from '../core/architect'
import { getSelectedFireworksModel } from './canvas/architectAdapter'
import type { LogEntry } from '../core/types'

function shortModel(model: string): string {
  const parts = model.split('/')
  return parts[parts.length - 1] ?? model
}

export default function AgentLog() {
  const [expanded, setExpanded] = useState(false)
  const logs = useBrainStore((state) => state.logs)
  const activeProviderId = useBrainStore((state) => state.activeProviderId)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (expanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [expanded, logs])

  const activeProvider = PROVIDER_CATALOG.find((entry) => entry.id === activeProviderId)
  const selectedModel = activeProviderId === 'fireworks' ? getSelectedFireworksModel() : null
  const shownModel = shortModel(selectedModel ?? activeProvider?.defaultModel ?? '')
  const statusLabel = activeProvider
    ? `${activeProvider.name} · ${shownModel}`
    : 'No provider'

  const renderEntry = (entry: LogEntry) => (
    <div
      key={entry.id}
      className={`text-[11px] flex justify-between ${
        entry.level === 'error'
          ? 'text-red-400'
          : entry.level === 'success'
            ? 'text-teal-400'
            : entry.level === 'warning'
              ? 'text-amber-400'
              : 'text-gray-500'
      }`}
    >
      <span className="truncate pr-3" title={entry.message}>
        {entry.message}
      </span>
      <span className="opacity-60 flex-shrink-0">{entry.time}</span>
    </div>
  )

  return (
    <div className={`integrated-log-panel ${expanded ? 'agent-log-active' : ''}`}>
      <div className="px-4 py-4">
        <div className="status-badge">
          <iconify-icon icon="lucide:check-circle" className="text-gray-400 text-sm"></iconify-icon>
          <span className="text-gray-200 text-[13px] whitespace-nowrap overflow-hidden text-ellipsis">
            {statusLabel}
          </span>
        </div>
      </div>
      <div className="h-px bg-white/5 w-full"></div>
      <button
        id="agent-log-toggle"
        type="button"
        className="px-5 py-4 cursor-pointer group w-full text-left"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls="agent-log-content"
      >
        <div className="flex items-center justify-between text-gray-300 group-hover:text-white transition-colors">
          <div className="flex items-center gap-3">
            <iconify-icon icon="lucide:rocket" className="text-lg"></iconify-icon>
            <span className="text-[15px] font-medium">Agent log</span>
          </div>
          <iconify-icon icon="lucide:chevron-up" className="chevron-icon text-xl"></iconify-icon>
        </div>
      </button>
      <div id="agent-log-content" className="agent-log-content px-5" ref={contentRef} role="log" aria-live="polite">
        <div className="space-y-3 pt-4 pb-2">
          {logs.map(renderEntry)}
          <div className="pt-3 border-t border-white/5">
            <span className="text-[11px] text-teal-400 font-semibold">
              Agent is online and ready
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
