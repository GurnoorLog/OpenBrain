import { memo, useEffect, useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import { NODE_HEADER, PORT_GAP } from '../../core/legacyArchitect'
import { CAPABILITIES } from '../../core/registry'
import { useBrainStore } from '../../store/useBrainStore'
import type { CapabilityType } from '../../core/types'
import { fetchModelCatalog, type ModelCatalogEntry } from '../../core/localModel'
import {
  MCP_NODE_TYPES,
  MCP_SERVERS,
  mcpBrandForNode,
  mcpToolHints,
} from '../../core/mcp/servers'
export type BrainNodeData = { capability: CapabilityType }
export type BrainFlowNode = Node<BrainNodeData, 'brain'>

function summarizeOutput(output: Record<string, unknown>): string {
  const value = Object.values(output).find(
    (item): item is string | number | unknown[] =>
      typeof item === 'string' || typeof item === 'number' || Array.isArray(item),
  )
  if (value === undefined) return 'Done'
  const text = Array.isArray(value)
    ? `${value.length} item${value.length === 1 ? '' : 's'}`
    : String(value)
  return text.length > 56 ? `${text.slice(0, 56)}…` : text
}

function formatOutputValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value, null, 2)
}

// Small popup shown when a node is selected: lists every output the node
// produced so the user can see exactly what it fetched/computed.
function NodeInspector({ output }: { output: Record<string, unknown> }) {
  const entries = Object.entries(output)
  if (entries.length === 0) return null
  return (
    <div className="node-inspector">
      <div className="node-inspector-title">
        <iconify-icon icon="lucide:info" className="text-teal-400 text-xs"></iconify-icon>
        <span>Node output</span>
      </div>
      <div className="node-inspector-body">
        {entries.map(([key, value]) => (
          <div key={key} className="node-inspector-row">
            <div className="node-inspector-key">{key}</div>
            <pre className="node-inspector-value">{formatOutputValue(value)}</pre>
          </div>
        ))}
      </div>
    </div>
  )
}

function portTop(count: number, index: number): number {
  return NODE_HEADER / 2 + (index - (count - 1) / 2) * PORT_GAP
}

// Strips the "<server>/" prefix off a configured tool for display.
function bareToolName(configuration: Readonly<Record<string, unknown>> | undefined): string {
  const tool = typeof configuration?.['tool'] === 'string' ? configuration['tool'] : ''
  const slash = tool.lastIndexOf('/')
  const dot = tool.lastIndexOf('.')
  const separator = Math.max(slash, dot)
  return separator > 0 ? tool.slice(separator + 1) : tool
}

// Small form shown on an MCP/tool/github node: pick the server, then the tool.
// Writes configuration back so brain-core's resolveMcpTarget runs it as-is.
function McpNodeEditor({ nodeId, configuration }: { nodeId: string; configuration?: Readonly<Record<string, unknown>> }) {
  const server =
    typeof configuration?.['mcpServer'] === 'string' ? configuration['mcpServer'] : ''
  const tool = bareToolName(configuration)
  const [argsText, setArgsText] = useState(() => {
    const raw = configuration?.['arguments']
    if (typeof raw === 'string') return raw
    if (raw && typeof raw === 'object') return JSON.stringify(raw, null, 2)
    return '{}'
  })

  const commit = (patch: { mcpServer?: string; tool?: string; arguments?: unknown }) => {
    const nextServer = patch.mcpServer ?? server
    const nextTool = patch.tool ?? tool
    const config: Record<string, unknown> = {}
    if (nextServer !== '') config.mcpServer = nextServer
    if (nextTool !== '') config.tool = `${nextServer}/${nextTool}`
    if (patch.arguments !== undefined) config.arguments = patch.arguments
    useBrainStore.getState().setNodeConfiguration(nodeId, config)
  }

  const options = [...MCP_SERVERS.map((entry) => entry.name)]
  if (!options.includes('github')) options.push('github')

  return (
    <div className="node-mcp-editor" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <label className="node-model-label">MCP server</label>
      <select
        className="node-model-select"
        value={options.includes(server) ? server : ''}
        onChange={(e) => {
          const name = e.target.value
          if (!name) return
          commit({ mcpServer: name, tool: mcpToolHints(name)[0] ?? '' })
        }}
      >
        {!options.includes(server) && <option value="">{server || 'choose a server…'}</option>}
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <label className="node-model-label">Tool</label>
      <input
        className="node-mcp-tool"
        placeholder={mcpToolHints(server)[0] ?? 'tool_name'}
        value={tool}
        onChange={(e) => commit({ tool: e.target.value })}
      />
      <label className="node-model-label">Arguments (JSON)</label>
      <textarea
        className="node-content-editor node-mcp-args"
        placeholder='{ "query": "…" }'
        value={argsText}
        onBlur={() => {
          try {
            commit({ arguments: JSON.parse(argsText) })
          } catch {
            /* keep last valid state; do not save invalid JSON */
          }
        }}
        onChange={(e) => setArgsText(e.target.value)}
      />
      <p className="node-model-hint">Stored as configuration.mcpServer / configuration.tool — the executor calls this server natively.</p>
    </div>
  )
}

