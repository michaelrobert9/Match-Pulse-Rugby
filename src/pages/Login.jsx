import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { configured } from '../firebase'

// Where to send the user after a successful sign-in: the ?next= path a guard
// recorded, if it is a safe in-app path, otherwise the portal.
function safeNext(raw) {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/portal'
}

export default function Login() {
  const { user, login, signUp, signInWithGoogle, resetPassword } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))

  // Already signed in (e.g. navigated here manually) — leave immediately.
  useEffect(() => { if (user) navigate(next, { replace: true }) }, [user, next, navigate])

  const [tab,         setTab]         = useState('signin')
  const [displayName, setDisplayName] = useState('')
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [error,       setError]       = useState(null)
  const [notice,      setNotice]      = useState(null)
  const [loading,     setLoading]     = useState(false)

  function configCheck() {
    if (!configured) {
      setError('Sign-in is not available right now. Please try again later.')
      return false
    }
    return true
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!configCheck()) return
    setLoading(true)
    setError(null); setNotice(null)
    try {
      if (tab === 'signin') {
        await login(email, password)
      } else {
        await signUp(email, password, displayName)
      }
      navigate(next, { replace: true })
    } catch (err) {
      // "Account already exists" is NOT an error — one person has ONE MatchPulse
      // account across every sport, however it was first created. Switch them to
      // sign-in instead of letting a duplicate account be made. Same rule for
      // every method (see the Google branch below).
      if (err.code === 'auth/email-already-in-use') {
        setTab('signin')
        setPassword('')
        setNotice('You already have a MatchPulse account with this email — sign in instead.')
        setLoading(false)
        return
      }
      const messages = {
        'auth/invalid-credential':    'Invalid email or password.',
        'auth/user-not-found':        'No account found with this email. Create one instead.',
        'auth/wrong-password':        'Invalid email or password.',
        'auth/weak-password':         'Password must be at least 6 characters.',
        'auth/invalid-email':         'Please enter a valid email address.',
        'auth/too-many-requests':     'Too many attempts. Please wait a moment and try again.',
        'auth/operation-not-allowed': 'Email sign-in is not enabled for this project yet.',
      }
      setError(messages[err.code] ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    if (!configCheck()) return
    setLoading(true)
    setError(null); setNotice(null)
    try {
      // Google sign-in resolves to the same one account whether it is the first
      // time or a return visit — signInWithPopup signs in an existing account
      // rather than creating a second one, so there is no separate "sign up with
      // Google" path. This is the same one-account guarantee as the email case.
      await signInWithGoogle()
      navigate(next, { replace: true })
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        // User dismissed the popup — not an error.
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        // The email already has a MatchPulse account via a different method
        // (e.g. email+password). Point them at that method rather than forking.
        const existing = err.customData?.email
        if (existing) setEmail(existing)
        setTab('signin')
        setPassword('')
        setNotice('You already have a MatchPulse account with this email — sign in with your password instead.')
      } else {
        setError('Google sign-in failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleReset() {
    if (!configCheck()) return
    if (!email) { setError('Enter your email above first, then tap “Forgot password”.'); return }
    setLoading(true); setError(null); setNotice(null)
    try {
      await resetPassword(email)
      setNotice('If an account exists for that email, a password-reset link is on its way.')
    } catch (err) {
      // Never reveal whether an email is registered.
      if (err.code === 'auth/invalid-email') setError('Please enter a valid email address.')
      else setNotice('If an account exists for that email, a password-reset link is on its way.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto min-h-screen bg-canvas flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <div className="text-center mb-8">
          <div className="font-display font-black text-3xl text-slate-900 mb-1">
            Match<span className="text-emerald-600">Pulse</span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {tab === 'signin' ? 'Welcome back' : 'Create your account'}
          </div>
        </div>

        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-6">
          {[['signin', 'Sign in'], ['signup', 'Create account']].map(([t, label]) => (
            <button key={t} type="button" onClick={() => { setTab(t); setError(null); setNotice(null) }}
              className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-colors ${
                tab === t ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-900'
              }`}>
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'signup' && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">Name</label>
              <input type="text" required value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name" autoComplete="name"
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors" />
            </div>
          )}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email"
              className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
              className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors" />
          </div>
          {notice && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700">{notice}</div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">{error}</div>
          )}
          <button type="submit" disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm uppercase tracking-wider rounded-lg px-4 py-3 transition-colors">
            {loading ? 'Please wait…' : tab === 'signin' ? 'Sign in' : 'Create account'}
          </button>

          {tab === 'signin' && (
            <button type="button" onClick={handleReset} disabled={loading}
              className="w-full text-[11px] text-slate-400 hover:text-slate-700 transition-colors">
              Forgot password?
            </button>
          )}
        </form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
          <div className="relative flex justify-center">
            <span className="bg-canvas px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">or</span>
          </div>
        </div>

        <button type="button" onClick={handleGoogle} disabled={loading}
          className="w-full flex items-center justify-center gap-3 border border-slate-200 hover:border-slate-300 bg-white rounded-lg px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50 transition-colors shadow-sm">
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="mt-6 text-center">
          <Link to="/" className="text-[11px] text-slate-400 hover:text-slate-700 transition-colors">
            ← Back to Match Pulse
          </Link>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.706 17.64 9.2z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.259c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
    </svg>
  )
}
