import { useEffect, useRef, useState } from 'react'
import type { ProviderStatus } from '../core/domain'
import { PROVIDER_CATALOG } from '../core/architect'
import { listProviderHealth } from './canvas/architectAdapter'
import type { ProviderOverview } from './canvas/architectAdapter'
import { useBrainStore } from '../store/useBrainStore'

const STATUS_LABEL: Readonly<Record<ProviderStatus, string>> = {
  available: 'Available',
  unconfigured: 'Not configured',
  unavailable: 'Unavailable',
  degraded: 'Degraded',
}

const STATUS_DOT: Readonly<Record<ProviderStatus, string>> = {
  available: 'bg-emerald-500',
  unconfigured: 'bg-gray-500',
  unavailable: 'bg-red-500',
  degraded: 'bg-amber-500',
}

function shortModel(model: string): string {
  const parts = model.split('/')
  return parts[parts.length - 1] ?? model
}

export default function ProviderPill() {
  const activeProviderId = useBrainStore((state) => state.activeProviderId)
  const setActiveProvider = useBrainStore((state) => state.setActiveProvider)
  const [open, setOpen] = useState(false)
  const [health, setHealth] = useState<Readonly<Record<string, ProviderOverview>>>({})
  const ref = useRef<HTMLDivElement>(null)

  const activeModel =
    PROVIDER_CATALOG.find((entry) => entry.id === activeProviderId)?.defaultModel ?? ''

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', onClickOutside)
    return () => document.removeEventListener('click', onClickOutside)
  }, [])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) {
      void listProviderHealth().then((overviews) => {
        const map: Record<string, ProviderOverview> = {}
        for (const overview of overviews) map[overview.id] = overview
        setHealth(map)
      })
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        className="flex items-center gap-1.5 px-3 h-8 bg-white/5 hover:bg-white/10 rounded-lg text-[11px] text-gray-300 border border-white/10 transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          toggle()
        }}
        aria-expanded={open}
        aria-label="Select provider"
        title={activeModel}
      >
        <span>{shortModel(activeModel)}</span>
        <iconify-icon icon="lucide:chevron-down"></iconify-icon>
      </button>

      <div
        className={`menu-dropdown absolute right-0 bottom-full mb-2 w-64 glass-panel p-2 z-50 ${open ? 'active' : ''}`}
        style={{ transformOrigin: 'bottom right' }}
      >
        <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-gray-500 font-bold">
          Provider
        </div>
        <div className="flex flex-col gap-0.5">
          {PROVIDER_CATALOG.map((entry) => {
            const overview = health[entry.id]
            const status = overview?.health.status
            const isActive = entry.id === activeProviderId
            return (
              <button
                key={entry.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-white/5 transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveProvider(entry.id)
                  setOpen(false)
                }}
                aria-pressed={isActive}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-gray-200 font-medium truncate">{entry.name}</span>
                    {isActive && <iconify-icon icon="lucide:check" className="text-teal-400 text-xs"></iconify-icon>}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">{shortModel(entry.defaultModel)}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  {status ? (
                    <>
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`}></span>
                      <span className={`text-[10px] ${status === 'available' ? 'text-emerald-400' : status === 'unavailable' ? 'text-red-400' : 'text-gray-400'}`}>
                        {STATUS_LABEL[status]}
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] text-gray-500">Checking…</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
