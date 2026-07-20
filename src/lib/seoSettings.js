import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db, configured } from '../firebase'

export const DEFAULT_SEO = {
  siteTitle:                      'MatchPulse',
  siteTagline:                    'School & Club Hockey',
  siteDescription:                'Live scores, fixtures, results and player records for school and club hockey in South Africa.',
  keywords:                       'hockey, school hockey, club hockey, live scores, fixtures, results, players, South Africa',
  googleAnalyticsId:              '',
  googleSearchConsoleVerification:'',
  statCounterProject:             '',
  statCounterSecurity:            '',
  ogImageUrl:                     '',
}

export async function fetchSeoSettings() {
  if (!configured) return DEFAULT_SEO
  try {
    const snap = await getDoc(doc(db, 'settings', 'seo'))
    return snap.exists() ? { ...DEFAULT_SEO, ...snap.data() } : DEFAULT_SEO
  } catch { return DEFAULT_SEO }
}

export async function saveSeoSettings(data, uid) {
  const { updatedBy: _a, updatedAt: _b, ...clean } = data
  await setDoc(doc(db, 'settings', 'seo'), {
    ...clean,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  })
}
