import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../core/auth/useAuth'
import { useNavigation } from '../core/navigation'
import { useBrainStore } from '../store/useBrainStore'
import ProviderPill from '../components/ProviderPill'
import {
  listProjects,
  createProject,
  deleteProject,
  listSharedProjects,
  buildProjectData,
} from '../core/projects/projectsRepository'
import {
  listGuestProjects,
  saveGuestProject,
  deleteGuestProject,
} from '../core/projects/guestProjectsRepository'
import type { GuestProject } from '../core/projects/guestProjectsRepository'
import type { BrainProject } from '../core/projects/projectsRepository'
import './dashboard.css'

const SUGGESTIONS = [
  'a research assistant with memory that browses the web and writes reports',
  'a customer-support copilot that reads your docs and answers questions',
  'a sales agent that drafts outreach emails from a CRM export',
]

const EXAMPLES = [
  { name: 'Aether Academy', prompt: 'a coding tutor brain that quizzes you and explains answers' },
  { name: 'Resim', prompt: 'an interior design brain that suggests layouts from a room photo' },
  { name: 'To-Do App', prompt: 'a smart to-do brain that plans your day by priority' },
  { name: 'Travel Planner', prompt: 'a travel brain that builds an itinerary from a budget' },
]

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`
  return `${Math.floor(months / 12)}y`
}

function titleFromPrompt(prompt: string): string {
  const trimmed = prompt.replace(/\s+/g, ' ').trim()
  const firstSentence = trimmed.split(/[.!?\n]/)[0].trim()
  const words = firstSentence.split(' ')
  if (words.length <= 5) return firstSentence || 'Untitled Brain'
  return `${words.slice(0, 5).join(' ')}…`
}

function groupByRecency(projects: BrainProject[]): Array<{ label: string; items: BrainProject[] }> {
  const now = Date.now()
  const day = 86400000
  const recent = projects.filter((p) => now - new Date(p.updated_at).getTime() <= 7 * day)
  const last30 = projects.filter((p) => {
    const t = now - new Date(p.updated_at).getTime()
    return t > 7 * day && t <= 30 * day
  })
  const thisYear = projects.filter((p) => {
    const t = now - new Date(p.updated_at).getTime()
    return t > 30 * day && new Date(p.updated_at).getFullYear() === new Date().getFullYear()
  })
  const groups: Array<{ label: string; items: BrainProject[] }> = []
  if (recent.length) groups.push({ label: 'Recent', items: recent })
  if (last30.length) groups.push({ label: 'Last 30 days', items: last30 })
  if (thisYear.length) groups.push({ label: 'This Year', items: thisYear })
  return groups
}

function ProjectThumb({ project }: { readonly project: BrainProject }) {
  if (project.thumbnail_url) {
    return (
      <span className="dashboard-thumb overflow-hidden">
        <img src={project.thumbnail_url} alt="" className="dashboard-thumb-image" />
      </span>
    )
  }
  const palette = [
    'linear-gradient(135deg,#0ea5e9,#8b5cf6)',
    'linear-gradient(135deg,#14b8a6,#0ea5e9)',
    'linear-gradient(135deg,#f59e0b,#ef4444)',
    'linear-gradient(135deg,#10b981,#14b8a6)',
    'linear-gradient(135deg,#8b5cf6,#ec4899)',
  ]
  const hash = [...project.id].reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return (
    <span
      className="dashboard-thumb flex items-center justify-center text-[11px] font-black text-black/80"
      style={{ background: palette[hash % palette.length] }}
    >
      {(project.name.trim().charAt(0) || 'B').toUpperCase()}
    </span>
  )
}

export default function DashboardPage() {
  const { user, guest, signOut } = useAuth()
  const { go } = useNavigation()
  const [tab, setTab] = useState<'mine' | 'shared'>('mine')
  const [query, setQuery] = useState('')
  const [projects, setProjects] = useState<BrainProject[]>([])
  const [guestProjects, setGuestProjects] = useState<GuestProject[]>([])
  const [loading, setLoading] = useState(true)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [showBanner, setShowBanner] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshSeq = useRef(0)
  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current
    setLoading(true)
    setError(null)
    try {
      if (guest) {
        setGuestProjects(listGuestProjects())
      } else {
        const rows = tab === 'shared' ? await listSharedProjects() : await listProjects(user?.id ?? '')
        if (refreshSeq.current === seq) setProjects(rows)
      }
    } catch (e) {
      if (refreshSeq.current === seq) {
        setError(e instanceof Error ? e.message : 'Failed to load projects')
      }
    } finally {
      if (refreshSeq.current === seq) setLoading(false)
    }
  }, [tab, user?.id, guest])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Guests get a local project list (the same grid, backed by localStorage).
  const guestRows = useMemo<BrainProject[]>(
    () =>
      guestProjects.map((p) => ({
        id: p.id,
        user_id: 'guest',
        name: p.name,
        description: p.description,
        thumbnail_url: null,
        is_shared: false,
        data: { prompt: p.data?.prompt, brain: p.data?.brain },
        created_at: p.updatedAt,
        updated_at: p.updatedAt,
      })),
    [guestProjects],
  )

  const rows = guest ? guestRows : projects

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q),
    )
  }, [rows, query])

  const groups = useMemo(() => groupByRecency(filtered), [filtered])

  const openProject = useCallback(
    (project: BrainProject) => {
      const store = useBrainStore.getState()
      // Always reset the canvas so a project without a stored brain never
      // leaks the previous project's nodes onto the new project.
      store.setBrain(project.data.brain ?? { nodes: [], connections: [] })
      store.setProject({
        id: project.id,
        name: project.name,
        prompt: project.data.prompt ?? null,
        ownerId: project.user_id,
      })
      go('studio')
    },
    [go],
  )

  const createFromPrompt = useCallback(
    async (raw?: string) => {
      const text = (raw ?? prompt).trim()
      if (!text || busy || (!user && !guest)) return
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        if (guest) {
          const project = saveGuestProject({
            name: titleFromPrompt(text),
            description: text,
            data: buildProjectData(text, [], []),
          })
          const store = useBrainStore.getState()
          store.setBrain({ nodes: [], connections: [] })
          store.setProject({ id: project.id, name: project.name, prompt: text, ownerId: 'guest' })
          setGuestProjects(listGuestProjects())
          go('studio')
          return
        }
        if (!user) return
        const project = await createProject(user.id, {
          name: titleFromPrompt(text),
          description: text,
          data: buildProjectData(text, [], []),
        })
        const store = useBrainStore.getState()
        // Reset the canvas so the fresh project doesn't inherit the previous
        // project's nodes/connections (mirrors openProject).
        store.setBrain({ nodes: [], connections: [] })
        store.setProject({
          id: project.id,
          name: project.name,
          prompt: text,
          ownerId: user.id,
        })
        go('studio')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to create project')
      } finally {
        setBusy(false)
      }
    },
    [busy, go, prompt, user, guest],
  )

  const removeProject = useCallback(
    async (project: BrainProject) => {
      if (!window.confirm(`Delete "${project.name}"?`)) return
      if (guest) {
        deleteGuestProject(project.id)
        setGuestProjects(listGuestProjects())
        return
      }
      if (!user) return
      try {
        await deleteProject(user.id, project.id)
        setProjects((prev) => prev.filter((p) => p.id !== project.id))
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Failed to delete project')
      }
    },
    [user, guest],
  )

  const onTabChange = (next: 'mine' | 'shared') => {
    setTab(next)
    setQuery('')
  }

  const avatarLetter = (user?.email?.trim().charAt(0) ?? 'G').toUpperCase()
  const avatarUrl =
    (user?.user_metadata?.avatar_url as string | undefined) ??
    (user?.user_metadata?.picture as string | undefined)

  return (
    <div className="dashboard-root h-screen overflow-hidden flex relative">
      <div className="dashboard-dot-grid"></div>

      {/* Sidebar */}
      <aside className="w-[300px] shrink-0 h-full flex flex-col border-r border-[rgba(255,255,255,0.08)] bg-[#0e0e0e]/80 backdrop-blur-xl relative z-10">
        <div className="flex items-center gap-3 px-6 h-16 shrink-0 border-b border-[rgba(255,255,255,0.06)]">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <iconify-icon icon="lucide:brain" className="text-black text-xl"></iconify-icon>
          </div>
          <span className="text-xl font-black tracking-tighter">OpenBrain</span>
          <span className="px-2 py-0.5 bg-white/10 text-white/60 text-[9px] font-bold rounded-full border border-white/10 tracking-widest">
            BETA
          </span>
        </div>

        <div className="flex gap-1 p-3 shrink-0">
          {(
            guest
              ? [
                  { id: 'mine' as const, label: 'Local Brains', icon: 'lucide:layout-grid' },
                ]
              : [
                  { id: 'mine' as const, label: 'My Projects', icon: 'lucide:layout-grid' },
                  { id: 'shared' as const, label: 'Shared', icon: 'lucide:users' },
                ]
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`dashboard-tab flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold ${
                tab === item.id ? 'dashboard-tab-active' : 'text-white/40 hover:text-white'
              }`}
            >
              <iconify-icon icon={item.icon} className="text-base"></iconify-icon>
              {item.label}
            </button>
          ))}
        </div>

        <div className="px-4 pb-2 shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] focus-within:border-white/15 transition-colors">
            <iconify-icon icon="lucide:search" className="text-white/30 text-sm"></iconify-icon>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects"
              className="bg-transparent text-sm outline-none placeholder:text-white/25 w-full"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto dashboard-scroll px-3 pb-4">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-16 text-white/30">
              <div className="w-7 h-7 rounded-full border-2 border-white/15 border-t-teal-500 animate-spin"></div>
              <span className="text-xs">Loading…</span>
            </div>
          ) : groups.length === 0 && tab === 'mine' ? (
            <div className="px-4 py-14 text-center">
              <iconify-icon icon="lucide:folder-open" className="text-white/15 text-4xl"></iconify-icon>
              <p className="mt-4 text-sm text-white/40 font-medium">No projects yet.</p>
              <p className="mt-1 text-xs text-white/25">Describe a brain above to get started.</p>
            </div>
          ) : groups.length === 0 && tab === 'shared' ? (
            <div className="px-4 py-14 text-center">
              <iconify-icon icon="lucide:users" className="text-white/15 text-4xl"></iconify-icon>
              <p className="mt-4 text-sm text-white/40 font-medium">Nothing shared with you.</p>
              <p className="mt-1 text-xs text-white/25">Shared brains from your team appear here.</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="mb-4">
                <p className="px-2 pt-3 pb-1 text-[10px] font-black uppercase tracking-widest text-white/25">
                  {group.label}
                </p>
                {group.items.map((project) => (
                  <div
                    key={project.id}
                    className="dashboard-item group flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer"
                    onClick={() => openProject(project)}
                  >
                    <ProjectThumb project={project} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white/85 truncate leading-tight">
                        {project.name}
                      </p>
                      <p className="text-[10px] text-white/30">{relativeTime(project.updated_at)}</p>
                    </div>
                    {tab === 'mine' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          void removeProject(project)
                        }}
                        className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all"
                        aria-label="Delete project"
                      >
                        <iconify-icon icon="lucide:trash-2" className="text-sm"></iconify-icon>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}

          <div className="mb-4">
            <p className="px-2 pt-3 pb-1 text-[10px] font-black uppercase tracking-widest text-white/25">
              Examples
            </p>
            {EXAMPLES.map((example) => (
              <div
                key={example.name}
                className="dashboard-item flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer"
                onClick={() => {
                  setPrompt(example.prompt)
                  setNotice(null)
                }}
              >
                <span className="dashboard-thumb flex items-center justify-center text-[11px] font-black text-black/80 bg-gradient-to-br from-white/30 to-white/10">
                  <iconify-icon icon="lucide:sparkles" className="text-xs"></iconify-icon>
                </span>
                <p className="text-sm font-semibold text-white/85 truncate">{example.name}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 h-full flex flex-col min-w-0 relative z-10">
        <header className="h-16 shrink-0 flex items-center justify-between px-6 border-b border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center gap-1">
            {['lucide:book-open', 'mdi:github', 'simple-icons:x', 'lucide:gift'].map((icon) => (
              <button
                key={icon}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-all"
              >
                <iconify-icon icon={icon} className="text-base"></iconify-icon>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => void signOut().then(() => go('landing'))}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white/40 hover:text-white hover:bg-white/5 transition-all"
            >
              <iconify-icon icon="lucide:log-out" className="text-sm"></iconify-icon>
              Sign out
            </button>
            <div className="flex items-center gap-3">
              <span className="max-w-[180px] truncate text-xs font-semibold text-white/40">
                {guest ? 'Guest' : user?.email}
              </span>
              <div className="avatar-ring ml-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={user?.email ?? 'Account'}
                    className="w-9 h-9 rounded-full object-cover border-2 border-[#0e0e0e] shadow-lg"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-sm border-2 border-[#0e0e0e] shadow-lg">
                    {avatarLetter}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto dashboard-scroll">
          <div className="max-w-4xl mx-auto px-8 py-10 pb-32">
            {showBanner && (
              <div className="flex items-center gap-3 mb-10 px-4 py-2.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-sm text-white/60">
                <iconify-icon
                  icon={guest ? 'lucide:laptop' : 'lucide:sparkles'}
                  className={`text-sm ${guest ? 'text-teal-400' : 'text-teal-400'}`}
                ></iconify-icon>
                <span className="flex-1">
                  {guest
                    ? 'Guest mode — brains, memory and files stay on this machine.'
                    : 'OpenBrain developer preview'}
                </span>
                <button
                  onClick={() => setShowBanner(false)}
                  className="text-white/30 hover:text-white transition-colors"
                  aria-label="Dismiss"
                >
                  <iconify-icon icon="lucide:x" className="text-sm"></iconify-icon>
                </button>
              </div>
            )}

            <h1 className="text-5xl font-black tracking-tighter leading-tight">
              Welcome to OpenBrain..
            </h1>

            <div className="mt-8 bg-[#111111] rounded-2xl border border-[rgba(255,255,255,0.08)] p-6 focus-within:border-[rgba(255,255,255,0.18)] transition-colors">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void createFromPrompt()
                }}
                placeholder="What AI brain shall we design?"
                className="w-full h-24 bg-transparent resize-none outline-none text-lg text-white placeholder:text-white/25 leading-relaxed"
              />
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-3">
                  <ProviderPill />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all"
                    aria-label="Wand"
                  >
                    <iconify-icon icon="lucide:wand-2" className="text-lg"></iconify-icon>
                  </button>
                  <button
                    onClick={() => void createFromPrompt()}
                    disabled={busy || !prompt.trim()}
                    className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:scale-105 transition-transform disabled:opacity-30 disabled:scale-100"
                    aria-label="Generate"
                  >
                    <iconify-icon
                      icon={busy ? 'lucide:loader-circle' : 'lucide:arrow-up'}
                      className={`text-lg ${busy ? 'animate-spin' : ''}`}
                    ></iconify-icon>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setPrompt(suggestion)}
                  className="px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-white/50 hover:text-white hover:border-white/20 transition-all"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {error && (
              <div className="mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                <iconify-icon icon="lucide:triangle-alert" className="shrink-0"></iconify-icon>
                {error}
              </div>
            )}
            {notice && (
              <div className="mt-4 px-4 py-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 text-sm flex items-center gap-2">
                <iconify-icon icon="lucide:info" className="shrink-0"></iconify-icon>
                {notice}
              </div>
            )}
          </div>
        </div>

        <div className="absolute bottom-6 right-6 z-20">
          <button
            className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all shadow-xl"
            aria-label="Help"
          >
            <iconify-icon icon="lucide:monitor" className="text-lg"></iconify-icon>
          </button>
        </div>
      </main>
    </div>
  )
}
