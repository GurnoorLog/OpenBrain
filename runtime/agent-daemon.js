'use strict'

// OpenBrain Agent Daemon — the scheduler that turns .brain files with an
// `agent` block into autonomous scheduled agents.
//
//   - Scans the runtime REGISTRY for .brain files whose `agent.enabled` is true
//   - Re-evaluates every minute (registry rescanned each tick, so saving a .brain
//     with an agent block is picked up without a restart)
//   - Runs each due brain via the shared executeBrain core, with worker nodes
//     resolving saved registry brains and curated skills
//   - Keeps an in-memory run history (last 20 runs) plus an append-only JSONL
//     log under WORKSPACE/.agents/runs.jsonl
//
// Zero runtime dependencies — plain Node 18+ (fs, path, Intl). Cron support is
// a self-contained 5-field matcher (minute hour day-of-month month day-of-week)
// supporting `*`, `*/n`, `a-b`, `a-b/n`, and `x,y,z` lists.

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

// --------------------------------------------------------------------------
// Minimal cron support (5 fields, UTC or per-agent timezone)
// --------------------------------------------------------------------------

function parseCronField(field, min, max) {
  const values = new Set()
  for (const part of String(field).split(',')) {
    if (part === '') continue
    if (part === '*') {
      for (let v = min; v <= max; v += 1) values.add(v)
      continue
    }
    let step = 1
    let range = part
    const slash = part.indexOf('/')
    if (slash !== -1) {
      range = part.slice(0, slash)
      step = Number.parseInt(part.slice(slash + 1), 10) || 1
    }
    let start = min
    let end = max
    if (range !== '*' && range !== '') {
      const dash = range.indexOf('-')
      if (dash !== -1) {
        start = Number.parseInt(range.slice(0, dash), 10)
        end = Number.parseInt(range.slice(dash + 1), 10)
      } else {
        start = end = Number.parseInt(range, 10)
      }
    }
    for (let v = start; v <= end; v += step) values.add(v)
  }
  return values
}

function parseCron(cron) {
  const parts = String(cron || '').trim().split(/\s+/)
  if (parts.length !== 5) {
    throw new Error(
      `Invalid cron "${cron}" — expected 5 fields (minute hour day-of-month month day-of-week).`,
    )
  }
  return {
    minutes: parseCronField(parts[0], 0, 59),
    hours: parseCronField(parts[1], 0, 23),
    days: parseCronField(parts[2], 1, 31),
    months: parseCronField(parts[3], 1, 12),
    weekdays: parseCronField(parts[4], 0, 7),
  }
}

// Resolves a Date into { minute, hour, day, month, weekday } in the given IANA
// timezone via Intl. Falls back to local time when the timezone is invalid.
function zonedFields(date, timeZone) {
  if (!timeZone) timeZone = 'UTC'
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date)
    const pick = (type) => Number(parts.find((part) => part.type === type)?.value || 0)
    const year = pick('year')
    const month = pick('month')
    const day = pick('day')
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    return { minute: pick('minute'), hour: pick('hour'), day, month, weekday }
  } catch {
    return null
  }
}

function cronMatches(cron, date, timeZone) {
  let spec
  try {
    spec = parseCron(cron)
  } catch {
    return false
  }
  const fields =
    zonedFields(date, timeZone) || {
      minute: date.getMinutes(),
      hour: date.getHours(),
      day: date.getDate(),
      month: date.getMonth() + 1,
      weekday: date.getDay(),
    }
  if (!spec.minutes.has(fields.minute)) return false
  if (!spec.hours.has(fields.hour)) return false
  if (!spec.days.has(fields.day)) return false
  if (!spec.months.has(fields.month)) return false
  if (!spec.weekdays.has(fields.weekday) && !spec.weekdays.has(fields.weekday + 7)) return false
  return true
}

// --------------------------------------------------------------------------
// Daemon
// --------------------------------------------------------------------------

