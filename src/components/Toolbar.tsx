import { useState } from 'react'
import type { EditorMode } from '../core/types'
import { useBrainStore } from '../store/useBrainStore'
import { useAuth } from '../core/auth/useAuth'
import { updateProject, buildProjectData } from '../core/projects/projectsRepository'

const SELECT_TOOLS: { id: string; icon: string; mode: EditorMode; label: string }[] = [
  { id: 'select', icon: 'lucide:mouse-pointer-2', mode: 'select', label: 'Select' },
  { id: 'pan', icon: 'lucide:hand', mode: 'pan', label: 'Pan canvas' },
]

export default function Toolbar() {
  const mode = useBrainStore((state) => state.mode)
  const setMode = useBrainStore((state) => state.setMode)
  const paletteOpen = useBrainStore((state) => state.paletteOpen)
  const setPaletteOpen = useBrainStore((state) => state.setPaletteOpen)
  const hubOpen = useBrainStore((state) => state.hubOpen)
  const setHubOpen = useBrainStore((state) => state.setHubOpen)
  const setShowGrid = useBrainStore((state) => state.setShowGrid)
  const showGrid = useBrainStore((state) => state.showGrid)
  const { user, guest } = useAuth()
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
      store.addLog(
        guest
          ? 'Guest mode autosaves on this machine — use "Export as .brain" to keep a copy'
          : 'You can only save to projects you own',
        'warning',
      )
      return
    }
    setSaving(true)
    try {
      await updateProject(user.id, projectId, {
        data: buildProjectData(
          projectPrompt ?? '',
          nodes.map(({ id, type, x, y, content, reason, model }) => ({
            id,
            type,
            x,
            y,
            content,
            reason,
            model,
          })),
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

  return (
    <div className="p-1.5 glass-panel flex flex-col gap-1.5">
      {SELECT_TOOLS.map(renderSelectButton)}

      <div className="h-px bg-white/5 mx-2 my-1"></div>

      <button
        id="tool-grid-btn"
        className={`toolbar-btn ${paletteOpen ? 'active-tool' : ''}`}
        onClick={() => setPaletteOpen(!paletteOpen)}
        aria-pressed={paletteOpen}
        title={paletteOpen ? 'Close node palette' : 'Open node palette'}
      >
        <iconify-icon icon="lucide:layout-grid"></iconify-icon>
      </button>

      <button
        id="tool-hub-btn"
        className={`toolbar-btn ${hubOpen ? 'active-tool' : ''}`}
        onClick={() => setHubOpen(!hubOpen)}
        aria-pressed={hubOpen}
        title={hubOpen ? 'Close Model Hub' : 'Open Model Hub — run models in your browser'}
      >
        <iconify-icon icon="lucide:hard-drive-download"></iconify-icon>
      </button>

      <button
        id="tool-showgrid-btn"
        className={`toolbar-btn ${showGrid ? 'active-tool' : ''}`}
        onClick={() => setShowGrid(!showGrid)}
        aria-pressed={showGrid}
        title={showGrid ? 'Hide dot grid' : 'Show dot grid'}
      >
        <iconify-icon icon="lucide:grid-3x3"></iconify-icon>
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
