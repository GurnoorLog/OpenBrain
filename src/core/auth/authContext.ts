import { createContext } from 'react'
import type { User } from '@supabase/supabase-js'

export interface AuthResult {
  readonly error: string | null
  readonly needsEmailConfirmation: boolean
}

export interface AuthContextValue {
  readonly user: User | null
  readonly loading: boolean
  readonly configured: boolean
  readonly signInWithEmail: (email: string, password: string) => Promise<AuthResult>
  readonly signUpWithEmail: (email: string, password: string) => Promise<AuthResult>
  readonly signInWithGoogle: () => Promise<AuthResult>
  readonly signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
