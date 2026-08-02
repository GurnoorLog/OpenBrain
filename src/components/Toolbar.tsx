import type { EditorMode } from '../core/types'
import { useBrainStore } from '../store/useBrainStore'

interface ToolDef {
  id: string
  icon: string
  mode?: EditorMode
}

const TOOLS: ToolDef[] = [
  { id: 'ptr', icon: 'lucide:mouse-pointer-2', mode: 'select' },
  { id: 'rect', icon: 'lucide:square' },
  { id: 'draw', icon: 'lucide:pen-tool' },
  { id: 'pan', icon: 'lucide:hand', mode: 'pan' },
  { id: 'img', icon: 'lucide:image' },
]

const EXTRA_TOOLS: ToolDef[] = [
  { id: 'grid', icon: 'lucide:layout-grid' },
  { id: 'star', icon: 'lucide:star' },
]

function isActive(tool: ToolDef, mode: EditorMode): boolean {
  return tool.mode === mode
}

export default function Toolbar() {
  const mode = useBrainStore((state) => state.mode)
  const setMode = useBrainStore((state) => state.setMode)

  const renderButton = (tool: ToolDef) => (
    <button
      key={tool.id}
      id={`tool-${tool.id}-btn`}
      className={`toolbar-btn ${isActive(tool, mode) ? 'active-tool' : ''}`}
      onClick={() => {
        if (tool.mode) setMode(tool.mode)
      }}
      aria-pressed={isActive(tool, mode)}
      title={tool.id === 'ptr' ? 'Select' : tool.id === 'pan' ? 'Pan canvas' : tool.id}
    >
      <iconify-icon icon={tool.icon}></iconify-icon>
    </button>
  )

  return (
    <div className="p-1.5 glass-panel flex flex-col gap-1.5">
      {TOOLS.map(renderButton)}
      <div className="h-px bg-white/5 mx-2 my-1"></div>
      {EXTRA_TOOLS.map(renderButton)}
    </div>
  )
}
