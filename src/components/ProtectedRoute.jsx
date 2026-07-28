import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { goSignIn } from '../lib/auth-redirect'

function Spinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// Signed-out users are sent to the MAIN SITE to sign in — this app has no login
// of its own. The main site returns them here, authenticated, via /auth/handoff.
export function RedirectToSignIn() {
  useEffect(() => { goSignIn() }, [])
  return (
    <div className="min-h-[40vh] grid place-items-center px-6">
      <p className="text-slate-500 text-sm">Taking you to sign in…</p>
    </div>
  )
}

export default function ProtectedRoute({ children, require: requiredRole = 'admin' }) {
  const { user, isPlatformAdmin, canScore, loading } = useAuth()

  if (loading) return <Spinner />

  if (!user) return <RedirectToSignIn />

  if (requiredRole === 'any') return children

  // Scorer area: platform admins, plus any organisation owner/staff member.
  // Match-level ownership is enforced separately when a specific match loads.
  if (requiredRole === 'scorer') {
    return canScore ? children : <Navigate to="/" replace />
  }

  if (!isPlatformAdmin) return <Navigate to="/" replace />

  return children
}
