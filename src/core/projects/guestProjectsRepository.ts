import type { BrainNodeSpec, Connection } from '../types'

// Guest-mode project persistence. Everything lives in localStorage on this
// machine — nothing touches Supabase. Mirrors the shape of the cloud
// BrainProject so the dashboard can render both from the same grid.

export interface GuestProjectData {
  prompt?: string
  brain?: {
    nodes: BrainNodeSpec[]
    connections: Connection[]
  }
}

export interface GuestProject {
  id: string
  name: string
  description: string | null
  data: GuestProjectData
  updatedAt: string
}

const STORAGE_KEY = 'openbrain:guest:projects'

export function listGuestProjects(): GuestProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as GuestProject[]
    if (!Array.isArray(parsed)) return []
    return parsed.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  } catch {
    return []
  }
}

export function getGuestProject(id: string): GuestProject | null {
  return listGuestProjects().find((p) => p.id === id) ?? null
}

export function saveGuestProject(input: {
  id?: string
  name: string
  description?: string | null
  data?: GuestProjectData
}): GuestProject {
  const projects = listGuestProjects()
  const existing = input.id ? projects.find((p) => p.id === input.id) : undefined
  const project: GuestProject = {
    id: existing?.id ?? `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: input.name.trim() || 'Untitled Brain',
    description: input.description ?? existing?.description ?? null,
    data: input.data ?? existing?.data ?? {},
    updatedAt: new Date().toISOString(),
  }
  const next = [project, ...projects.filter((p) => p.id !== project.id)]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* storage full or unavailable — ignore */
  }
  return project
}

export function deleteGuestProject(id: string): void {
  const next = listGuestProjects().filter((p) => p.id !== id)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}
