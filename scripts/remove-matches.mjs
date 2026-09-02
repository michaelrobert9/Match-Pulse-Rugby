#!/usr/bin/env node
//
// Brief 2B Part 4 — remove specific STANDALONE matches (no competition tag):
// the practice/abandoned exclusions (§2) and the untagged duplicate (§4).
//
// For each removal row (team_a, team_b, date, score "H-A"): resolve both teams to
// their org's "1st team", find matches with competitionId == null,
// matchDate == date, homeTeamId == team_a, awayTeamId == team_b, and delete them
// ONLY when the recorded score matches. Competition-tagged matches are never
// touched (competitionId == null filter) — so the Part 1 KES festival copy of the
// Hudson Park v Parktown fixture is safe while its untagged Part 2 duplicate goes.
//
// A score mismatch, an unresolved team, or zero/multiple matches is REPORTED and
// left alone — never a blind delete. Idempotent: a row already gone reports
// "not found (already removed?)".
//
//   DRY_RUN=1 node scripts/remove-matches.mjs                 # preview
//   node scripts/remove-matches.mjs                           # delete
//   RESOLVE_ORG_NEARMISS=1 ...                                # allow apostrophe-variant org match
//   REMOVE_FILE=scripts/data/other.json ...                  # override file

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, isAbsolute } from 'node:path'
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const TEAM_NAME = '1st team'
const __dirname = dirname(fileURLToPath(import.meta.url))
const REMOVE_FILE = process.env.REMOVE_FILE || 'data/brief2b_part4_matches_to_remove.json'
const ROWS = JSON.parse(readFileSync(isAbsolute(REMOVE_FILE) ? REMOVE_FILE : join(__dirname, REMOVE_FILE), 'utf8'))

const sa = process.env.FIREBASE_SERVICE_ACCOUNT
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'match-pulse-4560e'
initializeApp(sa ? { credential: cert(JSON.parse(sa)) } : { credential: applicationDefault(), projectId })
const db      = getFirestore(process.env.FIRESTORE_DATABASE_ID || 'rugby')
const DRY_RUN = !!process.env.DRY_RUN
const NEARMISS = !!process.env.RESOLVE_ORG_NEARMISS

function normalise(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function run() {
  console.log(DRY_RUN ? '=== DRY RUN — no deletes ===' : '=== LIVE — removing matches ===')

  const [orgSnap, teamSnap, matchSnap] = await Promise.all([
    db.collection('organizations').get(),
    db.collection('teams').get(),
    db.collection('matches').get(),
  ])

  const orgIdByName = new Map(), orgNearMiss = new Map()
  for (const d of orgSnap.docs) {
    const nm = d.data().name
    orgIdByName.set(nm, d.id)
    const n = normalise(nm); if (n && !orgNearMiss.has(n)) orgNearMiss.set(n, nm)
  }
  const firstTeamByOrgId = new Map()
  for (const d of teamSnap.docs) {
    const t = d.data()
    if (t.displayName === TEAM_NAME && t.organizationId) firstTeamByOrgId.set(t.organizationId, d.id)
  }
  const resolveTeamId = (orgName) => {
    let id = orgIdByName.get(orgName)
    if (!id) { const near = orgNearMiss.get(normalise(orgName)); if (near && NEARMISS) id = orgIdByName.get(near) }
    return id ? firstTeamByOrgId.get(id) : null
  }

  // Index standalone matches by (matchDate, homeTeamId, awayTeamId).
  const byKey = new Map()
  for (const d of matchSnap.docs) {
    const m = d.data()
    if (m.competitionId) continue   // never touch competition matches
    const date = m.matchDate
    if (!date || !m.homeTeamId || !m.awayTeamId) continue
    const k = `${date}|${m.homeTeamId}|${m.awayTeamId}`
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push({ id: d.id, ref: d.ref, ...m })
  }

  const summary = { deleted: 0, notFound: 0, mismatch: 0, unresolved: 0 }
  for (const r of ROWS) {
    const label = `${r.team_a} v ${r.team_b} (${r.date}, ${r.score})`
    const h = resolveTeamId(r.team_a), a = resolveTeamId(r.team_b)
    if (!h || !a) { console.log(`  UNRESOLVED ${label}: ${!h ? `home "${r.team_a}"` : `away "${r.team_b}"`} not found`); summary.unresolved++; continue }

    const cands = byKey.get(`${r.date}|${h}|${a}`) || []
    if (!cands.length) { console.log(`  not found  ${label}: no standalone match (already removed?)`); summary.notFound++; continue }

    const [hp, ap] = String(r.score).split('-').map(n => Number(n))
    for (const c of cands) {
      if (Number(c.homeScore) !== hp || Number(c.awayScore) !== ap) {
        console.log(`  MISMATCH   ${label}: found ${c.id} with score ${c.homeScore}-${c.awayScore} — NOT deleting (score differs)`)
        summary.mismatch++
        continue
      }
      console.log(`  DELETE     ${label}: ${c.id}  (${c.path || 'no path'})  — ${r.reason || ''}`)
      if (!DRY_RUN) await c.ref.delete()
      summary.deleted++
    }
  }

  console.log('\n=== Summary ===')
  console.log(`  deleted:    ${summary.deleted}`)
  console.log(`  not found:  ${summary.notFound}  (already removed, or never imported)`)
  console.log(`  mismatch:   ${summary.mismatch}  (score differs — left in place)`)
  console.log(`  unresolved: ${summary.unresolved}  (team not found)`)
  console.log(`  rows:       ${ROWS.length}`)
  if (DRY_RUN) console.log('\n  DRY RUN — nothing was deleted.')
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
