import { useEffect, useRef, useState } from 'react'
import { runBrain } from './canvas/executionAdapter'
import { exportBrain, shareBrain } from '../core/brainIo'
import { useBrainStore } from '../store/useBrainStore'
import { useAuth } from '../core/auth/useAuth'
import { useNavigation } from '../core/navigation'
import { updateProject } from '../core/projects/projectsRepository'
import { buildProjectData } from '../core/projects/projectsRepository'
import SettingsPanel from './SettingsPanel'

const MENU_ITEMS = [
  { id: 'projects', icon: 'lucide:layout-grid', label: 'My Projects' },
  { id: 'save', icon: 'lucide:save', label: 'Save to project' },
  { id: 'settings', icon: 'lucide:settings', label: 'Settings' },
  { id: 'docs', icon: 'lucide:file-text', label: 'Documentation' },
  { id: 'support', icon: 'lucide:life-buoy', label: 'Support' },
  { id: 'signout', icon: 'lucide:log-out', label: 'Sign out' },
] as const

type MenuItemId = (typeof MENU_ITEMS)[number]['id']

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const running = useBrainStore((state) => state.running)
  const { user, signOut } = useAuth()
  const { go } = useNavigation()

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('click', onClickOutside)
    return () => document.removeEventListener('click', onClickOutside)
  }, [])

  const onMenuItem = async (id: MenuItemId) => {
    if (id === 'settings') {
      setMenuOpen(false)
      setSettingsOpen(true)
    }
    if (id === 'projects') {
      setMenuOpen(false)
      go('dashboard')
    }
    if (id === 'save') {
      setMenuOpen(false)
      const store = useBrainStore.getState()
      const { projectId, projectPrompt, projectOwnerId, nodes, connections } = store
      if (!projectId) {
        store.addLog('No project is open to save', 'warning')
        return
      }
      if (!user || projectOwnerId !== user.id) {
        store.addLog('You can only save to projects you own', 'warning')
        return
      }
      try {
        await updateProject(user.id, projectId, {
          data: buildProjectData(
            projectPrompt ?? '',
            nodes.map(({ id, type, x, y }) => ({ id, type, x, y })),
            connections,
          ),
        })
        store.addLog('Saved to project', 'success')
      } catch (e) {
        store.addLog(e instanceof Error ? e.message : 'Save failed', 'error')
      }
    }
    if (id === 'signout') {
      setMenuOpen(false)
      await signOut()
      go('landing')
    }
  }

  return (
    <header className="flex items-center justify-between pointer-events-auto">
      <div className="flex items-center gap-5">
        <div className="relative group" ref={menuRef}>
          <button
            id="pill-menu-trigger"
            className="pill-menu-btn"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((open) => !open)
            }}
            aria-expanded={menuOpen}
            aria-label="Open menu"
          >
            <div className="pill-inner">
              <div className="dot-black"></div>
              <div className="dot-black"></div>
            </div>
          </button>
          <div
            id="main-menu"
            className={`menu-dropdown absolute top-full left-0 mt-3 w-56 glass-panel p-2 z-50 ${menuOpen ? 'active' : ''}`}
          >
            <div className="flex flex-col gap-1">
              {MENU_ITEMS.map((item) => (
                <button
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                  onClick={() => onMenuItem(item.id)}
                >
                  <iconify-icon icon={item.icon}></iconify-icon>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-2">
          <span className="text-white font-bold tracking-tight text-xl">OpenBrain</span>
          <span className="px-2 py-0.5 bg-teal-500/10 text-teal-400 text-[10px] font-bold uppercase rounded-md border border-teal-500/20">
            Beta
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          id="nav-play-btn"
          className={`toolbar-btn hover:text-teal-400 ${running ? 'opacity-40 pointer-events-none' : ''}`}
          onClick={() => void runBrain()}
          aria-label="Run brain"
          title="Run brain"
        >
          <iconify-icon icon="lucide:play" className="text-xl"></iconify-icon>
        </button>
        <button id="nav-export-btn" className="nav-btn text-gray-300" onClick={exportBrain}>
          <iconify-icon icon="lucide:external-link" className="text-lg"></iconify-icon>
          Export
        </button>
        <button
          id="nav-share-btn"
          className="nav-btn text-gray-300"
          onClick={() => void shareBrain()}
        >
          <iconify-icon icon="lucide:share-2" className="text-lg"></iconify-icon>
          Share
        </button>
        <div className="avatar-ring ml-2">
          <div className="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-sm border-2 border-[#0c0c0c] shadow-lg cursor-pointer hover:scale-105 transition-transform">
            {(user?.email?.trim().charAt(0) ?? 'G').toUpperCase()}
          </div>
        </div>
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  )
}
