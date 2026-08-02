import type { NodeType } from '../domain'
import type { NodeInputs, NodeOutputs } from '../execution'
import type { ExecutionContext } from '../execution'

// The architect never sees or passes API keys. Each keyed tool declares how
// to obtain its key and which localStorage slot the executor reads at runtime.
export interface ToolDefinition {
  readonly id: string
  readonly nodeType: NodeType
  readonly name: string
  readonly description: string
  readonly icon: string
  readonly accent: string
  readonly needsKey: boolean
  readonly keyStorageKey: string
  readonly keyEnvHint: string
  readonly keyInstructions: string[]
  readonly inputs: readonly { readonly id: string; readonly label: string; readonly kind: string }[]
  readonly outputs: readonly { readonly id: string; readonly label: string; readonly kind: string }[]
  execute(inputs: NodeInputs, context: ExecutionContext, apiKey: string | null): Promise<NodeOutputs>
}

const KEY_PREFIX = 'openbrain:tool-key:'

export function getToolKey(toolId: string): string | null {
  try {
    return localStorage.getItem(`${KEY_PREFIX}${toolId}`)
  } catch {
    return null
  }
}

export function setToolKey(toolId: string, value: string): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}${toolId}`, value)
  } catch {
    /* ignore */
  }
}

export function clearToolKey(toolId: string): void {
  try {
    localStorage.removeItem(`${KEY_PREFIX}${toolId}`)
  } catch {
    /* ignore */
  }
}

export function hasToolKey(toolId: string): boolean {
  return Boolean(getToolKey(toolId))
}

function firstText(inputs: NodeInputs, key: string, fallback: string): string {
  const value = inputs[key]
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  return fallback
}

function asUrl(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  return fallback
}

async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`Request failed with HTTP ${response.status}`)
  }
  return response.text()
}

export const NEWS_TOOL: ToolDefinition = {
  id: 'news',
  nodeType: 'news',
  name: 'News',
  description: 'Fetch live news articles for a topic',
  icon: 'lucide:newspaper',
  accent: '#fbbf24',
  needsKey: true,
  keyStorageKey: `${KEY_PREFIX}news`,
  keyEnvHint: 'VITE_NEWS_API_KEY',
  keyInstructions: [
    'Get a free API key at https://newsapi.org/register (takes ~1 minute).',
    'Paste it below. It is stored only in your browser (localStorage) and sent straight to NewsAPI.',
  ],
  inputs: [
    { id: 'query', label: 'Query', kind: 'text' },
    { id: 'pageSize', label: 'Page size', kind: 'number' },
  ],
  outputs: [
    { id: 'articles', label: 'Articles', kind: 'list' },
    { id: 'headline', label: 'Headline', kind: 'text' },
  ],
  async execute(inputs, context, apiKey) {
    const query = firstText(inputs, 'query', 'technology')
    const pageSize = Math.min(Math.max(Number(inputs['pageSize']) || 5, 1), 10)
    if (!apiKey) throw new Error('News tool requires an API key. Add it when prompted, then run again.')
    context.log(`News tool: fetching "${query}"…`, { nodeId: context.currentNodeId })
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=${pageSize}&sortBy=publishedAt&language=en&apiKey=${encodeURIComponent(apiKey)}`
    const text = await fetchText(url, context.signal)
    let data: { articles?: { title?: string; url?: string; description?: string | null; publishedAt?: string }[] }
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`News API returned an invalid response: ${text.slice(0, 120)}`)
    }
    const articles = (data.articles ?? []).map((article) => ({
      title: article.title ?? 'Untitled',
      url: article.url ?? '',
      description: article.description ?? '',
      publishedAt: article.publishedAt ?? '',
    }))
    if (articles.length === 0) {
      context.log('News tool: no articles found.', { level: 'warning', nodeId: context.currentNodeId })
    } else {
      context.log(`News tool: ${articles.length} articles for "${query}".`, {
        level: 'success',
        nodeId: context.currentNodeId,
      })
    }
    return {
      articles,
      headline: articles[0]?.title ?? `No news for "${query}"`,
    }
  },
}

export const IMAGEGEN_TOOL: ToolDefinition = {
  id: 'imagegen',
  nodeType: 'imagegen',
  name: 'ImageGen',
  description: 'Generate an image from a prompt (free, no key)',
  icon: 'lucide:image-plus',
  accent: '#fb7185',
  needsKey: false,
  keyStorageKey: '',
  keyEnvHint: '',
  keyInstructions: [],
  inputs: [
    { id: 'prompt', label: 'Prompt', kind: 'text' },
    { id: 'width', label: 'Width', kind: 'number' },
    { id: 'height', label: 'Height', kind: 'number' },
  ],
  outputs: [
    { id: 'imageUrl', label: 'Image URL', kind: 'text' },
    { id: 'prompt', label: 'Prompt', kind: 'text' },
  ],
  async execute(inputs, context) {
    const prompt = firstText(inputs, 'prompt', 'a glowing AI brain')
    const width = Math.min(Math.max(Number(inputs['width']) || 512, 256), 1024)
    const height = Math.min(Math.max(Number(inputs['height']) || 512, 256), 1024)
    context.log(`ImageGen tool: generating from "${prompt}"…`, { nodeId: context.currentNodeId })
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true`
    context.log('ImageGen tool: image URL ready.', { level: 'success', nodeId: context.currentNodeId })
    return { imageUrl, prompt }
  },
}

export const BROWSER_TOOL: ToolDefinition = {
  id: 'browser',
  nodeType: 'browser',
  name: 'Browser',
  description: 'Fetch the text of a live web page',
  icon: 'lucide:globe',
  accent: '#60a5fa',
  needsKey: false,
  keyStorageKey: '',
  keyEnvHint: '',
  keyInstructions: [],
  inputs: [{ id: 'url', label: 'URL', kind: 'text' }],
  outputs: [
    { id: 'content', label: 'Content', kind: 'text' },
    { id: 'url', label: 'URL', kind: 'text' },
  ],
  async execute(inputs, context) {
    const url = asUrl(inputs['url'], 'https://en.wikipedia.org/wiki/Artificial_intelligence')
    context.log(`Browser tool: fetching ${url}…`, { nodeId: context.currentNodeId })
    const text = await fetchText(url, context.signal)
    const cleaned = text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const content = cleaned.slice(0, 6000)
    context.log(`Browser tool: fetched ${text.length} chars from ${url}.`, {
      level: 'success',
      nodeId: context.currentNodeId,
    })
    return { content, url }
  },
}

export const TOOLS: readonly ToolDefinition[] = [NEWS_TOOL, IMAGEGEN_TOOL, BROWSER_TOOL]

const TOOL_BY_NODE_TYPE: Readonly<Record<string, ToolDefinition>> = Object.fromEntries(
  TOOLS.map((tool) => [tool.nodeType, tool]),
)

export function toolForNodeType(nodeType: NodeType): ToolDefinition | undefined {
  return TOOL_BY_NODE_TYPE[nodeType]
}
