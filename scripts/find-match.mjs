#!/usr/bin/env node
//
// Diagnostic (read-only) — locate a specific festival match and print its
// document + its public path (the URL it renders at). Defaults to the
// duplicate-row pairing (Kingswood v St Charles, Grey Rugby Festival 2026), but
// any match can be targeted via env:
//   COMP="Grey Rugby Festival 2026" HOME="Kingswood College" AWAY="St Charles College" \
//     node scripts/find-match.mjs
//
// Matches by competition name + each org name appearing in the team display.
// Writes nothing.

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const sa = process.env.FIREBASE_SERVICE_ACCOUNT
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'match-pulse-4560e'
initializeApp(sa ? { credential: cert(JSON.parse(sa)) } : { credential: applicationDefault(), projectId })
const db = getFirestore(process.env.FIRESTORE_DATABASE_ID || 'rugby')

const COMP = process.env.COMP || 'Grey Rugby Festival 2026'
const HOME = process.env.HOME_TEAM || 'Kingswood College'
const AWAY = process.env.AWAY_TEAM || 'St Charles College'

function plain(v) {
  if (v == null) return v
  if (typeof v.toDate === 'function') return v.toDate().toISOString()
  if (Array.isArray(v)) return v.map(plain)
  if (typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = plain(v[k]); return o }
  return v
}

async function run() {
  const [compSnap, matchSnap] = await Promise.all([
    db.collection('competitions').get(),
    db.collection('matches').get(),
  ])

  const compIds = new Set(compSnap.docs.filter(d => d.data().name === COMP).map(d => d.id))
  if (!compIds.size) { console.log(`No competition named "${COMP}".`); return }
  console.log(`Competition "${COMP}" → ${[...compIds].join(', ')}\n`)

  const hit = matchSnap.docs.filter(d => {
    const m = d.data()
    if (!compIds.has(m.competitionId)) return false
    const hd = (m.homeDisplay || '') + ' ' + (m.homeOrgName || '')
    const ad = (m.awayDisplay || '') + ' ' + (m.awayOrgName || '')
    return hd.includes(HOME) && ad.includes(AWAY)
  })

  console.log(`Matches for ${HOME} v ${AWAY}: ${hit.length}\n`)
  for (const d of hit) {
    const m = d.data()
    console.log(`  id:     ${d.id}`)
    console.log(`  status: ${m.status}   score: ${m.homeScore}-${m.awayScore}`)
    console.log(`  home:   ${m.homeDisplay}  (teamId ${m.homeTeamId})`)
    console.log(`  away:   ${m.awayDisplay}  (teamId ${m.awayTeamId})`)
    console.log(`  venue:  ${m.venueSlug || '(none)'}   venueId ${m.venueId || '(none)'}`)
    console.log(`  PUBLIC PATH (the site URL): ${m.path}`)
    console.log(`  createdBy: ${m.createdBy}   scheduledAt: ${plain(m.scheduledAt)}\n`)
  }

  if (!hit.length) console.log('  (not found — the match does not exist under this competition)')
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
