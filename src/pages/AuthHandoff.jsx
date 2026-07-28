// Auth handoff landing page.
//
// Firebase Auth persists its session in IndexedDB scoped to the ORIGIN, so a
// user signed in on the main site is not signed in here — same Firebase project
// or not. The main site mints a single-use, 60-second ticket and sends the user
// to /auth/handoff#t=<ticket>&p=<path>; we exchange it for a Firebase custom
// token and sign in. The ticket travels in the URL fragment because fragments
// never reach servers or Referer headers.
//
// This route MUST stay outside the auth guard — the user is signed out when
// they arrive.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithCustomToken } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { auth, functions, MAIN_SITE, SPORT_KEY } from '../firebase'

export default function AuthHandoff() {
  const [error, setError] = useState('')
  const navigate = useNavigate()
  // StrictMode double-invokes effects in development and the ticket is
  // single-use, so the second run would always fail. Guard it.
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    ;(async () => {
      // Read the fragment, then clear it from history immediately so the ticket
      // is not left in the URL, in history, or in any copied link.
      const frag   = new URLSearchParams(window.location.hash.slice(1))
      const ticket = frag.get('t')
      const path   = frag.get('p') || '/'
      window.history.replaceState(null, '', window.location.pathname)

      if (!ticket) { setError('This sign-in link is incomplete.'); return }

      try {
        const redeem = httpsCallable(functions, 'redeemHandoffTicket')
        const { data } = await redeem({ ticket })
        await signInWithCustomToken(auth, data.token)
        navigate(path, { replace: true })
      } catch (err) {
        // Tickets expire after 60 seconds and work exactly once, so a refresh
        // of this URL is expected to fail — send the user back to sign in.
        setError(
          err?.code === 'functions/deadline-exceeded'
            ? 'That sign-in link expired. Please try again.'
            : 'That sign-in link is no longer valid. Please sign in again.'
        )
      }
    })()
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-[60vh] grid place-items-center px-6 text-center">
        <div>
          <p className="text-slate-700 text-sm mb-4">{error}</p>
          <a href={`${MAIN_SITE}/login?sport=${SPORT_KEY}`}
            className="inline-flex items-center bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm uppercase tracking-wider rounded-xl px-6 py-3 transition-colors">
            Sign in again
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[60vh] grid place-items-center px-6">
      <p className="text-slate-500 text-sm">Signing you in…</p>
    </div>
  )
}
