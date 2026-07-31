import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
  updateProfile as fbUpdateProfile,
  signOut as fbSignOut,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, identityDb, configured, googleProvider } from '../firebase'
import { canAdministerCompetition as canAdminComp } from '../lib/competitionAuth'
import { resolveScopedCapability, grantOf } from '../lib/capabilities'
import { userEntitlementStatus } from '../lib/entitlement'

// Sign-IN happens LOCALLY on this origin, directly against the shared Firebase
// Auth project (match-pulse-4560e). The redirect-to-main-site handoff was
// abandoned — an installed iOS home-screen app cannot receive a sign-in
// redirect from an external origin. Each origin gets its own valid session for
// the same underlying account the moment it signs in.
//
// Still CENTRAL and NOT built here: account settings (name/email/password) and
// plan purchase — those link out to the main site. Account IDENTITY records
// (users/{uid}, userProfiles/{uid}) live in the shared (default) database.
//
// Plan/entitlement + platformAdmin are read from the Auth token's CUSTOM CLAIMS,
// not from a document: Firestore rules cannot read across databases, so claims
// are the only entitlement signal available to this sport's rules, and reading
// the same source in the client keeps client and rules in agreement.
// NOTE: claims are minted by the main site's syncUserClaims, which does not
// exist yet — until it ships, entitlement/platformAdmin are absent and gating
// fails closed (see the platform brief §4).

const AuthContext = createContext(null)

// Entitlement-bearing custom claims, normalised to the shape the entitlement
// helpers expect. Claims are minted centrally by syncUserClaims.
function entitlementFromClaims(claims) {
  return {
    entitlement:          claims?.entitlement ?? 'none',
    eventCredits:         claims?.eventCredits ?? 0,
    entitlementExpiresAt: claims?.entitlementExpiresAt ?? null,
  }
}

