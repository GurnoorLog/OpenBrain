'use strict'

// Render Workflow entry (render.yaml `workflow` block). This is the scheduled
// counterpart to the on-demand /run endpoint: every cron tick it loads a saved
// brain from Supabase (via service-role key — bypasses RLS, server-side only)
// and executes it, printing the run log. Hook it to anything you want running
// on a schedule (daily digest, morning briefing, weekly research pass).
//
// Env: BRAIN_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FIREWORKS_API_KEY.
// Optional: CLOUD_LLM_MODEL.

const { executeBrain } = require('./brain-core')

async function loadBrain() {
  const brainId = process.env.BRAIN_ID
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!brainId) throw new Error('BRAIN_ID is not set.')
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.')

  const response = await fetch(
    `${url.replace(/\/$/, '')}/rest/v1/projects?id=eq.${encodeURIComponent(brainId)}&select=name,data`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    },
  )
  if (!response.ok) {
    throw new Error(`Supabase fetch failed (${response.status}): ${(await response.text()).slice(0, 300)}`)
  }
  const rows = await response.json()
  const row = Array.isArray(rows) ? rows[0] : null
  const brain = row?.data?.brain
  if (!row || !brain || !Array.isArray(brain.nodes)) {
    throw new Error(`No brain found for BRAIN_ID="${brainId}".`)
  }
  return { name: row.name ?? brainId, nodes: brain.nodes, connections: brain.connections ?? [] }
}

async function main() {
  console.log(`[workflow] started at ${new Date().toISOString()}`)
  const { name, nodes, connections } = await loadBrain()
  console.log(`[workflow] loaded brain "${name}" (${nodes.length} nodes)`)

  const result = await executeBrain({ nodes, connections, memory: '' })
  console.log(`[workflow] completed in ${result.durationMs}ms`)

  for (const entry of result.log) {
    const level = entry.level ?? 'info'
    console.log(`[${level.toUpperCase()}] ${entry.message}`)
  }

  const outputNodes = Object.entries(result.outputs).filter(
    ([, outputs]) => typeof outputs?.result === 'string' || typeof outputs?.response === 'string',
  )
  for (const [nodeId, outputs] of outputNodes) {
    const text = typeof outputs.result === 'string' ? outputs.result : outputs.response
    console.log(`[workflow] node ${nodeId}: ${text.slice(0, 300)}`)
  }
  console.log(`[workflow] done at ${new Date().toISOString()}`)
}

main().catch((error) => {
  console.error(`[workflow] FAILED: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
