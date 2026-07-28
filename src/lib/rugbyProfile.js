// Rugby's own player/member profile.
//
// MatchPulse is one brand across several sports sharing ONE Firebase project.
// Identity (name, email, photo, plan) is CENTRAL and owned by the main site;
// anything sport-specific belongs to the sport and must never be written into
// the shared users/{uid} document — rugby positions (prop, flyhalf, …) and
// netball positions (GS, GA, WA, …) would silently overwrite each other on the
// same field.
//
// So this lives in RUGBY's own database, keyed by the central Auth UID:
//
//   rugby database:  rugbyProfiles/{uid}
//
// Schema (all optional):
//   role           'player' | 'coach' | 'manager' | 'supporter'
//   position       rugby position key — only meaningful when role === 'player'
//   saRugbyNumber  SA Rugby registration number (public on the player profile)
//   bio            free text
//   dateOfBirth    'YYYY-MM-DD'
//   gender         string
//   province       string
//   phone          string

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

export const RUGBY_PROFILE_COLLECTION = 'rugbyProfiles'

const FIELDS = [
  'role', 'position', 'saRugbyNumber', 'bio',
  'dateOfBirth', 'gender', 'province', 'phone',
]

const EMPTY = Object.fromEntries(FIELDS.map(f => [f, '']))

// Read a user's rugby profile. Returns blank fields when none exists yet.
export async function fetchRugbyProfile(uid) {
  if (!uid) return { ...EMPTY }
  try {
    const snap = await getDoc(doc(db, RUGBY_PROFILE_COLLECTION, uid))
    if (!snap.exists()) return { ...EMPTY }
    const data = snap.data()
    return Object.fromEntries(FIELDS.map(f => [f, data[f] ?? '']))
  } catch {
    return { ...EMPTY }
  }
}

// Create/update a user's rugby profile. Only the known sport fields are written
// — never identity or billing fields, which belong to the main site.
export async function saveRugbyProfile(uid, profile) {
  if (!uid) throw new Error('saveRugbyProfile requires a uid')
  const payload = Object.fromEntries(FIELDS.map(f => [f, profile?.[f] ?? '']))
  // A position only means something for a player.
  if (payload.role !== 'player') payload.position = ''
  return setDoc(
    doc(db, RUGBY_PROFILE_COLLECTION, uid),
    { ...payload, uid, updatedAt: serverTimestamp() },
    { merge: true },
  )
}
