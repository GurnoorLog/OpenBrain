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
import QuestionCard from '../components/QuestionCard'
import KeyRequestCard from '../components/KeyRequestCard'
import NodePalette from '../components/NodePalette'
import { runShortcut } from '../components/keyboardShortcuts'
import { useBrainStore } from '../store/useBrainStore'
import { updateProject, buildProjectData } from '../core/projects/projectsRepository'

let seeded = false

export default function StudioApp() {
  const zoomRef = useRef<HTMLDivElement>(null)
  const projectId = useBrainStore((state) => state.projectId)
  const projectPrompt = useBrainStore((state) => state.projectPrompt)
  const projectOwnerId = useBrainStore((state) => state.projectOwnerId)
  const nodes = useBrainStore((state) => state.nodes)
  const connections = useBrainStore((state) => state.connections)
  const generating = useBrainStore((state) => state.generating)

  // First mount only: if we opened a fresh project (has a prompt but no brain)
  // or no project at all, kick off generation here in the studio where the
  // thinking pill can stream the reasoning, then persist the result.
  useEffect(() => {
    if (seeded) return
    seeded = true
    const state = useBrainStore.getState()
    if (state.nodes.length > 0) return
    const prompt =
      state.projectPrompt ??
      'a research assistant with memory that browses the web, reads files, and produces a report'
    state.generateFromPrompt(prompt, { width: window.innerWidth, height: window.innerHeight })
  }, [])

  // Once a fresh generation completes (nodes appear + not generating), save the
  // brain back to the open project so it survives a reload.
  const savedRef = useRef(false)
  useEffect(() => {
    if (savedRef.current) return
    if (!projectId || !projectOwnerId || generating || nodes.length === 0) return
    savedRef.current = true
    void updateProject(projectOwnerId, projectId, {
      data: buildProjectData(
        projectPrompt ?? '',
        nodes.map(({ id, type, x, y, content }) => ({ id, type, x, y, content })),
        connections,
      ),
    })
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
      <QuestionCard />
      <KeyRequestCard />
      <NodePalette />
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
