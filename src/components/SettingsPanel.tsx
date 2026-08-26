import { useEffect, useState } from 'react'
import type { ProviderStatus } from '../core/domain'
import { PROVIDER_CATALOG } from '../core/architect'
import { getActiveProviderId, isFireworksApiKeyConfigured, listProviderHealth, getSelectedFireworksModel, setSelectedFireworksModel } from './canvas/architectAdapter'
import { isHfTokenConfigured } from './canvas/finetuneAdapter'
import { TOOLS } from '../core/tools/toolRegistry'
import { FIREWORKS_MODELS } from '../core/providers/fireworksModels'
import { useBrainStore } from '../store/useBrainStore'
import type { ProviderOverview } from './canvas/architectAdapter'

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

interface SettingsPanelProps {
  readonly open: boolean
  readonly onClose: () => void
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [overviews, setOverviews] = useState<readonly ProviderOverview[]>([])
  const [fireworksKeySet, setFireworksKeySet] = useState(false)
  const [hfTokenSet, setHfTokenSet] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>(() => getSelectedFireworksModel() ?? FIREWORKS_MODELS[0].id)
  const agent = useBrainStore((state) => state.agentSchedule)
  const setAgentSchedule = useBrainStore((state) => state.setAgentSchedule)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setFireworksKeySet(isFireworksApiKeyConfigured())
    setHfTokenSet(isHfTokenConfigured())
    setSelectedModel(getSelectedFireworksModel() ?? FIREWORKS_MODELS[0].id)
    void listProviderHealth().then((result) => {
      if (!cancelled) setOverviews(result)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  const active = PROVIDER_CATALOG.find((entry) => entry.id === getActiveProviderId()) ?? PROVIDER_CATALOG[0]

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>
      <div className="relative glass-panel w-[26rem] max-w-[90vw] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold tracking-tight text-lg">Settings</h2>
          <button
            className="toolbar-btn w-8 h-8 text-gray-400 hover:text-white"
            onClick={onClose}
            aria-label="Close settings"
          >
            <iconify-icon icon="lucide:x"></iconify-icon>
          </button>
        </div>

        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">
            Active provider
          </div>
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10">
            <div>
              <div className="text-sm text-gray-200 font-medium">{active.name}</div>
              <div className="text-[11px] text-gray-500">{shortModel(active.defaultModel)}</div>
            </div>
            <div className="text-[11px] text-teal-400 font-semibold">Active</div>
          </div>
        </div>

        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">
            Provider health
          </div>
          <div className="flex flex-col gap-1.5">
            {PROVIDER_CATALOG.map((entry) => {
              const overview = overviews.find((item) => item.id === entry.id)
              const status = overview?.health.status
              return (
                <div key={entry.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                  <div>
                    <div className="text-sm text-gray-200 font-medium">{entry.name}</div>
                    <div className="text-[11px] text-gray-500">{shortModel(entry.defaultModel)}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {status ? (
                      <>
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`}></span>
                        <span className={`text-[11px] ${status === 'available' ? 'text-emerald-400' : status === 'unavailable' ? 'text-red-400' : 'text-gray-400'}`}>
                          {STATUS_LABEL[status]}
                        </span>
                      </>
                    ) : (
                      <span className="text-[11px] text-gray-500">Checking…</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">
            Fireworks model
          </div>
          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
            {FIREWORKS_MODELS.map((model) => {
              const selected = model.id === selectedModel
              return (
                <button
                  key={model.id}
                  onClick={() => {
                    setSelectedModel(model.id)
                    setSelectedFireworksModel(model.id)
                  }}
                  className={`flex items-start gap-2.5 px-3 py-2 rounded-lg text-left border transition-colors ${
                    selected
                      ? 'bg-teal-400/10 border-teal-400/40'
                      : 'bg-white/5 border-white/10 hover:border-white/25'
                  }`}
                >
                  <span
                    className={`mt-0.5 w-3 h-3 rounded-full shrink-0 border ${
                      selected ? 'bg-teal-400 border-teal-400' : 'border-gray-500'
                    }`}
                  ></span>
                  <span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm text-gray-100 font-medium">{model.name}</span>
                      {model.recommended ? (
                        <span className="text-[9px] uppercase tracking-wider text-teal-300 font-bold">
                          Default
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-[11px] text-gray-500 mt-0.5">{model.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5 flex items-center gap-2">
            Agent schedule
            <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-400 text-[9px] font-bold uppercase rounded border border-amber-500/20">
              Soon
            </span>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-3 flex flex-col gap-2.5">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-gray-200 font-medium">Scheduled agent</span>
              <input
                type="checkbox"
                checked={agent.enabled}
                onChange={(event) => setAgentSchedule({ enabled: event.target.checked })}
                className="w-4 h-4 accent-teal-400"
              />
            </label>
            {agent.enabled ? (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                    Cron (minute hour day-of-month month day-of-week)
                  </span>
                  <input
                    value={agent.cron}
                    onChange={(event) => setAgentSchedule({ cron: event.target.value })}
                    placeholder="0 9 * * *"
                    className="bg-black/30 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-gray-100 font-mono outline-none focus:border-teal-400/50"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                    Timezone (IANA)
                  </span>
                  <input
                    value={agent.timezone}
                    onChange={(event) => setAgentSchedule({ timezone: event.target.value })}
                    placeholder="UTC"
                    className="bg-black/30 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-gray-100 font-mono outline-none focus:border-teal-400/50"
                  />
                </label>
                <p className="text-[11px] text-gray-500 leading-snug">
                  The Runtime's agent daemon runs this brain on the schedule once it's saved as a
                  .brain file in the local registry (see the Runtime /agents API and
                  <code className="text-teal-300/80"> brain agents</code>).
                </p>
              </>
            ) : null}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">
            Configuration
          </div>
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10">
            <span className="text-sm text-gray-300">Fireworks API key</span>
            <span className={`text-[11px] font-semibold ${fireworksKeySet ? 'text-emerald-400' : 'text-gray-400'}`}>
              {fireworksKeySet ? 'Set' : 'Not set'}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10">
            <span className="text-sm text-gray-300">Hugging Face token</span>
            <span className={`text-[11px] font-semibold ${hfTokenSet ? 'text-emerald-400' : 'text-gray-400'}`}>
              {hfTokenSet ? 'Set' : 'Not set'}
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {TOOLS.filter((tool) => tool.needsKey).map((tool) => {
              const envKey = import.meta.env[tool.keyEnvHint] as string | undefined
              const set = Boolean(localStorage.getItem(tool.keyStorageKey) ?? envKey)
              return (
                <div key={tool.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                  <span className="text-sm text-gray-300">{tool.name} API key</span>
                  <span className={`text-[11px] font-semibold ${set ? 'text-emerald-400' : 'text-gray-400'}`}>
                    {set ? 'Set' : 'Not set'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
