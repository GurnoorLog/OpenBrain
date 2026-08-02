import type { ExecutionContext } from '../execution/ExecutionContext'

// Builds a readable Markdown report of a completed brain run: what each node
// produced, the execution log, and timing. Downloaded by the Output node so a
// run leaves behind a real artifact, not just pixels on a canvas.

function describeValue(value: unknown, depth = 0): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return 'null'
  if (value === undefined) return ''
  if (Array.isArray(value)) {
    const lines = value.slice(0, 12).map((item) => describeValue(item, depth + 1))
    const more = value.length > 12 ? `\n_… and ${value.length - 12} more_` : ''
    return lines.join('\n') + more
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    return entries
      .map(([key, v]) => {
        const sub = describeValue(v, depth + 1)
        return `- **${key}**: ${sub.split('\n').join('\n  ')}`
      })
      .join('\n')
  }
  return String(value)
}

export function buildRunReport(context: ExecutionContext): string {
  const lines: string[] = []
  lines.push(`# ${context.brain.name || 'Brain'} — Execution Report`)
  lines.push('')
  lines.push(`- Run ID: \`${context.runId}\``)
  lines.push(`- Brain ID: \`${context.brainId}\``)
  lines.push(`- Nodes: ${context.brain.nodes.length}`)
  lines.push(`- Edges: ${context.brain.edges.length}`)
  lines.push('')

  lines.push('## Node Outputs')
  lines.push('')
  const outputs = context.outputs
  if (outputs.size === 0) {
    lines.push('_No node outputs were produced._')
  } else {
    for (const node of context.brain.nodes) {
      const nodeOutputs = outputs.get(node.id)
      if (!nodeOutputs) continue
      lines.push(`### ${node.type} — \`${node.id}\``)
      lines.push('')
      const entries = Object.entries(nodeOutputs)
      if (entries.length === 0) {
        lines.push('_No output._')
      } else {
        for (const [key, value] of entries) {
          lines.push(`#### \`${key}\``)
          lines.push('')
          lines.push(describeValue(value))
          lines.push('')
        }
      }
    }
  }

  lines.push('## Execution Log')
  lines.push('')
  lines.push('| Level | Node | Message |')
  lines.push('| --- | --- | --- |')
  for (const entry of context.logs) {
    const level = entry.level ?? 'info'
    const node = entry.nodeId ? `\`${entry.nodeId}\`` : '—'
    const message = entry.message.replace(/\|/g, '\\|').replace(/\n/g, ' ')
    lines.push(`| ${level} | ${node} | ${message} |`)
  }
  lines.push('')

  return lines.join('\n')
}

// Triggers a browser download of the report as a .md file.
export function downloadReport(markdown: string, filename = 'brain-report.md'): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
