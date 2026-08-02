import { create } from 'zustand'
import type {
  BrainNode,
  BrainSpec,
  CapabilityType,
  Connection,
  EditorMode,
  LogEntry,
  LogLevel,
  ViewState,
} from '../core/types'
import type { ProviderId } from '../core/domain'
import type { FineTuneJobSpec } from '../core/finetune'
import { generateFromPrompt as generateFromArchitect } from '../components/canvas/architectAdapter'

const PROVIDER_STORAGE_KEY = 'pixel-academy:active-provider'

function loadActiveProvider(): ProviderId {
  try {
    const value = localStorage.getItem(PROVIDER_STORAGE_KEY)
    if (value === 'ollama' || value === 'fireworks') return value
  } catch {
    /* ignore */
  }
  return 'fireworks'
}

function persistActiveProvider(providerId: ProviderId): void {
  try {
    localStorage.setItem(PROVIDER_STORAGE_KEY, providerId)
  } catch {
    /* ignore */
  }
}

const now = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

let generationController: AbortController | null = null

const INITIAL_LOGS: LogEntry[] = []

let logCounter = 0
const makeLog = (message: string, level: LogLevel): LogEntry => {
  logCounter += 1
  return { id: `log-${logCounter}`, message, time: now(), level }
}

const generateId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

interface Snapshot {
  nodes: BrainNode[]
  connections: Connection[]
}

export interface ClipboardData {
  nodes: BrainNode[]
  connections: Connection[]
}

export interface KeyRequest {
  toolId: string
  name: string
  description: string
  instructions: string[]
  envHint: string
}

export interface ClarifyState {
  prompt: string
  questions: string[]
  viewport: { width: number; height: number }
}

function snapshot(nodes: BrainNode[], connections: Connection[]): Snapshot {
  return {
    nodes: nodes.map((node) => ({ ...node, status: 'idle', output: undefined, error: undefined })),
    connections: connections.map((connection) => ({ ...connection })),
  }
}

export function canConnect(
  connections: Connection[],
  from: string,
  fromPort: string,
  to: string,
  toPort: string,
): boolean {
  if (!from || !fromPort || !to || !toPort) return false
  if (from === to) return false
  return !connections.some(
    (connection) =>
      connection.from === from &&
      connection.fromPort === fromPort &&
      connection.to === to &&
      connection.toPort === toPort,
  )
}

export interface BrainStore {
  view: ViewState
  mode: EditorMode
  selectedNodeIds: string[]
  nodes: BrainNode[]
  connections: Connection[]
  clipboard: ClipboardData | null
  logs: LogEntry[]
  running: boolean
  generating: boolean
  fitToken: number
  activeProviderId: ProviderId
  pendingFineTune: FineTuneJobSpec | null
  projectId: string | null
  projectName: string | null
  projectPrompt: string | null
  projectOwnerId: string | null
  brainTitle: string
  thinking: string
  lastReasoning: string
  generationError: string | null
  pendingQuestion: string | null
  pendingKeyRequest: KeyRequest | null
  clarify: ClarifyState | null
  past: Snapshot[]
  future: Snapshot[]

  setProject: (meta: {
    id: string | null
    name?: string | null
    prompt?: string | null
    ownerId?: string | null
  }) => void
  setBrainTitle: (title: string) => void
  setThinking: (text: string) => void
  setLastReasoning: (text: string) => void
  setGenerationError: (error: string | null) => void
  setPendingQuestion: (question: string | null) => void
  setPendingKeyRequest: (request: KeyRequest | null) => void
  setClarify: (state: ClarifyState | null) => void
  setView: (view: Partial<ViewState>) => void
  setMode: (mode: EditorMode) => void
  setSelection: (ids: string[]) => void
  setRunning: (running: boolean) => void
  setActiveProvider: (providerId: ProviderId) => void
  setPendingFineTune: (spec: FineTuneJobSpec | null) => void
  addLog: (message: string, level?: LogLevel) => void
  setNode: (id: string, patch: Partial<BrainNode>) => void
  moveNode: (id: string, x: number, y: number) => void
  resetStatuses: () => void

