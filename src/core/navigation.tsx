import { createContext, useContext } from 'react'

export type AppView = 'landing' | 'auth' | 'dashboard' | 'studio'
export type AuthMode = 'login' | 'signup'

export interface Navigation {
  readonly view: AppView
  readonly authMode: AuthMode
  readonly go: (view: AppView, options?: { readonly authMode?: AuthMode }) => void
}

export const NavigationContext = createContext<Navigation | null>(null)

export function useNavigation(): Navigation {
  const nav = useContext(NavigationContext)
  if (!nav) throw new Error('useNavigation must be used within a NavigationContext provider')
  return nav
}
