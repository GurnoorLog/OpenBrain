import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import TextInput from 'ink-text-input'
import Spinner from 'ink-spinner'
import { loadBrain } from './brainLoader.js'
import { extractOutput } from './runner.js'

const ACCENT = '#8b5cf6'

// Per-node-type presentation for the live activity feed.
const NODE_STYLE = {
  browser: { label: 'browser', color: 'cyan' },
  rag: { label: 'rag', color: 'magenta' },
  llm: { label: 'llm', color: 'blue' },
  memory: { label: 'memory', color: 'green' },
  output: { label: 'output', color: 'yellow' },
  github: { label: 'github', color: 'green' },
  tool: { label: 'tool', color: 'yellow' },
  mcp: { label: 'mcp', color: 'yellow' },
  filesystem: { label: 'filesystem', color: 'gray' },
  python: { label: 'python', color: 'cyan' },
  planner: { label: 'planner', color: 'blue' },
  gate: { label: 'gate', color: 'gray' },
}

function nodeStyle(type) {
  return NODE_STYLE[type] || { label: type, color: 'white' }
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function wrapLines(text, width) {
  const out = []
  for (const para of String(text ?? '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    let line = ''
    for (const word of words) {
      if (line.length + word.length + 1 > width) {
        out.push(line)
        line = word
      } else {
        line = line ? `${line} ${word}` : word
      }
    }
    if (line) out.push(line)
  }
  if (out.length === 0) out.push('')
  return out
}

function toRows(messages, width, streamText) {
  const rows = []
  const inner = Math.max(10, width - 4)
  const pushAssistant = (text) => {
    rows.push({ text: '  ┌ assistant', color: 'white', bold: true })
    for (const line of wrapLines(text, inner)) rows.push({ text: `  │ ${line}`, color: 'white' })
    rows.push({ text: '  └', color: 'white', dim: true })
  }
  for (const msg of messages) {
    if (msg.kind === 'system') {
      for (const line of wrapLines(msg.text, inner)) {
        rows.push({ text: `  ${line}`, color: 'gray', dim: true })
      }
    } else if (msg.kind === 'log') {
      const icon = msg.level === 'success' ? '✓' : msg.level === 'error' ? '✗' : msg.level === 'warning' ? '!' : '·'
      const color = msg.level === 'error' ? 'red' : msg.level === 'success' ? 'green' : msg.level === 'warning' ? 'yellow' : 'gray'
      for (const line of wrapLines(msg.text ?? msg.message, inner)) {
        rows.push({ text: `  ${icon} ${line}`, color })
      }
    } else if (msg.kind === 'user') {
      rows.push({ text: '  ┌ you', color: 'cyan', bold: true })
      for (const line of wrapLines(msg.text, inner)) rows.push({ text: `  │ ${line}`, color: 'cyan' })
      rows.push({ text: '  └', color: 'cyan', dim: true })
    } else {
      pushAssistant(msg.text)
    }
  }
  if (streamText) {
    rows.push({ text: '  ┌ assistant', color: 'white', bold: true })
    for (const line of wrapLines(streamText, inner)) rows.push({ text: `  │ ${line}`, color: 'white' })
    rows.push({ text: '  └ ▌', color: 'white', dim: false })
  }
  return rows
}

// Live activity feed: one animated line per node currently running (spinner +
// live detail), plus a compact list of the finished steps from this run.
function ActivityPanel({ steps, width }) {
  if (steps.length === 0) return null
  const inner = Math.max(10, width - 6)
  const active = steps.filter((step) => step.state === 'running')
  const finished = steps.filter((step) => step.state !== 'running').slice(-3)
  return (
    <Box flexDirection="column" marginBottom={1}>
      {active.map((step) => {
        const style = nodeStyle(step.nodeType)
        return (
          <Text key={step.key} color={style.color}>
            <Text color="magenta"><Spinner type="dots" /> </Text>
            <Text bold>{style.label}</Text>
            {'  '}
            {step.detail}
          </Text>
        )
      })}
      {finished.map((step) => {
        const style = nodeStyle(step.nodeType)
        const mark = step.state === 'error' ? '✗' : '✓'
        return (
          <Text key={step.key} color={style.color} dim>
            {mark} {style.label}  {step.detail}
          </Text>
        )
      })}
    </Box>
  )
}

export default function App({ brain: initialBrain, runner }) {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [brain, setBrain] = useState(initialBrain)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [memory, setMemory] = useState('')
  const [steps, setSteps] = useState([])
  const runningRef = useRef(false)
  const scrollRef = useRef(0)

  const width = stdout?.columns ?? 80
  const height = stdout?.rows ?? 24
  const viewHeight = Math.max(5, height - 5)

  const append = (msg) => setMessages((prev) => [...prev, msg])

  useEffect(() => {
    append({ kind: 'system', text: `Brain "${brain.name}" loaded — ${brain.graph.nodes.length} nodes, ${(brain.graph.connections || []).length} connections.` })
    if (brain.goal) append({ kind: 'system', text: `Goal: ${brain.goal}` })
    append({
      kind: 'system',
      text:
        runner.backend === 'runtime'
          ? `Backend: OpenBrain Runtime → ${runner.runtimeUrl}. Type a message, or /help.`
          : 'Backend: in-process (brain-core.js). Type a message, or /help.',
    })
  }, [])

  // Applies a structured event to the live activity feed.
  const applyEvent = (event) => {
    if (!event || !event.kind) return
    setSteps((prev) => {
      const next = [...prev]
      const idx = next.findIndex((step) => step.key === event.nodeId)
      const upsert = (patch) => {
        if (idx !== -1) next[idx] = { ...next[idx], ...patch }
        else next.push({ key: event.nodeId, nodeType: 'node', state: 'running', detail: '', ...patch })
      }
      switch (event.kind) {
        case 'node-start':
          upsert({ nodeType: event.nodeType, state: 'running', detail: 'starting…' })
          break
        case 'browser-fetch':
          upsert({ nodeType: 'browser', state: 'running', detail: `fetching ${event.url}` })
          break
        case 'browser-progress':
          upsert({ nodeType: 'browser', state: 'running', detail: `downloading ${formatBytes(event.bytes)} from ${hostOf(event.url)}` })
          break
        case 'browser-done':
          upsert({ nodeType: 'browser', state: 'done', detail: `fetched ${event.chars.toLocaleString()} chars from ${hostOf(event.url)}` })
          break
        case 'browser-error':
          upsert({ nodeType: 'browser', state: 'error', detail: `failed: ${event.error}` })
          break
        case 'rag-scan':
          upsert({ nodeType: 'rag', state: 'running', detail: `scanning knowledge base for "${event.query}"` })
          break
        case 'rag-progress':
          upsert({ nodeType: 'rag', state: 'running', detail: `scanned ${event.scanned}/${event.total} files` })
          break
        case 'rag-done':
          upsert({ nodeType: 'rag', state: 'done', detail: `retrieved ${event.count} document(s)` })
          break
        case 'node-done':
          if (idx === -1) break
          next[idx] = { ...next[idx], state: 'done', detail: next[idx].detail || 'done' }
          break
      }
      return next
    })
  }

  const runMessage = async (text) => {
    if (runningRef.current) return
    runningRef.current = true
    setRunning(true)
    setStreamText('')
    setSteps([])
    scrollRef.current = 0
    append({ kind: 'user', text })
    try {
      const result = await runner.run({
        message: text,
        memory,
        onLog: (entry) => append({ kind: 'log', level: entry.level, text: entry.message }),
        onToken: (token) => setStreamText((prev) => prev + token),
        onEvent: applyEvent,
      })
      if (runner.backend === 'runtime' && Array.isArray(result.log)) {
        for (const entry of result.log) append({ kind: 'log', level: entry.level, text: entry.message })
      }
      const output = extractOutput(result, brain)
      if (output) {
        append({ kind: 'assistant', text: output })
        setMemory((prev) => `${prev ? `${prev}\n` : ''}user: ${text}\nassistant: ${output}`.slice(-12000))
      } else {
        append({ kind: 'system', text: '(run finished with no output)' })
      }
    } catch (error) {
      append({ kind: 'log', level: 'error', text: error.message })
    } finally {
      setStreamText('')
      runningRef.current = false
      setRunning(false)
    }
  }

  const handleCommand = (raw) => {
    const [cmd, ...rest] = raw.trim().slice(1).split(/\s+/)
    switch (cmd) {
      case 'help':
        append({ kind: 'system', text: 'Commands: /help · /graph · /memory · /clear · /clear-memory · /backend · /mcp · /agents · /agent run <name|id> · /open <file> · /exit' })
        break
      case 'graph':
        append({ kind: 'system', text: `Nodes (${brain.graph.nodes.length}):` })
        for (const node of brain.graph.nodes) append({ kind: 'system', text: `  [${node.type}] ${node.id}` })
        append({ kind: 'system', text: `Connections (${(brain.graph.connections || []).length}):` })
        for (const edge of brain.graph.connections || []) {
          append({ kind: 'system', text: `  ${edge.from}.${edge.fromPort} → ${edge.to}.${edge.toPort}` })
        }
        break
      case 'memory':
        append({ kind: 'system', text: memory ? memory : '(empty)' })
        break
      case 'clear-memory':
        setMemory('')
        append({ kind: 'system', text: 'Memory cleared.' })
        break
      case 'clear':
        setMessages([])
        break
      case 'backend':
        append({
          kind: 'system',
          text: runner.backend === 'runtime' ? `Runtime → ${runner.runtimeUrl}` : 'in-process (brain-core.js)',
        })
        break
      case 'mcp':
        append({ kind: 'system', text: `MCP config: ${runner.mcpFile || '(none found)'}` })
        runner
          .listMcp()
          .then(({ servers, tools }) => {
            if (!servers || servers.length === 0) {
              append({ kind: 'system', text: 'No MCP servers configured. Add an mcp.json next to the brain.' })
              return
            }
            append({ kind: 'system', text: `Servers (${servers.length}):` })
            for (const name of servers) {
              const list = (tools && tools[name]) || []
              append({
                kind: 'system',
                text: `  ${name}${list.length > 0 ? ` — ${list.slice(0, 6).join(', ')}${list.length > 6 ? ', …' : ''}` : ' (unreachable or no tools)'}`,
              })
            }
          })
          .catch((error) => append({ kind: 'log', level: 'error', text: error.message }))
        break
      case 'agents': {
        append({ kind: 'system', text: 'Listing scheduled agents…' })
        runner
          .agents()
          .then((agents) => {
            if (!agents || agents.length === 0) {
              append({ kind: 'system', text: 'No agents found. Enable the "agent" block on a .brain and save it to the registry.' })
              return
            }
            append({ kind: 'system', text: `Agents (${agents.length}):` })
            for (const agent of agents) {
              const status = agent.status === 'running' ? 'RUNNING' : agent.enabled ? 'scheduled' : 'disabled'
              const cron = agent.schedule?.cron || '0 9 * * *'
              const last = agent.lastStatus
                ? ` · last ${agent.lastStatus}${agent.lastDurationMs != null ? ` in ${(agent.lastDurationMs / 1000).toFixed(1)}s` : ''}`
                : ''
              append({ kind: 'system', text: `  [${status}] ${agent.name} — "${cron}" (${agent.timezone || agent.schedule?.timezone || 'UTC'})${last}` })
            }
          })
          .catch((error) => append({ kind: 'log', level: 'error', text: error.message }))
        break
      }
      case 'agent': {
        const sub = rest[0]
        const ref = rest.slice(1).join(' ')
        if (sub === 'run' && ref) {
          append({ kind: 'system', text: `Triggering agent "${ref}"…` })
          runner
            .runAgent(ref)
            .then((result) => {
              if (result.status === 'success') {
                append({ kind: 'system', text: `Agent run finished in ${(result.durationMs / 1000).toFixed(1)}s.` })
              } else if (result.error) {
                append({ kind: 'log', level: 'error', text: result.error })
              } else if (result.skipped) {
                append({ kind: 'system', text: `Skipped: ${result.skipped}` })
              }
            })
            .catch((error) => append({ kind: 'log', level: 'error', text: error.message }))
        } else {
          append({ kind: 'system', text: 'Usage: /agent run <name|id>  (needs the Runtime backend)' })
        }
        break
      }
      case 'open': {
        const file = rest.join(' ')
        if (!file) {
          append({ kind: 'system', text: 'Usage: /open <file.brain>' })
          break
        }
        try {
          const next = loadBrain(file)
          setBrain(next)
          setMessages([])
          setMemory('')
          append({ kind: 'system', text: `Brain "${next.name}" loaded — ${next.graph.nodes.length} nodes.` })
        } catch (error) {
          append({ kind: 'log', level: 'error', text: error.message })
        }
        break
      }
      case 'exit':
      case 'quit':
        exit()
        break
      default:
        append({ kind: 'system', text: `Unknown command /${cmd}. Try /help.` })
    }
  }

  const onSubmit = (value) => {
    const text = value.trim()
    setInput('')
    if (!text || runningRef.current) return
    if (text.startsWith('/')) {
      handleCommand(text)
      return
    }
    runMessage(text)
  }

  useInput((_input, key) => {
    if (key.pageUp) {
      scrollRef.current += 5
    }
    if (key.pageDown) {
      scrollRef.current = Math.max(0, scrollRef.current - 5)
    }
  })

  // Auto-follow: whenever new content arrives (a message, or streamed tokens),
  // snap the viewport back to the latest line so the user never has to scroll.
  useEffect(() => {
    scrollRef.current = 0
  }, [messages, streamText])

  const rows = useMemo(() => toRows(messages, width, streamText), [messages, streamText, width])
  const total = rows.length
  const clamped = Math.min(scrollRef.current, Math.max(0, total - viewHeight))
  const start = Math.max(0, total - viewHeight - clamped)
  const visible = rows.slice(start, start + viewHeight)

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box borderStyle="round" borderColor={ACCENT} paddingX={1} marginBottom={1}>
        <Text color={ACCENT} bold>openbrain</Text>
        <Text> · {brain.name}</Text>
        <Text color="gray"> · {brain.graph.nodes.length} nodes · {runner.backend === 'runtime' ? 'runtime' : 'in-process'}</Text>
      </Box>

      <Box height={viewHeight} flexDirection="column" overflowY="hidden">
        {visible.map((row, index) => (
          <Text key={index} color={row.color} bold={row.bold} dimColor={row.dim}>{row.text}</Text>
        ))}
        {running && !streamText && steps.filter((s) => s.state === 'running').length === 0 ? (
          <Text color="magenta">
            <Spinner type="dots" /> running…
          </Text>
        ) : null}
      </Box>

      <ActivityPanel steps={steps} width={width} />

      <Box marginTop={1}>
        <Text color={ACCENT} bold>&gt; </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={onSubmit}
          disabled={running}
          placeholder={running ? 'running… (Ctrl+C to quit)' : 'ask the brain, or /help'}
        />
      </Box>

      <Box marginTop={1}>
        <Text color="gray" dim>/help · /graph · /clear · /memory · /agents · /exit · PgUp/PgDn scroll · Ctrl+C quit</Text>
      </Box>
    </Box>
  )
}
