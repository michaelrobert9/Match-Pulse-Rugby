import { initializeApp } from 'firebase/app'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from 'firebase/firestore'
import { getFirestore } from 'firebase/firestore'
import {
  initializeAuth, GoogleAuthProvider,
  indexedDBLocalPersistence, browserLocalPersistence,
  browserSessionPersistence, inMemoryPersistence,
  browserPopupRedirectResolver,
} from 'firebase/auth'
import { getStorage } from 'firebase/storage'
import { getFunctions } from 'firebase/functions'

// All Firebase project settings come from VITE_FIREBASE_* environment
// variables — the rugby platform runs on its own Firebase project, created
// when the deployment target is decided. There are deliberately NO project
// fallbacks here: an unset key means "not configured", never another
// product's backend.
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || '',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || '',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || '',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID              || '',
}

export const configured = !!firebaseConfig.apiKey

// Rugby's data lives in its OWN named Firestore database inside the shared
// match-pulse-4560e project — hockey (and the other MatchPulse sites) use the
// project's (default) database. Sharing ONE project keeps authentication
// unified across all sites, while a separate database keeps each sport's data
// fully separate. Every read/write below is scoped to this database, so rugby
// never touches hockey's data even though they live in the same project.
// Overridable via VITE_FIREBASE_DATABASE_ID; must match firebase.json's
// firestore.database and the Cloud Functions' FIRESTORE_DATABASE_ID.
const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID || 'rugby'

// Region the SHARED project's Cloud Functions are deployed to. A wrong value
// fails at call time with an opaque error — never at build or deploy time — so
// it must match the live deployment (verify with `firebase functions:list
// --project match-pulse-4560e`, or Console → Build → Functions). This is NOT
// the Firestore region (africa-south1); the two are independent settings.
// Held in ONE constant so a correction is a one-line change.
export const FUNCTIONS_REGION = import.meta.env.VITE_FUNCTIONS_REGION || 'europe-west1'

// The main site (front door + account system). ACCOUNT SETTINGS (name, email,
// password) and plan purchase live there — never in this repo. Sign-IN, however,
// happens locally on this origin (see contexts/AuthContext.jsx): the redirect
// handoff was abandoned because iOS home-screen apps can't receive a sign-in
// redirect from an external origin.
export const MAIN_SITE = import.meta.env.VITE_MAIN_SITE_URL || 'https://matchpulse.co.za'
// This deployment's sport key.
export const SPORT_KEY = 'rugby'

// Google sign-in provider (each origin authenticates directly against the
// shared Auth project).
export const googleProvider = new GoogleAuthProvider()

let app, db, identityDb, auth, storage, functions

if (configured) {
  app = initializeApp(firebaseConfig)
  // Persistent local cache (IndexedDB): queues writes offline and syncs on
  // reconnect — essential for scoring at school venues with poor signal.
  // Single-tab manager: offline persistence is active in one tab at a time.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
  }, databaseId)
  // Central identity/billing data (users, userProfiles, people, organizations)
  // lives in the project's (default) database, shared by every MatchPulse sport.
  // READ-ONLY from here: plan and billing fields are owned by the main site and
  // client writes to them are rejected by rules.
  identityDb = getFirestore(app)
  // Explicit Auth persistence fallback chain. A browser that refuses IndexedDB
  // (Safari private mode, some installed-PWA contexts) must NOT take down auth
  // init or silently drop to in-memory — which looks exactly like "signed in,
  // then signed out on next navigation." Try IndexedDB → localStorage →
  // sessionStorage → in-memory, in order. (Reported by netball.)
  auth = initializeAuth(app, {
    persistence: [
      indexedDBLocalPersistence,
      browserLocalPersistence,
      browserSessionPersistence,
      inMemoryPersistence,
    ],
    popupRedirectResolver: browserPopupRedirectResolver,
  })
  storage   = getStorage(app)
  functions = getFunctions(app, FUNCTIONS_REGION)
}

export { db, identityDb, auth, storage, functions }
export default app
