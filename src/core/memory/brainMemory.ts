import { supabase } from '../auth/supabase'

// Cross-run memory: persists a memory node's value per project so the LLM on a
// later run can build on what it produced before. Backed by Supabase (the
// projects.data JSON column) when the backend is configured, falling back to
// localStorage for the offline demo. The API key for a node is never stored —
// only the memory value.

const LOCAL_KEY = 'openbrain:memory'

interface MemoryEntry {
  nodeId: string
  value: string
  updatedAt: string
}

function readLocal(): MemoryEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as MemoryEntry[]) : []
  } catch {
    return []
  }
}

function writeLocal(entries: MemoryEntry[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(entries))
  } catch {
    /* ignore */
  }
}

async function readRemote(projectId: string): Promise<MemoryEntry[]> {
  const db = supabase
  if (!db) return []
  try {
    const { data } = await db
      .from('projects')
      .select('data')
      .eq('id', projectId)
      .maybeSingle()
    const brain = (data?.data as Record<string, unknown> | undefined)?.brain
    if (!brain || typeof brain !== 'object') return []
    const entries = (brain as Record<string, unknown>)['memory']
    return Array.isArray(entries) ? (entries as MemoryEntry[]) : []
  } catch {
    return []
  }
}

async function writeRemote(projectId: string, entries: MemoryEntry[]): Promise<void> {
  const db = supabase
  if (!db) return
  try {
    const { data } = await db.from('projects').select('data').eq('id', projectId).maybeSingle()
    const rawData = (data?.data as Record<string, unknown> | undefined) ?? {}
    const brain = (rawData['brain'] as Record<string, unknown> | undefined) ?? {}
    const nextData = { ...rawData, brain: { ...brain, memory: entries } }
    await db.from('projects').update({ data: nextData }).eq('id', projectId)
  } catch {
    /* non-fatal */
  }
}

export interface BrainMemoryStore {
  read(projectId: string): Promise<MemoryEntry[]>
  write(projectId: string, entries: MemoryEntry[]): Promise<void>
}

export function createBrainMemoryStore(): BrainMemoryStore {
  return {
    async read(projectId: string) {
      if (projectId) {
        const remote = await readRemote(projectId)
        if (remote.length > 0) return remote
      }
      return readLocal()
    },
    async write(projectId: string, entries: MemoryEntry[]) {
      writeLocal(entries)
      if (projectId) await writeRemote(projectId, entries)
    },
  }
}

// Convenience singleton shared by executors.
let store: BrainMemoryStore | null = null
export function getBrainMemoryStore(): BrainMemoryStore {
  store ??= createBrainMemoryStore()
  return store
}