export function AuthProvider({ children }) {
  const [user,              setUser]             = useState(null)
  const [isPlatformAdmin,   setIsPlatformAdmin]   = useState(false)
  const [orgRoles,          setOrgRoles]         = useState({})
  const [competitionRoles,  setCompetitionRoles] = useState({})
  const [overrides,         setOverrides]        = useState({})
  const [userEntitlement,   setUserEntitlement]  = useState(null)
  const [loading,           setLoading]          = useState(true)

  function clearIdentity() {
    setIsPlatformAdmin(false)
    setOrgRoles({})
    setCompetitionRoles({})
    setOverrides({})
    setUserEntitlement(null)
  }

  // Load the parts of identity this app may read: entitlement + platformAdmin
  // from the token claims, roles from the central user document.
  async function loadIdentity(u) {
    // Claims first — they resolve even if the central document read is denied.
    try {
      const token = await u.getIdTokenResult()
      setIsPlatformAdmin(token.claims?.platformAdmin === true)
      setUserEntitlement(entitlementFromClaims(token.claims))
    } catch {
      setIsPlatformAdmin(false)
      setUserEntitlement(null)
    }
    // Roles live on the central users/{uid} document — read-only from here.
    try {
      const snap = await getDoc(doc(identityDb, 'users', u.uid))
      const data = snap.exists() ? snap.data() : null
      setOrgRoles(data?.orgRoles ?? {})
      setCompetitionRoles(data?.competitionRoles ?? {})
      setOverrides(data?.permissionOverrides ?? {})
    } catch {
      setOrgRoles({})
      setCompetitionRoles({})
      setOverrides({})
    }
  }

  // First-sign-in bootstrap of the CENTRAL identity record. A user who signs up
  // on this subdomain (or arrives via Google) needs a users/{uid} + a public
  // userProfiles/{uid} in the shared (default) database so org roles can attach
  // and their name/photo render across sports. We only ever create the identity
  // shell — never plan/billing fields, which the main site owns.
  // OPEN QUESTION for the platform: if the main site creates users/{uid} via an
  // Auth onCreate trigger, this write is redundant and should be removed. It is
  // merge-safe, so it is harmless in the meantime.
  async function ensureIdentityDoc(u) {
    try {
      const ref  = doc(identityDb, 'users', u.uid)
      const snap = await getDoc(ref)
      if (!snap.exists()) {
        await setDoc(ref, {
          email:       (u.email ?? '').toLowerCase(),
          displayName: u.displayName ?? '',
          orgRoles:    {},
          createdAt:   serverTimestamp(),
          updatedAt:   serverTimestamp(),
        }, { merge: true })
      } else if (!snap.data().displayName && u.displayName) {
        // Backfill a name captured by Auth (sign-up / Google) but missing here.
        await setDoc(ref, { displayName: u.displayName, updatedAt: serverTimestamp() }, { merge: true })
      }
      setDoc(doc(identityDb, 'userProfiles', u.uid), {
        email:       (u.email ?? '').toLowerCase(),
        displayName: u.displayName ?? '',
        photoURL:    u.photoURL ?? null,
      }, { merge: true }).catch(() => {})
    } catch { /* central rules may reserve this to the main site — non-fatal */ }
  }

  useEffect(() => {
    if (!configured) { setLoading(false); return }

    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u)
        await ensureIdentityDoc(u)
        await loadIdentity(u)
      } else {
        setUser(null)
        clearIdentity()
      }
      setLoading(false)
    })
  }, [])

  // ── Sign-in / sign-up (local, direct against the shared Auth project) ────────
  function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password)
  }

  async function signUp(email, password, displayName) {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    if (displayName) await fbUpdateProfile(cred.user, { displayName })
    // onAuthStateChanged fires and bootstraps the central identity doc; do it
    // here too so the name is present immediately for the redirect that follows.
    await ensureIdentityDoc(cred.user)
    return cred
  }

  function signInWithGoogle() {
    return signInWithPopup(auth, googleProvider)
  }

  // Re-read identity. Pass { force: true } after anything that should have
  // changed entitlement — custom claims are baked into the token at mint time
  // and only refresh about hourly, so a purchase made on the main site stays
  // invisible here until the token is force-refreshed.
  async function refreshUserData({ force = false } = {}) {
    const u = auth?.currentUser
    if (!u) return
    if (force) { try { await u.getIdToken(true) } catch { /* keep existing claims */ } }
    await loadIdentity(u)
  }

  // Sign-out is per-origin: this ends the session HERE only, not on the main
  // site or the other sports.
  const logout = () => fbSignOut(auth)

  // True if the user owns or is staff at the given org, or is a platform admin.
  const isOrgMember = (orgId) => isPlatformAdmin || !!orgRoles[orgId]
  // True if the user can reach the scorer/manage area at all. Includes anyone
  // who has bought a plan (personal entitlement) so they can set up and run
  // their own competition without belonging to an org.
  const canScore = isPlatformAdmin
    || Object.keys(orgRoles).length > 0
    || Object.keys(competitionRoles).length > 0
    || userEntitlementStatus(userEntitlement).canCreate
  // True if the user may administer a given competition (single admin role).
  const canAdministerCompetition = (competition) =>
    canAdminComp(competition, { uid: user?.uid, isPlatformAdmin, orgRoles, competitionRoles })
  // The caller's grant in a given org, normalised to { role, teamId } | null.
  const grantFor = (orgId) => grantOf(orgRoles[orgId])

  // Capability check, resolved per the catalogue: a Master Admin's per-person
  // override wins outright (on OR off); otherwise the natural role's fixed set
  // applies. Platform admins pass everything not explicitly switched off.
  //
  // Optional third argument carries TARGET context for scope-aware checks:
  //   canDo(orgId, 'team.profile.edit', { teamId, teamMgmtOn })
  // Org-wide grants authorise regardless of target team. A team-scoped grant
  // only authorises when teamMgmtOn is true and the target team matches the
  // grant's teamId. Callers that omit the target get the org-wide answer.
  const canDo = (orgId, capability, target = {}) => {
    if (overrides[capability] === true)  return true
    if (overrides[capability] === false) return false
    if (isPlatformAdmin) return true
    return resolveScopedCapability(capability, {
      grant:        grantOf(orgRoles[orgId]),
      overrides,
      targetTeamId: target.teamId ?? null,
      teamMgmtOn:   target.teamMgmtOn ?? false,
    })
  }

  return (
    <AuthContext.Provider value={{
      user, uid: user?.uid ?? null, isPlatformAdmin, orgRoles, competitionRoles, permissionOverrides: overrides,
      userEntitlement,
      isOrgMember, canScore, canAdministerCompetition, canDo, grantFor, loading,
      login, signUp, signInWithGoogle, logout, refreshUserData,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