  setBrain: (spec: BrainSpec) => void
  generateFromPrompt: (prompt: string, viewport: { width: number; height: number }) => void
  submitClarify: (answers: string[]) => void
  stopGeneration: () => void
  addNode: (type: CapabilityType, x: number, y: number) => void
  removeElements: (nodeIds: string[], connectionIds: string[]) => void
  removeNodes: (ids: string[]) => void
  removeConnections: (ids: string[]) => void

  connectConnection: (from: string, fromPort: string, to: string, toPort: string) => void

  copySelection: () => void
  paste: () => void

  commit: () => void
  undo: () => void
  redo: () => void
}

const DEFAULT_VIEW: ViewState = { scale: 1, x: 0, y: 0 }

export const useBrainStore = create<BrainStore>((set, get) => ({
  view: DEFAULT_VIEW,
  mode: 'select',
  selectedNodeIds: [],
  nodes: [],
  connections: [],
  clipboard: null,
  logs: INITIAL_LOGS,
  running: false,
  generating: false,
  fitToken: 0,
  activeProviderId: loadActiveProvider(),
  pendingFineTune: null,
  projectId: null,
  projectName: null,
  projectPrompt: null,
  projectOwnerId: null,
  brainTitle: '',
  thinking: '',
  lastReasoning: '',
  generationError: null,
  pendingQuestion: null,
  pendingKeyRequest: null,
  clarify: null,
  past: [],
  future: [],

  setProject: (meta) =>
    set({
      projectId: meta.id,
      projectName: meta.id ? (meta.name ?? null) : null,
      projectPrompt: meta.id ? (meta.prompt ?? null) : null,
      projectOwnerId: meta.id ? (meta.ownerId ?? null) : null,
    }),
  setBrainTitle: (brainTitle) => set({ brainTitle }),
  setThinking: (thinking) => set({ thinking }),
  setLastReasoning: (lastReasoning) => set({ lastReasoning }),
  setGenerationError: (generationError) => set({ generationError }),
  setPendingQuestion: (pendingQuestion) => set({ pendingQuestion }),
  setPendingKeyRequest: (pendingKeyRequest) => set({ pendingKeyRequest }),
  setClarify: (clarify) => set({ clarify }),
  setView: (view) => set((state) => ({ view: { ...state.view, ...view } })),

  setMode: (mode) => set({ mode }),

  setSelection: (selectedNodeIds) => set({ selectedNodeIds }),

  setRunning: (running) => set({ running }),

  setActiveProvider: (activeProviderId) => {
    persistActiveProvider(activeProviderId)
    set({ activeProviderId })
  },

  setPendingFineTune: (pendingFineTune) => set({ pendingFineTune }),

  addLog: (message, level = 'info') =>
    set((state) => ({ logs: [...state.logs.slice(-49), makeLog(message, level)] })),

  setNode: (id, patch) =>
    set((state) => ({
      nodes: state.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
    })),

  moveNode: (id, x, y) =>
    set((state) => ({
      nodes: state.nodes.map((node) => (node.id === id ? { ...node, x, y } : node)),
    })),

  resetStatuses: () =>
    set((state) => ({ nodes: state.nodes.map((node) => stripRuntime(node)) })),

  setBrain: (spec) =>
    set((state) => {
      const nodes: BrainNode[] = spec.nodes.map((node) => ({ ...node, status: 'idle' }))
      const connections = spec.connections.map((connection) => ({ ...connection }))
      const snapshotCurrent = snapshot(state.nodes, state.connections)
      const past = state.nodes.length > 0 ? [...state.past, snapshotCurrent] : state.past
      return {
        nodes,
        connections,
        selectedNodeIds: [],
        thinking: '',
        fitToken: state.fitToken + 1,
        past,
        future: [],
      }
    }),

  generateFromPrompt: (prompt, viewport) => {
    if (get().generating) return
    generationController?.abort()
    const controller = new AbortController()
    generationController = controller
    set({ generating: true })
    void generateFromArchitect(prompt, viewport, controller.signal).finally(() => {
      if (generationController === controller) generationController = null
      set({ generating: false })
    })
  },

  submitClarify: (answers) => {
    const state = get()
    const clarify = state.clarify
    if (!clarify || state.generating) return
    set({ clarify: null, generating: true })
    generationController?.abort()
    void generateFromArchitect(clarify.prompt, clarify.viewport, undefined, answers).finally(() => {
      generationController = null
      set({ generating: false })
    })
  },

  stopGeneration: () => {
    generationController?.abort()
    generationController = null
    set({ generating: false, thinking: '' })
  },

  addNode: (type, x, y) =>
    set((state) => {
      const node: BrainNode = { id: generateId('node'), type, x, y, status: 'idle' }
      return {
        nodes: [...state.nodes, node],
        selectedNodeIds: [node.id],
        past: [...state.past, snapshot(state.nodes, state.connections)],
        future: [],
      }
    }),

  removeElements: (nodeIds, connectionIds) =>
    set((state) => {
      const nodeIdSet = new Set(nodeIds)
      const connectionIdSet = new Set(connectionIds)
      const nodes = state.nodes.filter((node) => !nodeIdSet.has(node.id))
      const connections = state.connections.filter(
        (connection) =>
          !connectionIdSet.has(connection.id) &&
          !nodeIdSet.has(connection.from) &&
          !nodeIdSet.has(connection.to),
      )
      if (nodes.length === state.nodes.length && connections.length === state.connections.length) {
        return state
      }
      return {
        nodes,
        connections,
        selectedNodeIds: state.selectedNodeIds.filter((id) => !nodeIdSet.has(id)),
        past: [...state.past, snapshot(state.nodes, state.connections)],
        future: [],
      }
    }),

  removeNodes: (ids) => get().removeElements(ids, []),

  removeConnections: (ids) => get().removeElements([], ids),

  connectConnection: (from, fromPort, to, toPort) =>
    set((state) => {
      if (!canConnect(state.connections, from, fromPort, to, toPort)) return state
      const connection: Connection = { id: generateId('conn'), from, fromPort, to, toPort }
      return {
        connections: [...state.connections, connection],
        past: [...state.past, snapshot(state.nodes, state.connections)],
        future: [],
      }
    }),

  copySelection: () =>
    set((state) => {
      const selected = new Set(state.selectedNodeIds)
      if (selected.size === 0) return state
      const nodes = state.nodes
        .filter((node) => selected.has(node.id))
        .map((node) => ({ ...node }))
      const idSet = new Set(nodes.map((node) => node.id))
      const connections = state.connections
        .filter((connection) => idSet.has(connection.from) && idSet.has(connection.to))
        .map((connection) => ({ ...connection }))
      return { clipboard: { nodes, connections } }
    }),

  paste: () =>
    set((state) => {
      if (!state.clipboard || state.clipboard.nodes.length === 0) return state
      const idMap = new Map<string, string>()
      const nodes = state.clipboard.nodes.map((node) => {
        const id = generateId('node')
        idMap.set(node.id, id)
        return {
          ...node,
          id,
          x: node.x + 40,
          y: node.y + 40,
          status: 'idle' as const,
          output: undefined,
          error: undefined,
        }
      })
      const connections = state.clipboard.connections.map((connection) => ({
        ...connection,
        id: generateId('conn'),
        from: idMap.get(connection.from) ?? connection.from,
        to: idMap.get(connection.to) ?? connection.to,
      }))
      return {
        nodes: [...state.nodes, ...nodes],
        connections: [...state.connections, ...connections],
        selectedNodeIds: nodes.map((node) => node.id),
        past: [...state.past, snapshot(state.nodes, state.connections)],
        future: [],
      }
    }),

  commit: () =>
    set((state) => ({
      past: [...state.past, snapshot(state.nodes, state.connections)],
      future: [],
    })),

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]
      const future = [snapshot(state.nodes, state.connections), ...state.future]
      return {
        nodes: previous.nodes,
        connections: previous.connections,
        past: state.past.slice(0, -1),
        future,
        selectedNodeIds: [],
      }
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return state
      const next = state.future[0]
      const past = [...state.past, snapshot(state.nodes, state.connections)]
      return {
        nodes: next.nodes,
        connections: next.connections,
        past,
        future: state.future.slice(1),
        selectedNodeIds: [],
      }
    }),
}))

function stripRuntime(node: BrainNode): BrainNode {
  return { ...node, status: 'idle', output: undefined, error: undefined }
}
