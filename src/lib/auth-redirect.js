// Links to the MAIN SITE for the things it still owns.
//
// Sign-IN and sign-UP now happen LOCALLY on this origin (see Login/Signup and
// AuthContext) — the redirect handoff was abandoned. What remains central here is
// ACCOUNT SETTINGS (name, email, password); link out for those. (Plans/purchase
// links live in ../lib/mainSite.)

import { MAIN_SITE } from '../firebase'

// Account settings — name, email, password. Main site only.
export function goAccount() {
  window.location.assign(`${MAIN_SITE}/account`)
}
