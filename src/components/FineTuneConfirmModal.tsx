import { useEffect, useMemo, useState } from 'react'
import { confirmAndLaunch, confirmAndLaunchLocal } from './canvas/finetuneAdapter'
import { deriveSpecForTrainingType } from '../core/finetune'
import { useBrainStore } from '../store/useBrainStore'
import type { FineTuneTrainingType } from '../core/finetune'

// Confirmation screen for a pending fine-tune job. Renders every detail the
// user must review before anything is submitted (base model, dataset, method,
// training type, hyperparameters, estimated cost/duration, target repo).
//
// The modal is DUAL: the same plan can be run either on Fireworks' cloud GPUs
// ("Confirm & Launch" -> confirmAndLaunch, the cloud path) or ON THIS MACHINE
// via the local Runtime's /local/finetune ("Train on this machine" ->
// confirmAndLaunchLocal, the local path — zero cloud cost, the trainer probes
// the host GPU/VRAM and adapts). These are the ONLY two code paths that
// trigger a real job; no timer or other button may submit.
export default function FineTuneConfirmModal() {
  const spec = useBrainStore((state) => state.pendingFineTune)
  const setPendingFineTune = useBrainStore((state) => state.setPendingFineTune)
  const [trainingType, setTrainingType] = useState<FineTuneTrainingType>(spec?.trainingType ?? 'sft')
  const [target, setTarget] = useState<'cloud' | 'local'>('cloud')

  useEffect(() => {
    if (spec) setTrainingType(spec.trainingType)
  }, [spec])

  const resolved = useMemo(
    () => (spec ? deriveSpecForTrainingType(spec, trainingType) : null),
    [spec, trainingType],
  )

  if (!resolved) return null

  const isCloud = target === 'cloud'

  const onCancel = () => {
    setPendingFineTune(null)
    useBrainStore.getState().addLog('Fine-tune job cancelled — nothing was submitted.', 'warning')
  }

  const onConfirm = () => {
    const specToRun = resolved
    setPendingFineTune(null)
    if (isCloud) {
      confirmAndLaunch(specToRun)
    } else {
      confirmAndLaunchLocal(specToRun)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel}></div>
      <div className="relative glass-panel w-[30rem] max-w-[92vw] p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-white font-bold tracking-tight text-lg">Confirm fine-tune job</h2>
          <button className="toolbar-btn w-8 h-8 text-gray-400 hover:text-white" onClick={onCancel} aria-label="Cancel">
            <iconify-icon icon="lucide:x"></iconify-icon>
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mb-4">
          Review the plan, then choose where to train. Cloud launches a real Fireworks job and may incur GPU costs;
          local trains on this machine (free, no GPU credits) using the runtime trainer.
        </p>

        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10 mb-4">
          <span className="text-[11px] uppercase tracking-wider text-gray-500 font-bold shrink-0">Train on</span>
          <div className="flex gap-1" role="radiogroup" aria-label="Training target">
            {(
              [
                { key: 'cloud', label: 'Fireworks (cloud)' },
                { key: 'local', label: 'This machine' },
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                role="radio"
                aria-checked={target === option.key}
                className={`toolbar-btn px-2.5 py-1 text-[11px] font-semibold ${target === option.key ? 'bg-teal-500/20 text-teal-300' : 'text-gray-400'}`}
                onClick={() => setTarget(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 mb-4">
          {isCloud && (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10">
              <span className="text-[11px] uppercase tracking-wider text-gray-500 font-bold shrink-0">Training type</span>
              <div className="flex gap-1" role="radiogroup" aria-label="Training type">
                {(['sft', 'rft'] as const).map((option) => (
                  <button
                    key={option}
                    role="radio"
                    aria-checked={trainingType === option}
                    className={`toolbar-btn px-2.5 py-1 text-[11px] font-semibold ${trainingType === option ? 'bg-teal-500/20 text-teal-300' : 'text-gray-400'}`}
                    onClick={() => setTrainingType(option)}
                  >
                    {option.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}
          <DetailRow label="Goal" value={resolved.goal} />
          <DetailRow
            label="Base model"
            value={isCloud ? resolved.baseModel : resolved.baseModel ? resolved.baseModel : 'auto (probed at runtime)'}
          />
          <DetailRow label="Dataset" value={resolved.dataset} />
          <DetailRow label="Method" value={isCloud ? resolved.method.toUpperCase() : 'LORA (auto QLoRA if <8GB VRAM)'} />
          <DetailRow
            label="Hyperparameters"
            value={`epochs ${resolved.hyperparameters.epochs} · lr ${resolved.hyperparameters.learningRate} · rank ${resolved.hyperparameters.rank} · batch ${resolved.hyperparameters.batchSize}`}
          />
          {isCloud ? (
            <DetailRow
              label="Estimated cost"
              value={`~$${resolved.estimatedCost.estimatedUsd} · ~${resolved.estimatedCost.gpuHours}h on ${resolved.estimatedCost.gpuType}`}
            />
          ) : (
            <DetailRow label="Estimated cost" value="Free · runs on your GPU (probed live)" />
          )}
          <DetailRow
            label="Target repo"
            value={isCloud ? resolved.targetRepoName : `workspace/finetunes/<job-id>/adapter`}
          />
        </div>

        {resolved.warnings.length > 0 && (
          <div className="mb-4 flex flex-col gap-1">
            {resolved.warnings.map((warning) => (
              <div key={warning} className="text-[11px] text-amber-400/90 flex items-start gap-1.5">
                <iconify-icon icon="lucide:triangle-alert" className="mt-0.5 shrink-0"></iconify-icon>
                <span>{warning}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            className="toolbar-btn px-4 py-2 text-gray-300 hover:text-white"
            onClick={onCancel}
            aria-label="Cancel fine-tune job"
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-semibold text-sm transition-colors"
            onClick={onConfirm}
            aria-label={isCloud ? 'Confirm and launch fine-tune job' : 'Train fine-tune on this machine'}
          >
            {isCloud ? 'Confirm & Launch' : 'Train on this machine'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
      <span className="text-[11px] uppercase tracking-wider text-gray-500 font-bold shrink-0">{label}</span>
      <span className="text-xs text-gray-200 text-right break-all">{value}</span>
    </div>
  )
}
