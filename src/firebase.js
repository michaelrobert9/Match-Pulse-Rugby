import { initializeApp } from 'firebase/app'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from 'firebase/firestore'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
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

let app, db, auth, storage, functions

export const googleProvider = new GoogleAuthProvider()

if (configured) {
  app = initializeApp(firebaseConfig)
  // Persistent local cache (IndexedDB): queues writes offline and syncs on
  // reconnect — essential for scoring at school venues with poor signal.
  // Single-tab manager: offline persistence is active in one tab at a time.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
  })
  auth      = getAuth(app)
  storage   = getStorage(app)
  // Functions are deployed to europe-west1 (africa-south1 is the Firestore
  // region; Functions default to europe-west1 for lower-latency from ZA).
  functions = getFunctions(app, 'europe-west1')
}

export { db, auth, storage, functions }
export default app
