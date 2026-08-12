// Entitlement helpers — competition-hosting access. READ-ONLY.
//
// Plan and billing state is CENTRAL and owned by the main site. Purchase runs
// there (PayFast hosted checkout + ITN webhook) and the result is mirrored onto
// the user's Auth token as custom claims by syncUserClaims. This app therefore:
//   • READS entitlement from the token claims (see contexts/AuthContext.jsx)
//     and, for orgs, from the central organization document;
//   • NEVER writes entitlement / eventCredits / entitlementExpiresAt. Firestore
//     rules reject those writes — this is enforcement, not convention.
//
// Fields (all written centrally):
//   entitlement          : 'none' | 'event' | 'pro'   (absent → 'none')
//   eventCredits         : number                       (remaining once-off credits)
//   entitlementExpiresAt : Timestamp | epoch ms         (pro subscription end)

import { doc, getDoc } from 'firebase/firestore'
import { identityDb } from '../firebase'

// Shared status resolver — works for any doc carrying the entitlement fields.
function entitlementStatusOf(data) {
  const e = data?.entitlement ?? 'none'
  if (e === 'pro') {
    const exp = data?.entitlementExpiresAt?.toDate?.()
      ?? (data?.entitlementExpiresAt ? new Date(data.entitlementExpiresAt) : null)
    if (exp && exp > new Date()) return { tier: 'pro',        canCreate: true,  unlimited: true  }
    return                               { tier: 'expired',   canCreate: false, unlimited: false }
  }
  if (e === 'event') {
    const credits = data?.eventCredits ?? 0
    if (credits > 0) return              { tier: 'event',     canCreate: true,  unlimited: false, credits }
    return                               { tier: 'no_credits',canCreate: false, unlimited: false, credits: 0 }
  }
  return                                 { tier: 'none',      canCreate: false, unlimited: false }
}

export function orgEntitlementStatus(org) {
  return entitlementStatusOf(org)
}

// Entitlement status for an individual user (PayFast purchases land here).
export function userEntitlementStatus(user) {
  return entitlementStatusOf(user)
}

// Pick the strongest entitlement from a set of statuses: an active Pro beats an
// active Event credit beats anything else. A person's authority to CREATE is the
// best of their own plan and any org they act under — an org inherits its owner's
// entitlement (plans attach to the person, not the org), which is exactly what
// the create rules enforce (they gate on the caller's claim, ignoring the org).
// The org doc is only ever a fallback here and is, in practice, unpopulated.
// Nulls are ignored; an empty set resolves to no plan.
export function bestEntitlement(statuses) {
  const list = (statuses ?? []).filter(Boolean)
  return list.find(s => s.tier === 'pro'   && s.canCreate)
    ??   list.find(s => s.tier === 'event' && s.canCreate)
    ??   list[0]
    ??   { tier: 'none', canCreate: false }
}

// Fetch an org doc and return its entitlement status.
export async function fetchOrgEntitlement(orgId) {
  const snap = await getDoc(doc(identityDb, 'organizations', orgId))
  return orgEntitlementStatus(snap.exists() ? snap.data() : null)
}
