// Plugin system (foundation). A plugin is a self-contained package that can
// contribute node types, providers, MCP connectors, templates, layouts or
// exporters to the OpenBrain Desktop. Plugins are isolated from the core: the
// Desktop only ever consumes manifests + registered node types through this
// module, never by importing plugin internals directly.
//
// On the self-hosted stack, plugins are discovered by the Runtime's /plugins
// endpoint (filesystem) and can be surfaced here via `loadRuntimePlugins()`.

export type PluginKind =
  | 'node'
  | 'provider'
  | 'mcp'
  | 'template'
  | 'layout'
  | 'exporter'

export interface PluginNodeTypeDefinition {
  readonly type: string
  readonly label: string
  readonly description: string
  readonly inputs?: readonly { id: string; label: string; kind: string }[]
  readonly outputs?: readonly { id: string; label: string; kind: string }[]
}

export interface PluginManifest {
  readonly name: string
  readonly version: string
  readonly kind: PluginKind
  readonly description?: string
  readonly main?: string
  readonly nodeTypes?: readonly PluginNodeTypeDefinition[]
  readonly providers?: readonly string[]
  readonly repository?: string
  readonly author?: string
  readonly license?: string
}

export interface InstalledPlugin {
  readonly manifest: PluginManifest
  readonly dir: string
  readonly enabled: boolean
}

const installed = new Map<string, InstalledPlugin>()

export function installPlugin(plugin: InstalledPlugin): void {
  installed.set(plugin.manifest.name, plugin)
}

export function uninstallPlugin(name: string): boolean {
  return installed.delete(name)
}

export function listInstalledPlugins(): readonly InstalledPlugin[] {
  return [...installed.values()]
}

export function getPlugin(name: string): InstalledPlugin | undefined {
  return installed.get(name)
}

// Node types contributed by installed "node" plugins. Merged into the node
// palette at startup; unknown types fall back to a generic renderer until a
// runtime executor is provided.
export function pluginNodeTypes(): readonly PluginNodeTypeDefinition[] {
  const types: PluginNodeTypeDefinition[] = []
  for (const plugin of installed.values()) {
    if (plugin.enabled && plugin.manifest.kind === 'node') {
      types.push(...(plugin.manifest.nodeTypes ?? []))
    }
  }
  return types
}

// Accepts a plugin list from the Runtime's /plugins endpoint and installs the
// node-kind plugins. Runtime plugins carry the same manifest shape as local
// ones, so Desktop and Docker experience identical extensions.
export async function loadRuntimePlugins(
  runtimeUrl?: string,
): Promise<readonly InstalledPlugin[]> {
  const baseUrl = (runtimeUrl ?? import.meta.env.VITE_RUNTIME_URL) as string | undefined
  if (!baseUrl || baseUrl.trim() === '') return []
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/plugins`)
    const payload = (await response.json()) as { ok?: boolean; plugins?: unknown[] }
    const plugins: InstalledPlugin[] = []
    for (const entry of payload.plugins ?? []) {
      const manifest = entry as PluginManifest
      if (!manifest?.name) continue
      const plugin: InstalledPlugin = {
        manifest,
        dir: String((entry as { dir?: unknown }).dir ?? ''),
        enabled: true,
      }
      installPlugin(plugin)
      plugins.push(plugin)
    }
    return plugins
  } catch {
    return []
  }
}
