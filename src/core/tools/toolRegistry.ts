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

async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`Request failed with HTTP ${response.status}`)
  }
  return response.text()
}

// Most public sites (Wikipedia, blogs, docs) do not send CORS headers, so a
// plain browser fetch is blocked before it starts. Chain of CORS relays:
// 1. Our own Render cloud executor (/fetch does a server-side fetch — no CORS
//    at all, most reliable when the service is up).
// 2. api.allorigins.win /get (JSON wrapper — confirmed to send CORS *).
// 3. A direct fetch, which works for CORS-friendly endpoints.
async function fetchViaProxy(url: string, signal: AbortSignal): Promise<string> {
  const baseUrl = import.meta.env.VITE_CLOUD_EXECUTOR_URL as string | undefined
  if (baseUrl) {
    try {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, '')}/fetch?url=${encodeURIComponent(url)}`,
        { signal },
      )
      if (response.ok) {
        // The /fetch endpoint returns { ok, url, text } — unwrap it so the
        // browser node gets the page text, not the JSON envelope.
        const data = (await response.json().catch(() => null)) as { text?: string } | null
        if (data && typeof data.text === 'string' && data.text.trim() !== '') {
          return data.text
        }
      }
    } catch {
      /* try the next relay */
    }
  }
  try {
    const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {
      signal,
    })
    if (response.ok) {
      const data = (await response.json().catch(() => null)) as { contents?: string } | null
      if (data && typeof data.contents === 'string' && data.contents.trim() !== '') {
        return data.contents
      }
    }
  } catch {
    /* try a direct fetch */
  }
  return fetchText(url, signal)
}

interface WikipediaExtractResponse {
  readonly query?: {
    readonly pages?: readonly { readonly extract?: string }[]
  }
}

// Naive tag-stripping of a Wikipedia page returns the navigation/TOC boilerplate
// before the article body, so a fixed-size prefix window misses the meat of the
// page. When the target is a Wikipedia article, rewrite it to the MediaWiki API
// and pull the plain-text extract of the whole article instead.
function wikipediaExtractUrl(url: string): string | null {
  const match = /^https?:\/\/([a-z]{2})\.wikipedia\.org\/wiki\/([^#?]+)/i.exec(url)
  if (!match) return null
  const title = decodeURIComponent(match[2]).replace(/_/g, ' ')
  if (title.trim() === '') return null
  const lang = match[1].toLowerCase()
  return `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&formatversion=2&origin=*&titles=${encodeURIComponent(title)}`
}

async function fetchWikipediaExtract(apiUrl: string, signal: AbortSignal): Promise<string> {
  const raw = await fetchViaProxy(apiUrl, signal)
  const json = JSON.parse(raw) as WikipediaExtractResponse
  const extract = json?.query?.pages?.[0]?.extract ?? ''
  return extract.replace(/\s+/g, ' ').trim()
}

interface WikipediaSearchResponse {
  readonly query?: { readonly search?: readonly { readonly title?: string }[] }
}

// When the browser node has no concrete URL (a generic "browse the web" brain),
// derive the target article from the user's actual question via Wikipedia
// search, so the chat brain researches the topic the user asked about.
async function searchWikipediaTopic(topic: string, signal: AbortSignal): Promise<string | null> {
  const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    topic,
  )}&srlimit=1&format=json&formatversion=2&origin=*`
  try {
    const raw = await fetchViaProxy(apiUrl, signal)
    const data = JSON.parse(raw) as WikipediaSearchResponse
    const title = data?.query?.search?.[0]?.title
    if (!title || title.trim() === '') return null
    return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.trim().replace(/ /g, '_'))}`
  } catch {
    return null
  }
}

// The chat pill stamps the user's message onto the llm node; any node may carry
// it, so scan the whole graph for the live question.
function findUserMessage(nodes: Readonly<Array<{ readonly configuration?: Readonly<Record<string, unknown>> }>>): string {
  for (const node of nodes) {
    const value = node.configuration?.['userMessage']
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

// ---------------------------------------------------------------------------
// Composio-backed tools (GitHub + generic MCP). One API key drives every
// Composio tool call; a connected account (created once in the Composio
// dashboard) authenticates the underlying app. For a hackathon demo the key is
// bundled via VITE_COMPOSIO_API_KEY so end users never configure anything.
// ---------------------------------------------------------------------------
const COMPOSIO_API_URL = 'https://backend.composio.dev/api/v3.1'
const COMPOSIO_KEY_STORAGE = `${KEY_PREFIX}composio`
const COMPOSIO_ACCOUNT_STORAGE = `${KEY_PREFIX}composio-account`

export function getComposioApiKey(): string | null {
  const local = getToolKey('composio')
  if (local && local.trim() !== '') return local.trim()
  const env = import.meta.env.VITE_COMPOSIO_API_KEY as string | undefined
  return env && env.trim() !== '' ? env.trim() : null
}

export function getComposioAccountId(): string | null {
  try {
    const local = localStorage.getItem(COMPOSIO_ACCOUNT_STORAGE)
    if (local && local.trim() !== '') return local.trim()
  } catch {
    /* ignore */
  }
  const env = import.meta.env.VITE_COMPOSIO_ACCOUNT_ID as string | undefined
  return env && env.trim() !== '' ? env.trim() : null
}

export function setComposioAccountId(value: string): void {
  try {
    localStorage.setItem(COMPOSIO_ACCOUNT_STORAGE, value.trim())
  } catch {
    /* ignore */
  }
}

// Reads a field the architect stamped onto the node's configuration (e.g.
// { "tool": "GITHUB_GET_A_USER", "arguments": { "username": "octocat" } }).
function nodeConfigValue(context: ExecutionContext, key: string): unknown {
  const node = context.brain.nodes.find((entry) => entry.id === context.currentNodeId)
  if (!node?.configuration) return undefined
  return node.configuration[key]
}

// The architect may write "arguments" as a JSON object or as a JSON string.
function parseArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) }
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...(parsed as Record<string, unknown>) }
      }
    } catch {
      /* not JSON — ignore */
    }
  }
  return {}
}

// Edge-fed ports (owner, repo, username, query, …) become tool arguments too,
// so an upstream node can hand the GitHub tool a target to act on.
function mergeInputArgs(inputs: NodeInputs, args: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...args }
  for (const [key, value] of Object.entries(inputs)) {
    if (key === 'input' || key === 'context') continue
    if (merged[key] === undefined && typeof value === 'string' && value.trim() !== '') {
      merged[key] = value.trim()
    }
  }
  return merged
}

// POST /api/v3.1/tools/execute/{tool_slug}. Passing version "latest" avoids the
// ToolVersionRequiredError the API raises for direct execution. Without a
// connected_account_id Composio falls back to the project's default account.
async function composioExecute(
  slug: string,
  args: Record<string, unknown>,
  apiKey: string,
  signal: AbortSignal,
): Promise<unknown> {
  const body: Record<string, unknown> = { arguments: args, version: 'latest' }
  const accountId = getComposioAccountId()
  if (accountId) body.connected_account_id = accountId
  const response = await fetch(`${COMPOSIO_API_URL}/tools/execute/${encodeURIComponent(slug)}`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  const raw = await response.text().catch(() => '')
  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string } }
      if (parsed?.error?.message) detail = `${detail}: ${parsed.error.message}`
    } catch {
      if (raw.trim() !== '') detail = `${detail}: ${raw.slice(0, 200)}`
    }
    throw new Error(`Composio request failed (${detail})`)
  }
  let parsed: { data?: unknown; error?: unknown; successful?: boolean } | null = null
  try {
    parsed = JSON.parse(raw) as { data?: unknown; error?: unknown; successful?: boolean }
  } catch {
    throw new Error(`Composio returned an invalid response: ${raw.slice(0, 120)}`)
  }
  if (parsed.successful === false) {
    throw new Error(
      typeof parsed.error === 'string' && parsed.error !== ''
        ? `Composio tool failed: ${parsed.error}`
        : 'Composio tool execution failed.',
    )
  }
  const data = parsed.data as { response_data?: unknown } | undefined
  if (data && typeof data === 'object' && 'response_data' in data) return data.response_data
  return parsed.data
}

function stringifyResult(data: unknown): string {
  if (data === null || data === undefined) return ''
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

// Best-effort conversion of a GitHub repos/PRs/issues payload into a list of
// readable labels for the node's "repos" output port.
function listOfStrings(data: unknown): string[] {
  if (!Array.isArray(data)) return []
  return data.map((entry) => {
    if (typeof entry === 'string') return entry
    const owner = (entry as { owner?: { login?: unknown } })?.owner?.login
    const name = (entry as { name?: unknown })?.name
    const fullName = (entry as { full_name?: unknown })?.full_name
    return String(
      fullName ?? (owner ? `${owner}/${name ?? ''}` : name ?? stringifyResult(entry)),
    )
  })
}

const COMPOSIO_KEY_INSTRUCTIONS = [
  'This tool runs on the bundled Composio API key — no setup needed for a normal run.',
  'To use your own key instead: create one at https://app.composio.dev (Settings → API Keys) and paste it here; it is stored only in your browser.',
  'For GitHub actions, connect the GitHub account once at https://app.composio.dev/connections and add its Connected Account ID (ca_…) in Settings under this tool.',
]

export const GITHUB_TOOL: ToolDefinition = {
  id: 'github',
  nodeType: 'github',
  name: 'GitHub',
  description: 'Run a real GitHub operation via Composio (repos, issues, PRs, search)',
  icon: 'lucide:github',
  accent: '#94a3b8',
  needsKey: true,
  keyStorageKey: COMPOSIO_KEY_STORAGE,
  keyEnvHint: 'VITE_COMPOSIO_API_KEY',
  keyInstructions: COMPOSIO_KEY_INSTRUCTIONS,
  inputs: [
    { id: 'owner', label: 'Owner', kind: 'text' },
    { id: 'repo', label: 'Repo', kind: 'text' },
  ],
  outputs: [
    { id: 'repos', label: 'Repos', kind: 'list' },
    { id: 'result', label: 'Result', kind: 'text' },
  ],
  async execute(inputs, context, apiKey) {
    const key = apiKey ?? getComposioApiKey()
    if (!key) throw new Error('GitHub tool needs a Composio API key. Add it when prompted, then run again.')
    const configured = String(nodeConfigValue(context, 'tool') ?? '').trim()
    const toolSlug =
      configured !== ''
        ? configured
        : 'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER'
    const args = mergeInputArgs(inputs, parseArguments(nodeConfigValue(context, 'arguments')))
    context.log(`GitHub tool: executing ${toolSlug}…`, { nodeId: context.currentNodeId })
    const data = await composioExecute(toolSlug, args, key, context.signal)
    context.log(`GitHub tool: ${toolSlug} completed.`, {
      level: 'success',
      nodeId: context.currentNodeId,
    })
    return { repos: listOfStrings(data), result: stringifyResult(data) }
  },
}

export const MCP_TOOL: ToolDefinition = {
  id: 'mcp',
  nodeType: 'mcp',
  name: 'MCP Tools',
  description: 'Execute any Composio tool by slug (Slack, Notion, Gmail, Hacker News, Wikipedia, …)',
  icon: 'lucide:plug-zap',
  accent: '#22d3ee',
  needsKey: true,
  keyStorageKey: COMPOSIO_KEY_STORAGE,
  keyEnvHint: 'VITE_COMPOSIO_API_KEY',
  keyInstructions: COMPOSIO_KEY_INSTRUCTIONS,
  inputs: [{ id: 'input', label: 'Input', kind: 'any' }],
  outputs: [
    { id: 'result', label: 'Result', kind: 'any' },
    { id: 'data', label: 'Data', kind: 'text' },
  ],
  async execute(inputs, context, apiKey) {
    const key = apiKey ?? getComposioApiKey()
    if (!key) throw new Error('MCP tool needs a Composio API key. Add it when prompted, then run again.')
    const configured = String(nodeConfigValue(context, 'tool') ?? '').trim()
    const toolSlug = configured !== '' ? configured : 'HACKERNEWS_GET_TOP_STORIES'
    const args = mergeInputArgs(inputs, parseArguments(nodeConfigValue(context, 'arguments')))
    if (configured === '') {
      context.log(
        'MCP tool: no configuration.tool set — defaulting to HACKERNEWS_GET_TOP_STORIES (no auth needed).',
        { nodeId: context.currentNodeId },
      )
    }
    context.log(`MCP tool: executing ${toolSlug}…`, { nodeId: context.currentNodeId })
    const data = await composioExecute(toolSlug, args, key, context.signal)
    context.log(`MCP tool: ${toolSlug} completed.`, {
      level: 'success',
      nodeId: context.currentNodeId,
    })
    const result = stringifyResult(data)
    return { result, data: result }
  },
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
    { id: 'pages', label: 'Pages', kind: 'list' },
    { id: 'content', label: 'Content', kind: 'text' },
    { id: 'url', label: 'URL', kind: 'text' },
  ],
  async execute(inputs, context) {
    // The architect can pre-pick a target URL on the node's configuration;
    // prefer that, then an edge-fed url input, then the user's live chat
    // question (searched on Wikipedia), then the default topic.
    const node = context.brain.nodes.find((entry) => entry.id === context.currentNodeId)
    const configUrl =
      node?.configuration && typeof node.configuration['url'] === 'string'
        ? node.configuration['url']
        : ''
    const configContent =
      node?.configuration && typeof node.configuration['content'] === 'string'
        ? node.configuration['content']
        : ''
    const edgeUrl = typeof inputs['url'] === 'string' ? inputs['url'].trim() : ''
    const userMessage = findUserMessage(context.brain.nodes)
    let url: string
    if (edgeUrl !== '') url = edgeUrl
    else if (configUrl !== '') url = configUrl
    else if (configContent !== '') url = configContent
    else if (userMessage !== '') {
      const derived = await searchWikipediaTopic(userMessage, context.signal)
      url = derived ?? 'https://en.wikipedia.org/wiki/Artificial_intelligence'
      if (derived !== null) {
        context.log(`Browser tool: no URL set — searching Wikipedia for "${userMessage}" → ${derived}`, {
          nodeId: context.currentNodeId,
        })
      }
    } else {
      url = 'https://en.wikipedia.org/wiki/Artificial_intelligence'
    }
    context.log(`Browser tool: fetching ${url}…`, { nodeId: context.currentNodeId })
    const wikiApiUrl = wikipediaExtractUrl(url)
    if (wikiApiUrl !== null) {
      try {
        const extract = await fetchWikipediaExtract(wikiApiUrl, context.signal)
        if (extract !== '') {
          const content = extract.slice(0, 15000)
          context.log(`Browser tool: fetched ${content.length} chars (Wikipedia plain text) from ${url}.`, {
            level: 'success',
            nodeId: context.currentNodeId,
          })
          return { pages: [{ url, content }], content, url }
        }
      } catch {
        /* fall through to the generic HTML path */
      }
    }
    const text = await fetchViaProxy(url, context.signal)
    const cleaned = text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const content = cleaned.slice(0, 12000)
    context.log(`Browser tool: fetched ${text.length} chars from ${url}.`, {
      level: 'success',
      nodeId: context.currentNodeId,
    })
    return { pages: [{ url, content }], content, url }
  },
}

export const TOOLS: readonly ToolDefinition[] = [
  NEWS_TOOL,
  IMAGEGEN_TOOL,
  BROWSER_TOOL,
  GITHUB_TOOL,
  MCP_TOOL,
]

const TOOL_BY_NODE_TYPE: Readonly<Record<string, ToolDefinition>> = Object.fromEntries(
  TOOLS.map((tool) => [tool.nodeType, tool]),
)

export function toolForNodeType(nodeType: NodeType): ToolDefinition | undefined {
  return TOOL_BY_NODE_TYPE[nodeType]
}
