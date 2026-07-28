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

// Fetch an org doc and return its entitlement status.
export async function fetchOrgEntitlement(orgId) {
  const snap = await getDoc(doc(identityDb, 'organizations', orgId))
  return orgEntitlementStatus(snap.exists() ? snap.data() : null)
}
