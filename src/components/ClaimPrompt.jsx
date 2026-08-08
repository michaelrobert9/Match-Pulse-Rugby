import { useEffect, useState } from 'react'
import { sendEmailVerification } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchMyPlayerProfiles, searchUnclaimedProfiles, claimPlayerProfile,
} from '../lib/adminQueries'

// Session-level claim prompt (ownerless-profiles addendum A4; resolution round
// Part 3B). The claim search triggers on the first authenticated SESSION where
// the account holds no claimed profile — NOT in the sign-up component — so it
// fires for every sign-in method, Google included. Mounted once in Layout.
//
// "Held no claimed profile" = the account controls no people doc (owner or
// guardian). If it does, we never prompt. Otherwise we search unclaimed
// profiles by the account's display name and offer to claim. A per-account
// localStorage flag stops it nagging on every navigation.
export default function ClaimPrompt() {
  const { user } = useAuth()
  const [matches, setMatches] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [needsVerify, setNeedsVerify] = useState(null)   // chosen relationship
  const [linkSent, setLinkSent] = useState(false)
  const [err, setErr] = useState('')

  const doneKey = user ? `mp-claim-prompt-${user.uid}` : null
  const markDone = () => { try { if (doneKey) localStorage.setItem(doneKey, '1') } catch { /* ignore */ } }

  useEffect(() => {
    if (!user || !doneKey) return
    let cancelled = false
    try { if (localStorage.getItem(doneKey)) return } catch { /* ignore */ }
    ;(async () => {
      // Already controls a profile → never prompt.
      const mine = await fetchMyPlayerProfiles().catch(() => [])
      if (cancelled) return
      if (mine.length > 0) { markDone(); return }
      const name = user.displayName || ''
      if (!name.trim()) { markDone(); return }
      const found = await searchUnclaimedProfiles(name).catch(() => [])
      if (cancelled) return
      if (found.length === 0) { markDone(); return }
      setMatches(found)
      setOpen(true)
    })()
    return () => { cancelled = true }
  }, [user, doneKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !user) return null

  function dismiss() { markDone(); setOpen(false) }

  async function claim(personId, relationship) {
    setBusy(true); setErr('')
    try {
      await claimPlayerProfile(personId, relationship)
      markDone(); setOpen(false)
    } catch (e) {
      if (e.code === 'claim/email-unverified') setNeedsVerify({ personId, relationship })
      else setErr(e.message || 'Could not claim this profile.')
    } finally { setBusy(false) }
  }

  async function sendLink() {
    setErr('')
    try { await sendEmailVerification(auth.currentUser); setLinkSent(true) }
    catch (e) { setErr(e.message || 'Could not send the verification email.') }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-emerald-500 to-emerald-400" />
        <div className="p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-1">Is one of these you?</div>
          <p className="text-[13px] text-slate-600 leading-relaxed mb-3">
            We found existing player profiles matching your name. Claim yours — or your child&rsquo;s —
            so your history stays in one place instead of starting fresh.
          </p>

          {err && <p className="text-red-600 text-xs mb-2">{err}</p>}

          {needsVerify ? (
            <div className="space-y-2">
              <p className="text-[12px] text-slate-600">Claiming needs a verified email. Verify, then finish the claim.</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={sendLink} disabled={busy || linkSent}
                  className="bg-white border border-emerald-300 hover:border-emerald-400 disabled:opacity-50 text-emerald-700 font-bold text-xs uppercase tracking-wider rounded-lg py-2.5">
                  {linkSent ? 'Link sent' : 'Email me a link'}
                </button>
                <button onClick={() => claim(needsVerify.personId, needsVerify.relationship)} disabled={busy}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-lg py-2.5">
                  {busy ? '…' : "I've verified — claim"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {matches.map(p => (
                <div key={p.id} className="border border-slate-200 rounded-xl p-3">
                  <div className="text-sm font-medium text-slate-900 truncate">{p.fullName}</div>
                  {(p.representativeOrgs ?? []).length > 0 && (
                    <div className="text-[11px] text-slate-400 truncate mb-2">
                      {(p.representativeOrgs ?? []).map(o => o.orgName).filter(Boolean).join(', ')}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button onClick={() => claim(p.id, 'player')} disabled={busy}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-[11px] uppercase tracking-wider rounded-lg py-2">
                      This is me
                    </button>
                    <button onClick={() => claim(p.id, 'parent')} disabled={busy}
                      className="bg-white border border-emerald-300 hover:border-emerald-400 disabled:opacity-50 text-emerald-700 font-bold text-[11px] uppercase tracking-wider rounded-lg py-2">
                      My child
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button onClick={dismiss} disabled={busy}
            className="w-full text-slate-400 hover:text-slate-700 text-sm font-medium py-2.5 mt-2 transition-colors">
            None of these are me
          </button>
        </div>
      </div>
    </div>
  )
}
