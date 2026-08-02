import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import { NODE_HEADER, PORT_GAP } from '../../core/legacyArchitect'
import { CAPABILITIES } from '../../core/registry'
import { useBrainStore } from '../../store/useBrainStore'
import type { CapabilityType } from '../../core/types'

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

function portTop(count: number, index: number): number {
  return NODE_HEADER / 2 + (index - (count - 1) / 2) * PORT_GAP
}

function BrainNodeComponent({ id, data, selected }: NodeProps<BrainFlowNode>) {
  const capability = CAPABILITIES[data.capability]
  const node = useBrainStore((state) => state.nodes.find((entry) => entry.id === id))

  if (!node) return null

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
          style={{ color: capability.accent, background: `${capability.accent}1f` }}
        >
          <iconify-icon icon={capability.icon}></iconify-icon>
        </span>
        <span className="node-meta">
          <span className="node-title">{capability.label}</span>
          <span className="node-sub">{capability.description}</span>
        </span>
        <span className={`node-status-dot ${node.status}`} />
      </div>
      {node.status === 'success' && node.output && (
        <div className="node-output">{summarizeOutput(node.output)}</div>
      )}
      {node.status === 'error' && node.error && <div className="node-error">{node.error}</div>}
      {capability.inputs.map((port, index) => (
        <Handle
          key={port.id}
          id={port.id}
          type="target"
          position={Position.Left}
          title={port.label}
          style={{ top: portTop(capability.inputs.length, index) }}
        />
      ))}
      {capability.outputs.map((port, index) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={Position.Right}
          title={port.label}
          style={{ top: portTop(capability.outputs.length, index) }}
        />
      ))}
    </div>
  )
}

export default memo(BrainNodeComponent)
