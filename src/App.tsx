import { useEffect, useState } from 'react'
import { AuthProvider } from './core/auth/AuthProvider'
import { useAuth } from './core/auth/useAuth'
import { NavigationContext } from './core/navigation'
import type { AppView, AuthMode } from './core/navigation'
import LandingPage from './pages/LandingPage'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'
import StudioApp from './pages/StudioApp'

function Root() {
  const { user, guest, loading } = useAuth()
  const [view, setView] = useState<AppView>('landing')
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const signedIn = user !== null || guest

  // First-time visitors without a session land on the marketing page. Once a
  // session exists (including on refresh with a persisted session or a guest
  // flag) go to the project dashboard.
  useEffect(() => {
    if (signedIn && view === 'landing') setView('dashboard')
  }, [signedIn, view])

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#060606]">
        <div className="w-8 h-8 rounded-full border-2 border-teal-500 border-t-transparent animate-spin"></div>
      </div>
    )
  }

  const navigation = {
    view,
    authMode,
    go: (next: AppView, options?: { readonly authMode?: AuthMode }) => {
      setAuthMode(options?.authMode ?? 'login')
      setView(next)
    },
  }

  const content =
    signedIn && view === 'studio' ? (
      <StudioApp />
    ) : signedIn && view === 'dashboard' ? (
      <DashboardPage />
    ) : view === 'auth' ? (
      <AuthPage />
    ) : (
      <LandingPage />
    )

  return <NavigationContext.Provider value={navigation}>{content}</NavigationContext.Provider>
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  )
}
