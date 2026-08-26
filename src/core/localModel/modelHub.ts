import { supabase } from '../auth/supabase'

// Model Hub: a cloud catalog of downloadable open models that run entirely in
// the browser (weights stream from HuggingFace CDN; Supabase stores only the
// catalog metadata). Falls back to a bundled list when the backend is not
// configured so the feature always works offline/demo.

export interface ModelCatalogEntry {
  readonly id: string
  readonly name: string
  readonly modelId: string
  readonly description: string
  readonly sizeMb: number
  readonly task: string
  readonly tags: readonly string[]
  readonly sourceUrl: string
  readonly accent: string
}

const FALLBACK_CATALOG: readonly ModelCatalogEntry[] = [
  {
    id: 'smollm2-135m',
    name: 'SmolLM2 135M',
    modelId: 'onnx-community/SmolLM2-135M-Instruct',
    description: 'Ultra-light instruct model that downloads fast and runs anywhere.',
    sizeMb: 84,
    task: 'text-generation',
    tags: ['chat', 'instruct', 'tiny'],
    sourceUrl: 'https://huggingface.co/onnx-community/SmolLM2-135M-Instruct',
    accent: '#f472b6',
  },
  {
    id: 'qwen2.5-0.5b',
    name: 'Qwen 2.5 0.5B',
    modelId: 'onnx-community/Qwen2.5-0.5B-Instruct',
    description: 'Small instruct model from Alibaba, great quality per byte for chat.',
    sizeMb: 352,
    task: 'text-generation',
    tags: ['chat', 'instruct', 'small'],
    sourceUrl: 'https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct',
    accent: '#38bdf8',
  },
  {
    id: 'tinyllama-1.1b',
    name: 'TinyLlama 1.1B',
    modelId: 'onnx-community/TinyLlama-1.1B-Chat-v1.0',
    description: '1.1B chat model; best quality of the browser-runnable set.',
    sizeMb: 620,
    task: 'text-generation',
    tags: ['chat', 'instruct'],
    sourceUrl: 'https://huggingface.co/onnx-community/TinyLlama-1.1B-Chat-v1.0',
    accent: '#a78bfa',
  },
]

const CACHE_KEY = 'openbrain:model-hub-catalog'
const CACHE_TTL_MS = 1000 * 60 * 30

function readCache(): readonly ModelCatalogEntry[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at: number; items: ModelCatalogEntry[] }
    if (!Array.isArray(parsed.items)) return null
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null
    return parsed.items
  } catch {
    return null
  }
}

function writeCache(items: readonly ModelCatalogEntry[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), items }))
  } catch {
    /* ignore */
  }
}

function mapRow(row: Record<string, unknown>): ModelCatalogEntry {
  return {
    id: String(row.id),
    name: String(row.name),
    modelId: String(row.model_id),
    description: String(row.description ?? ''),
    sizeMb: Number(row.size_mb ?? 0),
    task: String(row.task ?? 'text-generation'),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    sourceUrl: String(row.source_url ?? ''),
    accent: String(row.accent ?? '#2dd4bf'),
  }
}

// Fetches the catalog from Supabase; never throws. On any failure (offline,
// not configured, error) it returns the cached copy, then the fallback list.
export async function fetchModelCatalog(): Promise<readonly ModelCatalogEntry[]> {
  const cached = readCache()
  const db = supabase
  if (!db) return cached ?? FALLBACK_CATALOG
  try {
    const { data, error } = await db
      .from('model_catalog')
      .select('*')
      .order('size_mb', { ascending: true })
    if (error) return cached ?? FALLBACK_CATALOG
    if (!Array.isArray(data) || data.length === 0) return cached ?? FALLBACK_CATALOG
    const items = data.map((row) => mapRow(row as Record<string, unknown>))
    writeCache(items)
    return items
  } catch {
    return cached ?? FALLBACK_CATALOG
  }
}

export function getFallbackCatalog(): readonly ModelCatalogEntry[] {
  return FALLBACK_CATALOG
}

export function catalogEntryByModelId(modelId: string): ModelCatalogEntry | undefined {
  return FALLBACK_CATALOG.find((entry) => entry.modelId === modelId)
}