// Lets the user pick which open model a Local Model node runs. Loads the cloud
// catalog; falls back to the bundled list so it always has choices.
function LocalModelPicker({ nodeId, current }: { nodeId: string; current: string }) {
  const [models, setModels] = useState<readonly ModelCatalogEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchModelCatalog().then((items) => {
      if (cancelled) return
      setModels(items)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const value =
    models.find((model) => model.modelId === current)?.modelId ?? current

  return (
    <div className="node-model-picker" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <label className="node-model-label">Model</label>
      {!loaded && <div className="node-model-loading">Loading catalog…</div>}
      {loaded && (
        <select
          className="node-model-select"
          value={value}
          onChange={(e) => useBrainStore.getState().setNode(nodeId, { model: e.target.value })}
        >
          {models.map((model) => (
            <option key={model.id} value={model.modelId}>
              {model.name} — {model.sizeMb} MB
            </option>
          ))}
        </select>
      )}
      <p className="node-model-hint">Runs in your browser. No API key. First run downloads once.</p>
    </div>
  )
}

function BrainNodeComponent({ id, data, selected }: NodeProps<BrainFlowNode>) {
  const capability = CAPABILITIES[data.capability]
  const node = useBrainStore((state) => state.nodes.find((entry) => entry.id === id))

  if (!node) return null

  // MCP/tool/github nodes carry a brand: the icon, accent and title follow the
  // configured server (Stripe shows the Stripe mark, Supabase shows Supabase…).
  const isMcpNode = MCP_NODE_TYPES.includes(data.capability)
  const brand = isMcpNode ? mcpBrandForNode(node.configuration) : null
  const accent = brand ? brand.accent : (capability?.accent ?? '#94a3b8')
  const icon = brand ? brand.icon : (capability?.icon ?? 'lucide:box')
  const toolName = brand ? bareToolName(node.configuration) : ''
  const title = brand ? brand.label : (capability?.label ?? data.capability)
  const sub = brand
    ? toolName !== ''
      ? `MCP · ${toolName}`
      : 'MCP tool'
    : (capability?.description ?? 'Custom node')
  const inputs = capability?.inputs ?? []
  const outputs = capability?.outputs ?? []

  const classNames = [
    'node-card',
    node.status === 'running' ? 'status-running' : `status-${node.status}`,
    selected ? 'selected' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classNames}>
      <div className="node-header">
        <span
          className="node-icon"
          style={{ color: accent, background: `${accent}1f` }}
        >
          <iconify-icon icon={icon}></iconify-icon>
        </span>
        <span className="node-meta">
          <span className="node-title">{title}</span>
          <span className="node-sub">{sub}</span>
        </span>
        <span className={`node-status-dot ${node.status}`} />
      </div>
      {isMcpNode && selected && <McpNodeEditor nodeId={id} configuration={node.configuration} />}
      {node.status === 'success' && node.output && (
        <div className="node-output">{summarizeOutput(node.output)}</div>
      )}
      {node.status === 'error' && node.error && <div className="node-error">{node.error}</div>}
      {node.reason && <div className="node-reason">{node.reason}</div>}
      {selected && node.output && <NodeInspector output={node.output} />}
      {data.capability === 'filesystem' && selected && (
        <textarea
          className="node-content-editor"
          placeholder="Type file content for this node…"
          defaultValue={node.content ?? ''}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onChange={(e) => useBrainStore.getState().setNode(id, { content: e.target.value })}
        />
      )}
      {data.capability === 'local' && selected && <LocalModelPicker nodeId={id} current={node.model ?? ''} />}
      {inputs.map((port, index) => (
        <Handle
          key={port.id}
          id={port.id}
          type="target"
          position={Position.Left}
          title={port.label}
          style={{ top: portTop(inputs.length, index) }}
        />
      ))}
      {outputs.map((port, index) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={Position.Right}
          title={port.label}
          style={{ top: portTop(outputs.length, index) }}
        />
      ))}
    </div>
  )
}

export default memo(BrainNodeComponent)
