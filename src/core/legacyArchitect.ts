import type { BrainSpec, BrainNodeSpec, CapabilityType, Connection } from './types'
import { CAPABILITIES } from './registry'

export const NODE_WIDTH = 220
export const NODE_HEADER = 56
export const PORT_GAP = 24
const COLUMN_GAP = 160

let idCounter = 0
export function generateId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

interface Rule {
  keywords: string[]
  type: CapabilityType
}

const RULES: Rule[] = [
  {
    keywords: ['browser', 'web', 'internet', 'browse', 'website', 'online', 'scrape'],
    type: 'browser',
  },
  { keywords: ['github', 'repository', 'repositories', 'pull request', 'issue'], type: 'github' },
  {
    keywords: ['file', 'files', 'filesystem', 'folder', 'document', 'read'],
    type: 'filesystem',
  },
  { keywords: ['python', 'script', 'code', 'program', 'automate'], type: 'python' },
  {
    keywords: ['memory', 'remember', 'recall', 'context', 'conversation', 'long-term'],
    type: 'memory',
  },
  {
    keywords: ['rag', 'retrieval', 'knowledge', 'embedding', 'vector', 'semantic search'],
    type: 'rag',
  },
  {
    keywords: ['plan', 'planner', 'planning', 'decompose', 'schedule', 'steps', 'workflow'],
    type: 'planner',
  },
  { keywords: ['output', 'report', 'answer', 'respond', 'summarize', 'result'], type: 'output' },
]

function keywordMatches(text: string, keyword: string): boolean {
  if (keyword.includes(' ')) return text.includes(keyword)
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}`, 'i').test(text)
}

const SOURCE_ORDER: CapabilityType[] = ['browser', 'github', 'filesystem', 'python']
const PIPELINE_ORDER: CapabilityType[] = ['rag', 'planner']

export function generateBrain(
  prompt: string,
  viewport: { width: number; height: number },
): BrainSpec {
  const text = prompt.toLowerCase()
  const matched = new Set<CapabilityType>()

  for (const rule of RULES) {
    if (rule.keywords.some((keyword) => keywordMatches(text, keyword))) {
      matched.add(rule.type)
    }
  }

  const order: CapabilityType[] = []
  for (const type of SOURCE_ORDER) if (matched.has(type)) order.push(type)
  for (const type of PIPELINE_ORDER) if (matched.has(type)) order.push(type)
  if (!order.includes('llm')) order.push('llm')
  // ponytail: even a prompt that matches no rule gets a usable graph, not a
  // bare llm -> output. Memory + planner are safe, generic middle layers.
  if (matched.has('memory') && !order.includes('memory')) order.push('memory')
  else if (order.length > 1) order.push('memory')
  if (!order.includes('planner')) order.push('planner')
  if (!order.includes('output')) order.push('output')

  const startX = 64
  const baseY = Math.max(140, viewport.height / 2 - 40)

  const nodes: BrainNodeSpec[] = order.map((type, index) => ({
    id: generateId(type),
    type,
    x: startX + index * (NODE_WIDTH + COLUMN_GAP),
    y: baseY,
  }))

  const connections: Connection[] = []
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const from = nodes[i]
    const to = nodes[i + 1]
    const fromPort = CAPABILITIES[from.type].outputs[0]?.id
    const toPort = CAPABILITIES[to.type].inputs[0]?.id
    if (fromPort && toPort) {
      connections.push({
        id: generateId('conn'),
        from: from.id,
        fromPort,
        to: to.id,
        toPort,
      })
    }
  }

  return { nodes, connections }
}
