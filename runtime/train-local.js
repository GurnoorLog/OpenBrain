'use strict'

// Local fine-tune trainer for the OpenBrain Runtime.
//
// Spawns runtime/train_local.py (the self-adaptive trainer) with the job spec,
// parses its JSON-lines progress stream, and reports it back to the caller.
//
// Honest by construction: this file is invoked only from /local/finetune and
// the brain-core finetune node. If Python or the trainer script are missing on
// the machine running this runtime, the job fails loudly — no silent fake
// training, no placeholder model.

const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const TRAINER_NAME = 'train_local.py'

// Finds train_local.py next to this file, or in the repo's runtime dir.
function resolveTrainer() {
  const candidates = [
    path.join(__dirname, TRAINER_NAME),
    path.join(__dirname, '..', 'runtime', TRAINER_NAME),
    path.join(__dirname, '..', 'cloud-executor', TRAINER_NAME),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

// Returns the python interpreter that can actually run the trainer, or null.
async function resolvePython() {
  const candidates = process.env.OPENBRAIN_PYTHON
    ? [process.env.OPENBRAIN_PYTHON]
    : ['python', 'python3']
  for (const binary of candidates) {
    const ok = await new Promise((resolve) => {
      const child = spawn(binary, ['--version'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      const timer = setTimeout(() => {
        child.kill()
        resolve(false)
      }, 5000)
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve(code === 0)
      })
      child.on('error', () => {
        clearTimeout(timer)
        resolve(false)
      })
    })
    if (ok) return binary
  }
  return null
}

// Runs a local fine-tune job for the given spec.
//
//   options.spec        - FineTuneJobSpec-shaped object (goal/baseModel/dataset/…)
//   options.jobDir      - directory to write adapter + status into
//   options.maxSteps    - optional cap on training steps (demo mode)
//   options.onLog       - ({ level, message }) => void
//   options.onProgress  - (state) => void  (probe/progress payloads)
//
// Resolves with { ok, adapter?, status, error? }. Rejects on hard failures
// (missing python/trainer) with a descriptive Error.
async function runLocalFineTune({ spec, jobDir, maxSteps = 0, onLog = () => {}, onProgress = () => {} }) {
  const trainer = resolveTrainer()
  if (!trainer) {
    throw new Error(
      'No local trainer found (train_local.py). Local fine-tuning needs the OpenBrain repo checkout.',
    )
  }
  const python = await resolvePython()
  if (!python) {
    throw new Error(
      'Python not found on this machine. Local fine-tuning needs Python with torch + peft + transformers installed.',
    )
  }

  const specFile = path.join(jobDir, 'spec.json')
  if (!fs.existsSync(specFile)) {
    fs.mkdirSync(jobDir, { recursive: true })
    fs.writeFileSync(specFile, JSON.stringify(spec, null, 2))
  }

  const args = ['--spec', specFile, '--job-dir', jobDir]
  if (maxSteps > 0) args.push('--max-steps', String(maxSteps))

  onLog({ level: 'info', message: `Launching local trainer (${python} ${TRAINER_NAME})…` })

  return new Promise((resolve, reject) => {
    const child = spawn(python, [trainer, ...args], {
      cwd: path.dirname(trainer),
      windowsHide: true,
      env: { ...process.env },
    })

    let buffer = ''
    let probe = null
    let result = null

    const handleChunk = (chunk) => {
      buffer += chunk
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed === '') continue
        let payload
        try {
          payload = JSON.parse(trimmed)
        } catch {
          onLog({ level: 'info', message: trimmed })
          continue
        }
        if (payload.type === 'probe') {
          probe = payload.system
          onProgress(payload)
          onLog({
            level: 'info',
            message: `Probed machine: CUDA=${payload.system?.cuda}, GPU=${payload.system?.gpu || 'none'}, VRAM=${payload.system?.vram_mb}MB, torch=${payload.system?.torch || 'n/a'}`,
          })
        } else if (payload.type === 'log') {
          onLog({ level: payload.level || 'info', message: payload.message })
        } else if (payload.type === 'progress') {
          onProgress(payload)
        } else if (payload.type === 'result') {
          result = payload
        } else if (payload.type === 'error') {
          onLog({ level: 'error', message: payload.message })
        }
      }
    }

    child.stdout.on('data', handleChunk)
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      // Unsloth/transformers can log to stderr; surface anything not JSON.
      const line = text.trim()
      if (line !== '' && !line.startsWith('{')) {
        onLog({ level: 'info', message: line })
      }
    })

    child.on('error', (error) => {
      reject(new Error(`Failed to start trainer: ${error.message}`))
    })

    child.on('close', (code) => {
      if (result) {
        resolve({ ok: true, adapter: result.adapter, result, status: 'completed' })
        return
      }
      reject(
        new Error(
          `Local trainer exited with code ${code}${probe ? ` (CUDA=${probe.cuda}, GPU=${probe.gpu || 'none'})` : ''}. Check that torch/peft/transformers are installed.`,
        ),
      )
    })
  })
}

module.exports = { runLocalFineTune, resolveTrainer, resolvePython }
