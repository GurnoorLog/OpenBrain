import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../core/auth/useAuth'
import { useNavigation } from '../core/navigation'
import type { AuthMode } from '../core/navigation'
import './landing.css'

export default function AuthPage() {
  const { authMode, go } = useNavigation()
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, signInAsGuest, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const mode: AuthMode = authMode
  const isLogin = mode === 'login'

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    if (!configured) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env')
      return
    }
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    try {
      const result = isLogin
        ? await signInWithEmail(email.trim(), password)
        : await signUpWithEmail(email.trim(), password)
      if (result.error) {
        setError(result.error)
      } else if (result.needsEmailConfirmation) {
        setNotice('Check your inbox — we sent a confirmation email. You can close this tab.')
      } else {
        go('dashboard')
      }
    } finally {
      setBusy(false)
    }
  }

  const onGoogle = async () => {
    setError(null)
    setNotice(null)
    if (!configured) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env')
      return
    }
    setBusy(true)
    try {
      const result = await signInWithGoogle()
      if (result.error) setError(result.error)
    } finally {
      setBusy(false)
    }
  }

  const onGuest = () => {
    signInAsGuest()
    go('dashboard')
  }

  const setMode = (next: AuthMode) => {
    setError(null)
    setNotice(null)
    go('auth', { authMode: next })
  }

  return (
    <div className="landing-root relative h-screen overflow-y-auto overflow-x-hidden flex items-center justify-center px-6">
      <div className="dot-grid"></div>
      <div
        className="glow-orb top-[-120px] left-[-120px] w-[420px] h-[420px]"
        style={{ background: 'radial-gradient(circle, #14b8a6 0%, transparent 70%)' }}
      ></div>
      <div
        className="glow-orb bottom-[-120px] right-[-120px] w-[480px] h-[480px]"
        style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }}
      ></div>

      <div className="relative z-10 w-full max-w-md">
        <button
          onClick={() => go('landing')}
          className="mb-6 flex items-center gap-2 text-gray-500 text-sm font-medium hover:text-white transition-colors"
        >
          <iconify-icon icon="lucide:arrow-left"></iconify-icon> Back to home
        </button>

        <div className="landing-glass-card p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center">
              <iconify-icon icon="lucide:brain" className="text-black text-xl"></iconify-icon>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter leading-none">OPENBRAIN</h1>
              <p className="text-[11px] text-gray-500 mt-1">{isLogin ? 'Welcome back.' : 'Create your account.'}</p>
            </div>
          </div>

          <div className="flex gap-1 mb-6 p-1 bg-white/5 rounded-xl">
            {(['login', 'signup'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMode(tab)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === tab ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
              >
                {tab === 'login' ? 'Log in' : 'Sign up'}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2">
              <iconify-icon icon="lucide:triangle-alert" className="mt-0.5 shrink-0"></iconify-icon>
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="mb-4 px-3 py-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400 text-sm flex items-start gap-2">
              <iconify-icon icon="lucide:mail-check" className="mt-0.5 shrink-0"></iconify-icon>
              <span>{notice}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-widest text-gray-500 font-bold">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#111111] border border-white/10 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500/50 transition-all"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-widest text-gray-500 font-bold">Password</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isLogin ? 'Your password' : 'At least 6 characters'}
                className="w-full bg-[#111111] border border-white/10 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500/50 transition-all"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="landing-shine-btn w-full py-3 rounded-xl bg-teal-500 text-black font-black tracking-tight hover:bg-teal-400 transition-colors disabled:opacity-50"
            >
              {busy ? 'Please wait…' : isLogin ? 'Log in' : 'Create account'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-white/10"></div>
            <span className="text-[11px] text-gray-500 uppercase tracking-widest font-bold">or continue with</span>
            <div className="flex-1 h-px bg-white/10"></div>
          </div>

          <button
            onClick={onGoogle}
            disabled={busy}
            className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-semibold flex items-center justify-center gap-3 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C43.6 36.6 44 33.9 44 24c0-1.3-.1-2.6-.4-3.9z" />
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mt-4">
            <div className="flex-1 h-px bg-white/10"></div>
            <span className="text-[11px] text-gray-500 uppercase tracking-widest font-bold">or</span>
            <div className="flex-1 h-px bg-white/10"></div>
          </div>

          <button
            onClick={onGuest}
            disabled={busy}
            className="w-full py-3 rounded-xl bg-white/5 border border-dashed border-white/15 text-sm font-semibold flex items-center justify-center gap-3 hover:bg-white/10 transition-colors disabled:opacity-50"
            title="No account needed — everything stays on this machine"
          >
            <iconify-icon icon="lucide:laptop" className="text-teal-400 text-lg"></iconify-icon>
            Continue as guest
          </button>
          <p className="text-[11px] text-gray-600 text-center mt-2">
            Guest mode runs 100% on your machine — brains, memory and files never leave it.
          </p>
        </div>
      </div>
    </div>
  )
}