function createAgentDaemon(deps) {
  const { registryDir, resolveMcpManager, executeBrain, knowledgeDir, runsFile } = deps
  const agents = new Map()
  const running = new Set()
  let tickTimer = null
  let tickTimeout = null

  async function scanRegistry() {
    const names = await fsp.readdir(registryDir).catch(() => [])
    const seen = new Set()
    for (const name of names) {
      if (!name.endsWith('.brain')) continue
      const raw = await fsp.readFile(path.join(registryDir, name), 'utf8').catch(() => '')
      let file
      try {
        file = JSON.parse(raw)
      } catch {
        continue
      }
      if (!file || file.format !== 'openbrain/brain') continue
      const id = file.id || name
      seen.add(id)
      const existing = agents.get(id)
      const agent = existing || {
        id,
        fileName: name,
        enabled: false,
        cron: '0 9 * * *',
        timezone: 'UTC',
        status: 'idle',
        lastRunAt: null,
        lastStatus: null,
        lastDurationMs: null,
        runs: [],
      }
      agent.file = file
      agent.fileName = name
      agent.name = file.name || name
      agent.enabled = Boolean(file.agent && file.agent.enabled)
      agent.cron = (file.agent && file.agent.schedule && file.agent.schedule.cron) || '0 9 * * *'
      agent.timezone = (file.agent && file.agent.schedule && file.agent.schedule.timezone) || 'UTC'
      agents.set(id, agent)
    }
    for (const id of [...agents.keys()]) {
      if (!seen.has(id)) agents.delete(id)
    }
  }

  // Worker-node resolver: looks up other brains in the registry by id or name.
  // Curated skills are resolved inside brain-core itself.
  async function resolveWorker(brainRef, _options) {
    for (const agent of agents.values()) {
      if (agent.id === brainRef || agent.name === brainRef) {
        const graph = (agent.file && agent.file.graph) || {}
        return {
          name: agent.name,
          nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
          connections: Array.isArray(graph.connections) ? graph.connections : [],
        }
      }
    }
    return null
  }

  function recordRun(agent, run) {
    agent.lastRunAt = new Date().toISOString()
    agent.runs = [run, ...(agent.runs || [])].slice(0, 20)
    if (!runsFile) return
    try {
      fs.appendFileSync(
        runsFile,
        `${JSON.stringify({ id: agent.id, name: agent.name, ...run, ts: agent.lastRunAt })}\n`,
        'utf8',
      )
    } catch {
      // writing run history is best-effort
    }
  }

  async function runAgent(agent) {
    if (running.has(agent.id)) return { skipped: 'already-running' }
    const nodes = agent.file && agent.file.graph && agent.file.graph.nodes
    if (!Array.isArray(nodes) || nodes.length === 0) {
      agent.lastRunAt = new Date().toISOString()
      agent.lastStatus = 'empty'
      recordRun(agent, { runId: `${agent.id.slice(0, 8)}-empty`, status: 'empty', durationMs: 0, logs: [] })
      return { skipped: 'empty' }
    }
    running.add(agent.id)
    agent.status = 'running'
    const startedAt = Date.now()
    const runId = `${agent.id.slice(0, 8)}-${Date.now().toString(36)}`
    const logs = []
    try {
      const mcp = typeof resolveMcpManager === 'function' ? await resolveMcpManager() : null
      const _result = await executeBrain({
        nodes,
        connections: agent.file.graph.connections || [],
        memory: '',
        mcp,
        knowledgeDir,
        resolveWorker,
        onLog: (entry) => logs.push(entry),
        onToken: () => {},
      })
      const durationMs = Date.now() - startedAt
      agent.lastStatus = 'success'
      agent.lastDurationMs = durationMs
      recordRun(agent, { runId, status: 'success', durationMs, logs })
      return { runId, status: 'success', durationMs }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const durationMs = Date.now() - startedAt
      agent.lastStatus = 'error'
      agent.lastDurationMs = durationMs
      recordRun(agent, { runId, status: 'error', error: message, durationMs, logs })
      return { runId, status: 'error', error: message }
    } finally {
      running.delete(agent.id)
      agent.status = 'idle'
    }
  }

  async function tick() {
    await scanRegistry()
    const now = new Date()
    const minuteKey = now.toISOString().slice(0, 16)
    for (const agent of agents.values()) {
      if (!agent.enabled) continue
      if (running.has(agent.id)) continue
      if (!cronMatches(agent.cron, now, agent.timezone)) continue
      if (agent._lastDue === minuteKey) continue
      agent._lastDue = minuteKey
      runAgent(agent).catch(() => {})
    }
  }

  function start() {
    if (tickTimer) return
    scanRegistry().catch(() => {})
    // Align the first tick to the next minute boundary, then fire every minute.
    const untilNextMinute = 60000 - (Date.now() % 60000) + 1000
    tickTimeout = setTimeout(() => {
      tick().catch(() => {})
      tickTimer = setInterval(() => tick().catch(() => {}), 60000)
      if (tickTimer.unref) tickTimer.unref()
    }, untilNextMinute)
    if (tickTimeout.unref) tickTimeout.unref()
  }

  function stop() {
    if (tickTimeout) {
      clearTimeout(tickTimeout)
      tickTimeout = null
    }
    if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
  }

  function agentsSnapshot() {
    return [...agents.values()].map((agent) => ({
      id: agent.id,
      name: agent.name,
      file: agent.fileName,
      enabled: agent.enabled,
      schedule: { cron: agent.cron, timezone: agent.timezone },
      status: agent.status,
      nodeCount: agent.file && agent.file.graph && Array.isArray(agent.file.graph.nodes)
        ? agent.file.graph.nodes.length
        : 0,
      lastRunAt: agent.lastRunAt,
      lastStatus: agent.lastStatus,
      lastDurationMs: agent.lastDurationMs,
      runs: agent.runs || [],
    }))
  }

  function findAgent(brainRef) {
    return [...agents.values()].find(
      (agent) => agent.id === brainRef || agent.name === brainRef,
    )
  }

  async function triggerRun(brainRef) {
    const agent = findAgent(brainRef)
    if (!agent) return { ok: false, error: `Agent "${brainRef}" not found in the registry.` }
    return runAgent(agent)
  }

  return {
    start,
    stop,
    tick,
    agents: agentsSnapshot,
    triggerRun,
    findAgent,
    resolveWorker,
  }
}

module.exports = { createAgentDaemon, cronMatches, parseCron }
