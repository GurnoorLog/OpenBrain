import type { CapabilityDef, CapabilityType } from './types'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const rand = (max: number) => Math.floor(Math.random() * max)

let memoryStore: unknown = null

const textOf = (inputs: Record<string, unknown>): string =>
  Object.values(inputs)
    .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
    .join('\n')

export const CAPABILITIES: Record<CapabilityType, CapabilityDef> = {
  llm: {
    type: 'llm',
    label: 'LLM',
    icon: 'lucide:brain-circuit',
    description: 'Reason and generate language',
    accent: '#2dd4bf',
    inputs: [{ id: 'context', label: 'Context', type: 'text' }],
    outputs: [{ id: 'response', label: 'Response', type: 'text' }],
    async execute(ctx) {
      await sleep(900 + rand(600))
      const context = textOf(ctx.inputs)
      ctx.log('LLM reasoning over provided context', 'info')
      return {
        outputs: {
          response: context
            ? `Analysis of: "${context.slice(0, 64)}${context.length > 64 ? '…' : ''}"`
            : 'Draft response generated.',
        },
      }
    },
  },
  memory: {
    type: 'memory',
    label: 'Memory',
    icon: 'lucide:database',
    description: 'Persist conversation context',
    accent: '#a78bfa',
    inputs: [{ id: 'value', label: 'Value', type: 'any' }],
    outputs: [{ id: 'stored', label: 'Stored', type: 'any' }],
    async execute(ctx) {
      await sleep(320 + rand(280))
      const previous = memoryStore
      const value = ctx.inputs['value'] ?? null
      memoryStore = value
      ctx.log('Memory updated with new context', 'info')
      return { outputs: { stored: { previous, current: value } } }
    },
  },
  planner: {
    type: 'planner',
    label: 'Planner',
    icon: 'lucide:list-todo',
    description: 'Break goals into steps',
    accent: '#fbbf24',
    inputs: [{ id: 'goal', label: 'Goal', type: 'text' }],
    outputs: [{ id: 'plan', label: 'Plan', type: 'list' }],
    async execute(ctx) {
      await sleep(500 + rand(300))
      const goal = (ctx.inputs['goal'] as string | undefined) ?? 'the task'
      ctx.log(`Planner decomposed: ${goal.slice(0, 48)}`, 'info')
      return {
        outputs: {
          plan: ['Gather information', 'Analyze inputs', 'Synthesize result', 'Deliver output'],
        },
      }
    },
  },
  browser: {
    type: 'browser',
    label: 'Browser',
    icon: 'lucide:globe',
    description: 'Fetch live web pages',
    accent: '#60a5fa',
    inputs: [],
    outputs: [{ id: 'pages', label: 'Pages', type: 'list' }],
    async execute() {
      await sleep(600 + rand(400))
      return {
        outputs: {
          pages: ['https://example.com', 'https://developer.mozilla.org'],
        },
      }
    },
  },
  github: {
    type: 'github',
    label: 'GitHub',
    icon: 'lucide:github',
    description: 'Read repositories and issues',
    accent: '#94a3b8',
    inputs: [],
    outputs: [{ id: 'repos', label: 'Repos', type: 'list' }],
    async execute() {
      await sleep(600 + rand(400))
      return {
        outputs: {
          repos: ['acme/api-service', 'acme/web-app', 'acme/infra'],
        },
      }
    },
  },
  filesystem: {
    type: 'filesystem',
    label: 'Filesystem',
    icon: 'lucide:folder',
    description: 'Read and write local files',
    accent: '#f472b6',
    inputs: [{ id: 'path', label: 'Path', type: 'text' }],
    outputs: [{ id: 'content', label: 'Content', type: 'text' }],
    async execute() {
      await sleep(400 + rand(300))
      return {
        outputs: {
          content: '# README\n\nProject scaffold initialized.\n\n- 12 source files\n- 4 modules\n',
        },
      }
    },
  },
  python: {
    type: 'python',
    label: 'Python',
    icon: 'lucide:terminal',
    description: 'Run Python scripts',
    accent: '#4ade80',
    inputs: [{ id: 'code', label: 'Code', type: 'text' }],
    outputs: [{ id: 'result', label: 'Result', type: 'text' }],
    async execute(ctx) {
      await sleep(500 + rand(400))
      ctx.log('Python executed script', 'info')
      const source = (ctx.inputs['code'] as string | undefined) ?? 'print("ok")'
      return { outputs: { result: `Executed ${source.length} chars → "ok"` } }
    },
  },
  rag: {
    type: 'rag',
    label: 'RAG',
    icon: 'lucide:search',
    description: 'Retrieve from knowledge base',
    accent: '#38bdf8',
    inputs: [{ id: 'query', label: 'Query', type: 'text' }],
    outputs: [{ id: 'documents', label: 'Documents', type: 'list' }],
    async execute(ctx) {
      await sleep(550 + rand(350))
      const query = (ctx.inputs['query'] as string | undefined) ?? 'context'
      ctx.log(`RAG retrieved documents for "${query.slice(0, 40)}"`, 'info')
      return {
        outputs: {
          documents: [
            `knowledge#1 — ${query} basics`,
            `knowledge#2 — ${query} advanced`,
            `knowledge#3 — ${query} patterns`,
          ],
        },
      }
    },
  },
  finetune: {
    type: 'finetune',
    label: 'Fine-tune',
    icon: 'lucide:graduation-cap',
    description: 'Train a model on a dataset',
    accent: '#fb7185',
    inputs: [
      { id: 'dataset', label: 'Dataset', type: 'text' },
      { id: 'baseModel', label: 'Base model', type: 'text' },
    ],
    outputs: [{ id: 'model', label: 'Trained model', type: 'text' }],
    async execute(ctx) {
      await sleep(800 + rand(500))
      const dataset = (ctx.inputs['dataset'] as string | undefined) ?? 'unknown dataset'
      const baseModel = (ctx.inputs['baseModel'] as string | undefined) ?? 'unknown base model'
      ctx.log(`Fine-tune planned on ${baseModel} using ${dataset}`, 'info')
      return {
        outputs: {
          model: `hf://fine-tune-${String(baseModel).replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)}`,
        },
      }
    },
  },
  news: {
    type: 'news',
    label: 'News',
    icon: 'lucide:newspaper',
    description: 'Fetch live news articles',
    accent: '#fbbf24',
    inputs: [{ id: 'query', label: 'Query', type: 'text' }],
    outputs: [
      { id: 'articles', label: 'Articles', type: 'list' },
      { id: 'headline', label: 'Headline', type: 'text' },
    ],
    async execute(ctx) {
      const query = (ctx.inputs['query'] as string | undefined) ?? 'technology'
      ctx.log(`News fetch for "${query.slice(0, 40)}"`, 'info')
      return { outputs: { articles: [], headline: `No news for "${query}"` } }
    },
  },
  imagegen: {
    type: 'imagegen',
    label: 'ImageGen',
    icon: 'lucide:image-plus',
    description: 'Generate an image from a prompt',
    accent: '#fb7185',
    inputs: [{ id: 'prompt', label: 'Prompt', type: 'text' }],
    outputs: [{ id: 'imageUrl', label: 'Image URL', type: 'text' }],
    async execute(ctx) {
      const prompt = (ctx.inputs['prompt'] as string | undefined) ?? 'a glowing AI brain'
      ctx.log(`ImageGen for "${prompt.slice(0, 40)}"`, 'info')
      return { outputs: { imageUrl: '', prompt } }
    },
  },
  output: {
    type: 'output',
    label: 'Output',
    icon: 'lucide:square-arrow-out-up-right',
    description: 'Deliver the final result',
    accent: '#34d399',
    inputs: [{ id: 'result', label: 'Result', type: 'any' }],
    outputs: [],
    async execute(ctx) {
      await sleep(300 + rand(200))
      const value = ctx.inputs['result']
      const summary = typeof value === 'string' ? value : JSON.stringify(value) ?? '—'
      ctx.log(`Output delivered: ${summary.slice(0, 80)}`, 'success')
      return { outputs: {} }
    },
  },
}

export const CAPABILITY_LIST: CapabilityDef[] = Object.values(CAPABILITIES)

export function getCapability(type: CapabilityType): CapabilityDef {
  return CAPABILITIES[type]
}
