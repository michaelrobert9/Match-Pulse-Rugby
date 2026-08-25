// The main site (matchpulse.co.za) owns purchasing and entitlement end to end:
// a buyer completes a form there, gets an invoice, pays by EFT, and the plan is
// activated manually from the back end. The sport apps only ever READ entitlement
// and link OUT to the main site to buy — they never take payment or grant a plan.
//
// This module is the single source of that outbound URL and the context we tag
// onto it, so the target lives in exactly one place across the app.
//
// MAIN_SITE is resolved once (from the deploy env) in firebase.js; it is imported
// here rather than re-read so a staging/preview override stays consistent app-wide.
import { MAIN_SITE, SPORT_KEY } from '../firebase'

// The plans/products page on the main site. Every plan/purchase CTA points here.
export const PLANS_URL = `${MAIN_SITE}/products`

// Account settings (name, email, password) live on the main site. Sign-in itself
// is LOCAL to this subdomain (platform brief v2 §1/§2) — we only link out for
// things that genuinely live centrally.
export const MAIN_ACCOUNT_URL = `${MAIN_SITE}/account`
export function goAccount() { window.location.assign(MAIN_ACCOUNT_URL) }

// A venue's public page lives on the main site (venues are authored and owned
// centrally; the sport apps only read them). Built from the venue slug snapshot
// stored on the match, so rendering a venue link never needs a cross-database
// read. Returns null when there is no slug (a typed, unlinked venue).
export function venueUrl(slug) {
  return slug ? `${MAIN_SITE}/venues/${slug}` : null
}

// Build the outbound plans URL, tagging on who is asking and from where. These
// params are informational only — /products ignores them today — but they let a
// manual sale be attributed to a sport, an org and a user before the buyer emails
// in. Empty values are omitted; with none set this is just PLANS_URL.
export function plansUrl({ sport = SPORT_KEY, orgId, uid, tier, ref } = {}) {
  const params = new URLSearchParams()
  if (sport) params.set('sport', sport)
  if (orgId) params.set('org', orgId)
  if (uid)   params.set('uid', uid)
  if (tier)  params.set('tier', tier)
  if (ref)   params.set('ref', ref)
  const qs = params.toString()
  return qs ? `${PLANS_URL}?${qs}` : PLANS_URL
}
