import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthContext } from './authContext'
import type { AuthContextValue, AuthResult } from './authContext'
import { supabase } from './supabase'

// Guest sessions never touch Supabase: the flag lives in localStorage and all
// guest data is persisted on the machine (localStorage / the local Runtime).
const GUEST_STORAGE_KEY = 'openbrain:guest'

function readGuestFlag(): boolean {
  try {
    return localStorage.getItem(GUEST_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<AuthContextValue['user']>(null)
  const [guest, setGuest] = useState<boolean>(readGuestFlag)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    let active = true
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        setUser(data.session?.user ?? null)
      })
      .catch(() => {
        if (!active) return
        setUser(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signInWithEmail = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { error: 'Supabase is not configured.', needsEmailConfirmation: false }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null, needsEmailConfirmation: false }
  }, [])

  const signUpWithEmail = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { error: 'Supabase is not configured.', needsEmailConfirmation: false }
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return { error: error.message, needsEmailConfirmation: false }
    return { error: null, needsEmailConfirmation: !data.session }
  }, [])

  const signInWithGoogle = useCallback(async (): Promise<AuthResult> => {
    if (!supabase) return { error: 'Supabase is not configured.', needsEmailConfirmation: false }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    return { error: error?.message ?? null, needsEmailConfirmation: false }
  }, [])

  const signInAsGuest = useCallback((): void => {
    setGuest(true)
    try {
      localStorage.setItem(GUEST_STORAGE_KEY, '1')
    } catch {
      /* ignore */
    }
  }, [])

  const signOut = useCallback(async (): Promise<void> => {
    setGuest(false)
    try {
      localStorage.removeItem(GUEST_STORAGE_KEY)
    } catch {
      /* ignore */
    }
    await supabase?.auth.signOut()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      guest,
      loading,
      configured: supabase !== null,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signInAsGuest,
      signOut,
    }),
    [user, guest, loading, signInWithEmail, signUpWithEmail, signInWithGoogle, signInAsGuest, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
