import React from 'react'
import { render } from 'ink'
import fs from 'node:fs'
import path from 'node:path'
import App from './App.jsx'
import { loadBrain } from './brainLoader.js'
import { createRunner, extractOutput } from './runner.js'

// Auto-load repo `.env` so the TUI works out of the box in a checkout. Vite
// prefixes keys with VITE_; map them to the plain names the executor expects.
// Real environment variables always win over the .env file.
function loadDotEnv() {
  let dir = process.cwd()
  for (let depth = 0; depth < 5; depth++) {
    const file = path.join(dir, '.env')
    if (fs.existsSync(file)) {
      for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const trimmed = raw.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq === -1) continue
        const key = trimmed.slice(0, eq).trim()
        const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
        if (key.startsWith('VITE_')) {
          const plain = key.slice('VITE_'.length)
          if (process.env[plain] === undefined) process.env[plain] = value
        } else if (process.env[key] === undefined) {
          process.env[key] = value
        }
      }
      return
    }
    const parent = path.dirname(dir)
    if (parent === dir) return
    dir = parent
  }
}

loadDotEnv()

function usage() {
  console.log(`OpenBrain TUI — run a .brain file as an interactive terminal agent

Usage: openbrain-tui <file.brain> [options]

  --runtime <url>   prefer the OpenBrain Runtime HTTP API (auto-falls back to in-process)
  --local           force in-process execution via brain-core.js
  --knowledge <dir> knowledge base for RAG nodes (default ./knowledge)
  --mcp <path>      mcp.json for tool/github/mcp nodes (default ./mcp.json, then ~/.config/opencode/opencode.json)
  --once <message>  run once headlessly and print the output (no TUI, good for scripts)
  -h, --help        show this help

Environment:
  OPENBRAIN_RUNTIME_URL   default runtime URL (auto-fallback)
  OPENBRAIN_MCP_CONFIG    mcp.json path for tool nodes
  OPENBRAIN_KNOWLEDGE_DIR knowledge base for RAG nodes
  FIREWORKS_API_KEY       LLM nodes (in-process backend)
`)
}

async function main() {
  const argv = process.argv.slice(2)
  const flags = {
    brainPath: null,
    runtimeUrl: undefined,
    forceLocal: false,
    once: null,
    knowledgeDir: undefined,
    mcpConfigPath: undefined,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') {
      usage()
      process.exit(0)
    }
    if (arg === '--local') {
      flags.forceLocal = true
      continue
    }
    if (arg === '--runtime') {
      flags.runtimeUrl = argv[++i] ?? ''
      continue
    }
    if (arg.startsWith('--runtime=')) {
      flags.runtimeUrl = arg.slice('--runtime='.length)
      continue
    }
    if (arg === '--knowledge') {
      flags.knowledgeDir = argv[++i] ?? ''
      continue
    }
    if (arg.startsWith('--knowledge=')) {
      flags.knowledgeDir = arg.slice('--knowledge='.length)
      continue
    }
    if (arg === '--mcp') {
      flags.mcpConfigPath = argv[++i] ?? ''
      continue
    }
    if (arg.startsWith('--mcp=')) {
      flags.mcpConfigPath = arg.slice('--mcp='.length)
      continue
    }
    if (arg === '--once') {
      flags.once = argv[++i] ?? ''
      continue
    }
    if (arg.startsWith('--once=')) {
      flags.once = arg.slice('--once='.length)
      continue
    }
    if (flags.brainPath === null) flags.brainPath = arg
  }

  if (flags.brainPath === null) {
    usage()
    process.exit(1)
  }

  const brain = loadBrain(flags.brainPath)
  const runner = await createRunner({
    brain,
    runtimeUrl: flags.runtimeUrl,
    forceLocal: flags.forceLocal,
    knowledgeDir: flags.knowledgeDir,
    mcpConfigPath: flags.mcpConfigPath,
  })

  if (flags.once !== null) {
    // Defer the actual exit so pending async handles (fetch, AbortController)
    // can close first — avoids a libuv assertion on some platforms.
    const exitAfter = (code) => {
      process.exitCode = code
      setTimeout(() => process.exit(code), 50).unref()
    }
    try {
      const result = await runner.run({ message: flags.once, memory: '' })
      const output = extractOutput(result, brain)
      process.stdout.write(`${output ?? '(no output)'}\n`)
      exitAfter(0)
    } catch (error) {
      process.stderr.write(`✗ ${error.message}\n`)
      exitAfter(1)
    }
    return
  }

  render(React.createElement(App, { brain, runner }))
}

main().catch((error) => {
  console.error(`openbrain-tui: ${error.message}`)
  process.exit(1)
})
