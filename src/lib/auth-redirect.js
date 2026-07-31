// Links to the MAIN SITE for the things it still owns.
//
// Sign-IN and sign-UP now happen LOCALLY on this origin (see Login/Signup and
// AuthContext) — the redirect handoff was abandoned. What remains central is
// ACCOUNT SETTINGS (name, email, password) and PLAN purchase; link out for
// those.

import { MAIN_SITE } from '../firebase'

// Account settings — name, email, password. Main site only.
export function goAccount() {
  window.location.assign(`${MAIN_SITE}/account`)
}

// Plans & pricing. Purchase is a main-site concern; never implemented here.
export const PLANS_URL = `${MAIN_SITE}/#plans`
