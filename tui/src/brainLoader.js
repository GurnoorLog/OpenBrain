'use strict'

// .brain file loading for the TUI. Mirrors the CLI's validation so a brain
// that fails `brain validate` fails here too.

import fs from 'node:fs'

const MAGIC = 'openbrain/brain'
const VERSION = 1

export function problemsOf(value) {
  const problems = []
  if (typeof value !== 'object' || value === null) return ['not an object']
  if (value.format !== MAGIC) problems.push(`format must be "${MAGIC}"`)
  if (value.version !== VERSION) problems.push(`unsupported version ${value.version}`)
  const nodes = value.graph?.nodes
  if (!Array.isArray(nodes)) {
    problems.push('graph.nodes must be an array')
  } else {
    const ids = new Set(nodes.map((node) => node?.id))
    for (const edge of value.graph?.connections ?? []) {
      if (!ids.has(edge?.from)) problems.push(`edge references unknown source "${edge?.from}"`)
      if (!ids.has(edge?.to)) problems.push(`edge references unknown target "${edge?.to}"`)
    }
  }
  return problems
}

export function loadBrain(filePath) {
  let data
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read ${filePath}: ${error.message}`)
  }
  const problems = problemsOf(data)
  if (problems.length > 0) {
    throw new Error(`${filePath} is not a valid .brain file:\n  - ${problems.join('\n  - ')}`)
  }
  return data
}
