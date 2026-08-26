import type { CapabilityType } from '../types'
import mcpConfigJson from '../../../mcp.json'

// ---------------------------------------------------------------------------
// MCP manifest for the Canvas. The architect and the node renderer both read
// the SAME server list the executor uses — the repo's mcp.json, bundled into
// the SPA at build time (Vite JSON import). Brand metadata per server drives
// the node icon so a Stripe MCP node shows the Stripe mark, Supabase shows
// Supabase, and so on.
// ---------------------------------------------------------------------------

// Bundled at build time. Cast through unknown so an untyped JSON import is safe.
const bundled: unknown = mcpConfigJson

export interface McpServerInfo {
  readonly name: string
  readonly kind: 'stdio' | 'remote'
  readonly url?: string
  readonly command?: string
  readonly enabled: boolean
}

interface RawMcpConfig {
  readonly mcp?: Readonly<Record<string, { readonly enabled?: boolean } & Record<string, unknown>>>
}

const rawConfig = (bundled ?? {}) as RawMcpConfig

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export const MCP_SERVERS: readonly McpServerInfo[] = Object.entries(
  rawConfig.mcp ?? {},
)
  .filter(([name, spec]) => name && spec && typeof spec === 'object' && spec.enabled !== false)
  .map(([name, spec]) => ({
    name,
    kind: typeof spec.url === 'string' ? 'remote' : 'stdio',
    url: typeof spec.url === 'string' ? spec.url : undefined,
    command: typeof spec.command === 'string' ? spec.command : undefined,
    enabled: spec.enabled !== false,
  }))

export const MCP_SERVER_NAMES: readonly string[] = MCP_SERVERS.map((server) => server.name)

export interface McpBrand {
  readonly name: string
  readonly label: string
  readonly icon: string
  readonly accent: string
}

const GENERIC_BRAND: McpBrand = { name: 'mcp', label: 'MCP Tool', icon: 'lucide:plug-zap', accent: '#22d3ee' }

const BRANDS: readonly McpBrand[] = [
  { name: 'stripe', label: 'Stripe', icon: 'simple-icons:stripe', accent: '#635bff' },
  { name: 'supabase', label: 'Supabase', icon: 'simple-icons:supabase', accent: '#3ecf8e' },
  { name: 'github', label: 'GitHub', icon: 'simple-icons:github', accent: '#a3b3c2' },
  { name: 'godot', label: 'Godot AI', icon: 'simple-icons:godotengine', accent: '#478cbf' },
  { name: 'filesystem', label: 'Filesystem', icon: 'lucide:folder', accent: '#f472b6' },
  { name: 'hackernews', label: 'Hacker News', icon: 'simple-icons:ycombinator', accent: '#ff6600' },
  { name: 'openai', label: 'OpenAI', icon: 'simple-icons:openai', accent: '#10a37f' },
  { name: 'slack', label: 'Slack', icon: 'simple-icons:slack', accent: '#e01e5a' },
  { name: 'notion', label: 'Notion', icon: 'simple-icons:notion', accent: '#a6a6a6' },
  { name: 'gmail', label: 'Gmail', icon: 'simple-icons:gmail', accent: '#ea4335' },
  { name: 'google', label: 'Google', icon: 'simple-icons:google', accent: '#4285f4' },
  { name: 'aws', label: 'AWS', icon: 'simple-icons:amazonwebservices', accent: '#ff9900' },
  { name: 'cloudflare', label: 'Cloudflare', icon: 'simple-icons:cloudflare', accent: '#f38020' },
  { name: 'postgres', label: 'PostgreSQL', icon: 'simple-icons:postgresql', accent: '#4169e1' },
  { name: 'firebase', label: 'Firebase', icon: 'simple-icons:firebase', accent: '#ffca28' },
  { name: 'vercel', label: 'Vercel', icon: 'simple-icons:vercel', accent: '#c8c8c8' },
]

export function mcpBrandForServer(serverName: string): McpBrand {
  const needle = normalizeName(serverName)
  if (needle === '') return GENERIC_BRAND
  for (const brand of BRANDS) {
    if (normalizeName(brand.name) === needle) return brand
  }
  for (const brand of BRANDS) {
    if (needle.includes(normalizeName(brand.name))) return brand
  }
  return { ...GENERIC_BRAND, name: serverName, label: serverName }
}

// Resolves the brand for a canvas node. Reads configuration.mcpServer /
// configuration.tool the same way brain-core's resolveMcpTarget does, so the
// icon matches whatever the executor will actually call.
export function mcpBrandForNode(configuration: Readonly<Record<string, unknown>> | undefined): McpBrand {
  const config = configuration ?? {}
  const server = typeof config['mcpServer'] === 'string' ? config['mcpServer'] : ''
  const tool = typeof config['tool'] === 'string' ? config['tool'] : ''
  if (server !== '') return mcpBrandForServer(server)
  const slash = tool.lastIndexOf('/')
  const dot = tool.lastIndexOf('.')
  const separator = Math.max(slash, dot)
  if (separator > 0) return mcpBrandForServer(tool.slice(0, separator))
  return GENERIC_BRAND
}

export function serverKindLabel(kind: 'stdio' | 'remote'): string {
  return kind === 'stdio' ? 'local process' : 'remote'
}

// ---------------------------------------------------------------------------
// Well-known tool names per server. The architect uses these as concrete,
// callable examples so the model stops inventing Composio-style slugs and
// emits tools the configured servers actually expose. Unknown servers fall
// back to a generic MCP tool list.
// ---------------------------------------------------------------------------

const TOOL_HINTS: Readonly<Record<string, readonly string[]>> = {
  stripe: [
    'create_payment_link',
    'get_balance',
    'list_charges',
    'list_products',
    'create_product',
    'create_price',
    'create_customer',
    'get_customer',
    'create_invoice',
    'create_refund',
  ],
  supabase: [
    'list_tables',
    'get_schema',
    'list_migrations',
    'list_projects',
    'get_project_url',
    'get_publishable_api_key',
    'list_organizations',
    'list_extensions',
  ],
  filesystem: [
    'list_directory',
    'read_file',
    'write_file',
    'create_directory',
    'get_file_info',
    'search_files',
    'move_file',
  ],
  github: [
    'list_repositories',
    'get_repository',
    'search_repositories',
    'list_issues',
    'get_issue',
    'create_issue',
    'get_file_contents',
    'list_pull_requests',
  ],
  godot: ['godot_run_scene', 'godot_get_node', 'godot_set_property', 'godot_call_method'],
  hackernews: ['get_top_stories', 'get_story', 'search_posts'],
}

const GENERIC_TOOL_HINTS: readonly string[] = [
  'get_balance',
  'list_items',
  'search',
  'create',
  'read',
  'write',
]

export function mcpToolHints(serverName: string): readonly string[] {
  const needle = normalizeName(serverName)
  for (const [key, tools] of Object.entries(TOOL_HINTS)) {
    if (normalizeName(key) === needle) return tools
    if (needle.includes(normalizeName(key))) return tools
  }
  return GENERIC_TOOL_HINTS
}

// Used by the node registry so the palette/executor treat MCP nodes uniformly.
export const MCP_NODE_TYPES: readonly CapabilityType[] = ['mcp', 'tool', 'github']
