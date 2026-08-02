export const FIREWORKS_TOKEN_ENV_KEY = 'VITE_FIREWORKS_API_KEY'
export const HF_TOKEN_ENV_KEY = 'VITE_HF_TOKEN'

// Supplies an API token. Abstracted so per-user storage (e.g. Supabase, later)
// can be swapped in without touching the executor or provider. getToken(userId?)
// is accepted-but-unused by the env-backed implementation today — it just keeps
// the seam ready.
export interface TokenProvider {
  getToken(userId?: string): string | null
}

// Reads a token from an environment variable (single-tenant prototype). Each
// provider gets its own instance pointed at the right key: Fireworks for the
// launch provider, Hugging Face for the read-only planner provider. This is the
// ONLY place environment keys may be read — grepping VITE_FIREWORKS_API_KEY /
// VITE_HF_TOKEN in src/ must match exactly here. Values are never logged or
// displayed, only "set/not set".
export class EnvTokenProvider implements TokenProvider {
  private readonly envKey: string

  constructor(envKey: string = FIREWORKS_TOKEN_ENV_KEY) {
    this.envKey = envKey
  }

  getToken(_userId?: string): string | null {
    const env = (import.meta as { env?: Readonly<Record<string, string | undefined>> }).env
    const value = env?.[this.envKey]
    return value && value.trim() !== '' ? value : null
  }
}
