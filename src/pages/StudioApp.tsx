import { useEffect, useRef } from 'react'
import BrainCanvas from '../components/canvas/BrainCanvas'
import Header from '../components/Header'
import Toolbar from '../components/Toolbar'
import AgentLog from '../components/AgentLog'
import PromptBar from '../components/PromptBar'
import BottomControls from '../components/BottomControls'
import FineTuneConfirmModal from '../components/FineTuneConfirmModal'
import BrainTitle from '../components/BrainTitle'
import ThinkingPill from '../components/ThinkingPill'
import Narrator from '../components/Narrator'
import QuestionCard from '../components/QuestionCard'
import KeyRequestCard from '../components/KeyRequestCard'
import NodePalette from '../components/NodePalette'
import ModelHub from '../components/ModelHub'
import { runShortcut } from '../components/keyboardShortcuts'
import { useBrainStore } from '../store/useBrainStore'
import { updateProject, buildProjectData } from '../core/projects/projectsRepository'
import { loadSharedBrain } from '../core/brainIo'

export default function StudioApp() {
  const zoomRef = useRef<HTMLDivElement>(null)
  const projectId = useBrainStore((state) => state.projectId)
  const projectPrompt = useBrainStore((state) => state.projectPrompt)
  const projectOwnerId = useBrainStore((state) => state.projectOwnerId)
  const nodes = useBrainStore((state) => state.nodes)
  const connections = useBrainStore((state) => state.connections)
  const generating = useBrainStore((state) => state.generating)

  // Runs once per opened project: if the project has a prompt but no brain
  // yet, kick off generation here in the studio where the thinking pill can
  // stream the reasoning, then persist the result. A shared #brain= link takes
  // priority and loads the graph instead of generating. Keyed to projectId so
  // opening a second empty project still auto-generates (the old module-level
  // flag made every project after the first render a blank canvas).
  const seededProjectRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (seededProjectRef.current === projectId) return
    seededProjectRef.current = projectId
    const state = useBrainStore.getState()
    if (state.nodes.length > 0) return
    if (loadSharedBrain()) return
    const prompt =
      state.projectPrompt ??
      'a research assistant with memory that browses the web, reads files, and produces a report'
    state.generateFromPrompt(prompt, { width: window.innerWidth, height: window.innerHeight })
  }, [projectId])

  // Keep the open project saved whenever the brain changes (once generation
  // settles). Debounced so dragging nodes or typing in the inspector doesn't
  // hammer Supabase with a write per keystroke. Previously the save ran at
  // most once per mount, silently dropping every edit made afterwards.
  useEffect(() => {
    if (!projectId || !projectOwnerId || generating || nodes.length === 0) return
    const timer = window.setTimeout(() => {
      void updateProject(projectOwnerId, projectId, {
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
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [projectId, projectPrompt, projectOwnerId, nodes, connections, generating])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      runShortcut(e)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="min-h-screen relative overflow-hidden">
      <BrainCanvas zoomDisplayRef={zoomRef} />
      <BrainTitle />
      <ThinkingPill />
      <Narrator />
      <QuestionCard />
      <KeyRequestCard />
      <NodePalette />
      <ModelHub />
      <FineTuneConfirmModal />

      {/* UI Layer */}
      <div className="ui-layer flex flex-col justify-between h-full p-6">
        <Header />

        <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-auto">
          <Toolbar />
        </div>

        {/* Bottom UI Section */}
        <div className="flex items-end justify-between w-full pointer-events-auto relative">
          <AgentLog />
          <PromptBar />
          <BottomControls zoomRef={zoomRef} />
        </div>
      </div>
    </div>
  )
}
