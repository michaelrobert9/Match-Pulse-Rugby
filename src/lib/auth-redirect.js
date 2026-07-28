// Sign-in / account redirects to the main site.
//
// MatchPulse is one brand across five deployments. Identity, account settings,
// plan and billing all live on the main site — this repo owns nothing of them
// and has no login UI of its own. Anywhere a local sign-in or account screen
// would have appeared, send the user to the main site instead; it signs them in
// and bounces them straight back here (authenticated) via /auth/handoff.

import { MAIN_SITE, SPORT_KEY } from '../firebase'

// Current in-app location (path + query + hash) so the user returns to exactly
// where they were after signing in.
function currentPath() {
  if (typeof window === 'undefined') return '/'
  return `${window.location.pathname}${window.location.search}${window.location.hash}` || '/'
}

// Send the user to the main site to sign in, returning to `path` afterwards.
export function goSignIn(path = currentPath()) {
  const q = new URLSearchParams({ sport: SPORT_KEY, path })
  window.location.assign(`${MAIN_SITE}/login?${q}`)
}

// Send the user to the main site to create an account.
export function goSignUp(path = currentPath()) {
  const q = new URLSearchParams({ sport: SPORT_KEY, path })
  window.location.assign(`${MAIN_SITE}/signup?${q}`)
}

// Account settings — name, email, password. Main site only.
export function goAccount() {
  window.location.assign(`${MAIN_SITE}/account`)
}

// Plans & pricing. Purchase is a main-site concern; never implemented here.
export const PLANS_URL = `${MAIN_SITE}/#plans`
