/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREWORKS_API_KEY?: string
  readonly VITE_HF_TOKEN?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_CLOUD_EXECUTOR_URL?: string
  readonly VITE_RUNTIME_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
