import { supabase } from '../auth/supabase'
import type { BrainNodeSpec, Connection } from '../types'

export interface BrainProjectData {
  prompt?: string
  brain?: {
    nodes: BrainNodeSpec[]
    connections: Connection[]
  }
}

export interface BrainProject {
  id: string
  user_id: string
  name: string
  description: string | null
  thumbnail_url: string | null
  is_shared: boolean
  data: BrainProjectData
  created_at: string
  updated_at: string
}

export interface ProjectInput {
  name: string
  description?: string
  thumbnail_url?: string | null
  is_shared?: boolean
  data?: BrainProjectData
}

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function mapRow(row: Record<string, unknown>): BrainProject {
  const rawData = row.data as Record<string, unknown> | null | undefined
  const brain = rawData?.brain as { nodes?: BrainNodeSpec[]; connections?: Connection[] } | undefined
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    thumbnail_url: row.thumbnail_url == null ? null : String(row.thumbnail_url),
    is_shared: Boolean(row.is_shared),
    data: {
      prompt: typeof rawData?.prompt === 'string' ? rawData.prompt : undefined,
      brain:
        brain && Array.isArray(brain.nodes)
          ? { nodes: brain.nodes, connections: brain.connections ?? [] }
          : undefined,
    },
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

export async function listProjects(userId: string): Promise<BrainProject[]> {
  const db = requireClient()
  const { data, error } = await db
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => mapRow(row))
}

export async function listSharedProjects(): Promise<BrainProject[]> {
  const db = requireClient()
  const { data, error } = await db
    .from('projects')
    .select('*')
    .eq('is_shared', true)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => mapRow(row))
}

export async function createProject(userId: string, input: ProjectInput): Promise<BrainProject> {
  const db = requireClient()
  const { data, error } = await db
    .from('projects')
    .insert({
      user_id: userId,
      name: input.name,
      description: input.description ?? null,
      thumbnail_url: input.thumbnail_url ?? null,
      is_shared: input.is_shared ?? false,
      data: input.data ?? {},
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return mapRow(data)
}

export async function updateProject(
  userId: string,
  id: string,
  input: Partial<ProjectInput>,
): Promise<void> {
  const db = requireClient()
  const { error } = await db.from('projects').update(input).eq('id', id).eq('user_id', userId)
  if (error) throw new Error(error.message)
}

export async function deleteProject(userId: string, id: string): Promise<void> {
  const db = requireClient()
  const { error } = await db.from('projects').delete().eq('id', id).eq('user_id', userId)
  if (error) throw new Error(error.message)
}

export function buildProjectData(
  prompt: string,
  nodes: BrainNodeSpec[],
  connections: Connection[],
): BrainProjectData {
  return { prompt, brain: { nodes, connections } }
}
