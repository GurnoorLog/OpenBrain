import { useState } from 'react'
import type { EditorMode } from '../core/types'
import type { CapabilityType } from '../core/types'
import { CAPABILITY_LIST } from '../core/registry'
import { useBrainStore } from '../store/useBrainStore'
import { useAuth } from '../core/auth/useAuth'
import { updateProject, buildProjectData } from '../core/projects/projectsRepository'
import { screenToFlowPosition } from './canvas/flowInstance'

const SELECT_TOOLS: { id: string; icon: string; mode: EditorMode; label: string }[] = [
  { id: 'select', icon: 'lucide:mouse-pointer-2', mode: 'select', label: 'Select' },
  { id: 'pan', icon: 'lucide:hand', mode: 'pan', label: 'Pan canvas' },
]

export default function Toolbar() {
  const mode = useBrainStore((state) => state.mode)
  const setMode = useBrainStore((state) => state.setMode)
  const showGrid = useBrainStore((state) => state.showGrid)
  const setShowGrid = useBrainStore((state) => state.setShowGrid)
  const addNode = useBrainStore((state) => state.addNode)
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)

  const saveToProject = async () => {
    const store = useBrainStore.getState()
    const { projectId, projectPrompt, projectOwnerId, nodes, connections } = store
    if (saving) return
    if (!projectId) {
      store.addLog('No project is open to save', 'warning')
      return
    }
    if (!user || projectOwnerId !== user.id) {
      store.addLog('You can only save to projects you own', 'warning')
      return
    }
    setSaving(true)
    try {
      await updateProject(user.id, projectId, {
        data: buildProjectData(
          projectPrompt ?? '',
          nodes.map(({ id, type, x, y, content }) => ({ id, type, x, y, content })),
          connections,
        ),
      })
      store.addLog('Saved to project', 'success')
    } catch (e) {
      store.addLog(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const renderSelectButton = (tool: { id: string; icon: string; mode: EditorMode; label: string }) => (
    <button
      key={tool.id}
      id={`tool-${tool.id}-btn`}
      className={`toolbar-btn ${tool.mode === mode ? 'active-tool' : ''}`}
      onClick={() => setMode(tool.mode)}
      aria-pressed={tool.mode === mode}
      title={tool.label}
    >
      <iconify-icon icon={tool.icon}></iconify-icon>
    </button>
  )

  const renderNodeButton = (capability: CapabilityType) => {
    const def = CAPABILITY_LIST.find((entry) => entry.type === capability)
    if (!def) return null
    return (
      <div key={capability} className="toolbar-node relative group">
        <button
          id={`tool-${capability}-btn`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', capability)
            e.dataTransfer.effectAllowed = 'copy'
            e.dataTransfer.setData(
              'application/json',
              JSON.stringify({ type: capability, icon: def.icon, accent: def.accent }),
            )
          }}
          onClick={() => {
            const point = screenToFlowPosition({
              x: window.innerWidth / 2,
              y: window.innerHeight / 2,
            })
            addNode(capability, point.x, point.y)
          }}
          className="toolbar-btn node-palette-btn"
          title={`${def.label} — ${def.description}`}
        >
          <iconify-icon icon={def.icon} style={{ color: def.accent }}></iconify-icon>
        </button>
        <div className="toolbar-tooltip">
          <span className="toolbar-tooltip-label">{def.label}</span>
          <span className="toolbar-tooltip-desc">{def.description}</span>
          <span className="toolbar-tooltip-hint">Drag onto canvas or click</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-1.5 glass-panel flex flex-col gap-1.5">
      {SELECT_TOOLS.map(renderSelectButton)}

      <div className="h-px bg-white/5 mx-2 my-1"></div>

      <div className="palette-scroll flex flex-col gap-1.5">
        {CAPABILITY_LIST.map((def) => renderNodeButton(def.type))}
      </div>

      <div className="h-px bg-white/5 mx-2 my-1"></div>

      <button
        id="tool-grid-btn"
        className={`toolbar-btn ${showGrid ? 'active-tool' : ''}`}
        onClick={() => setShowGrid(!showGrid)}
        aria-pressed={showGrid}
        title={showGrid ? 'Hide grid' : 'Show grid'}
      >
        <iconify-icon icon="lucide:layout-grid"></iconify-icon>
      </button>
      <button
        id="tool-star-btn"
        className={`toolbar-btn ${saving ? 'active-tool' : ''}`}
        onClick={() => void saveToProject()}
        aria-pressed={saving}
        title="Save to project"
      >
        <iconify-icon icon={saving ? 'lucide:loader-circle' : 'lucide:star'}></iconify-icon>
      </button>
    </div>
  )
}
