#!/usr/bin/env node
//
// Brief 2A — create the 31 rugby festival competitions (7 festivals × their
// seasons) so Brief 2B can link each of the 482 festival matches to its correct
// competition record.
//
// One festival competition per row in scripts/data/brief2a_competitions.json:
//   name       = competition_name  ("Wildeklawer 2022") — exactly as given
//   seriesName = festival_name      ("Wildeklawer")      — groups editions
//   season     = season             ("2022")
//   type       = "festival"
//
// The document mirrors what the app's own createManagedCompetition writes
// (src/lib/adminQueries.js) — same fields, same festival rules object from
// defaultRulesForType('festival') — so these are indistinguishable from
// UI-created festivals. No matches are written here (that is Brief 2B).
//
// Ownership: these are neutral historical festivals (Rugby Ignite data), not
// owned by any one participating school, so no ownerOrgId / ownerUserId is set
// — they are platform-admin-administered. createdBy is an audit marker.
//
// Lifecycle: created as status 'draft', published:false and WITHOUT start/end
// dates — exactly as createManagedCompetition creates a competition. Publishing
// them and setting their dates (so their lifecycle reads "completed") is out of
// this brief's scope; do it after Brief 2B has attached the matches.
//
// Auth — Cloud Shell (ADC, no key file) or an explicit service account:
//   DRY_RUN=1 node scripts/create-festival-competitions.mjs          # dry run
//   node scripts/create-festival-competitions.mjs                    # live
//   FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" node scripts/create-festival-competitions.mjs
//
// Requires firebase-admin on the module path (run from a dir that has it, e.g.
// the main-site functions/ dir). Writes to the `rugby` named database (override
// with FIRESTORE_DATABASE_ID). Idempotent — skips any competition whose exact
// name already exists, so re-running reports 31 skips.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROWS = JSON.parse(
  readFileSync(join(__dirname, 'data', 'brief2a_competitions.json'), 'utf8')
)

const sa = process.env.FIREBASE_SERVICE_ACCOUNT
initializeApp({ credential: sa ? cert(JSON.parse(sa)) : applicationDefault() })
const db      = getFirestore(process.env.FIRESTORE_DATABASE_ID || 'rugby')
const DRY_RUN = !!process.env.DRY_RUN

// Same slug rule as src/lib/slugify.js / the other scripts.
function slugify(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// The festival rules object, inlined VERBATIM from
// src/lib/competitionRules.js#defaultRulesForType('festival') so this script is
// self-contained. If that template ever changes, re-sync this block.
function festivalRules() {
  return {
    points:        { win: 4, draw: 2, loss: 0 },
    // Festival branch overrides bonusPoints to all-off (a festival has no log).
    bonusPoints:   { tryBonus: false, tryBonusThreshold: 4, losingBonus: false, losingBonusMargin: 7, winMargin: false, winMarginThreshold: 15 },
    tieBreakers: [
      { key: 'points',              label: 'Log points',                    direction: 'desc', scope: 'all_fixtures' },
      { key: 'headToHeadMiniTable', label: 'Head-to-head mini-table',       direction: 'desc', scope: 'head_to_head' },
      { key: 'pointsDifference',    label: 'Points difference',             direction: 'desc', scope: 'all_fixtures' },
      { key: 'triesFor',            label: 'Tries scored',                  direction: 'desc', scope: 'all_fixtures' },
      { key: 'pointsFor',           label: 'Points for',                    direction: 'desc', scope: 'all_fixtures' },
      { key: 'wins',                label: 'Wins',                          direction: 'desc', scope: 'all_fixtures' },
      { key: 'fairPlayScore',       label: 'Fair play',                     direction: 'asc',  scope: 'all_fixtures' },
      { key: 'manualDecision',      label: 'Manual administrator decision', direction: null,   scope: 'all_fixtures' },
    ],
    walkoverScore: { concedingTeam: 0, opposingTeam: 28 },
    statsTable:    { enabled: false, columns: ['played', 'won', 'drawn', 'lost', 'pointsFor', 'pointsAgainst', 'pointsDifference', 'triesFor'] },
  }
}

async function run() {
  console.log(DRY_RUN ? '=== DRY RUN — no writes ===' : '=== LIVE — creating festival competitions ===')

  const snap = await db.collection('competitions').get()
  const existingByName = new Map(snap.docs.map(d => [d.data().name, d.id]))
  // Seed the taken-slug set so new slugs stay globally unique. Editions of the
  // same festival share a slugBase (festival name, no season — the season is a
  // separate URL segment), so they get -2/-3… suffixes, matching the app.
  const takenSlugs = new Set(snap.docs.map(d => d.data().slug).filter(Boolean))

  const summary = { created: 0, skipped: 0 }
  let batch = db.batch()
  let pending = 0

  for (const r of ROWS) {
    const name = r.competition_name
    if (existingByName.has(name)) {
      console.log(`  skip    ${name}: already exists (${existingByName.get(name)})`)
      summary.skipped++
      continue
    }

    let slug = slugify(r.festival_name) || 'festival'
    if (takenSlugs.has(slug)) { let n = 2; while (takenSlugs.has(`${slug}-${n}`)) n++; slug = `${slug}-${n}` }
    takenSlugs.add(slug)

    console.log(`  CREATE  ${name}  (season ${r.season}, series "${r.festival_name}", slug ${slug})`)
    if (!DRY_RUN) {
      batch.set(db.collection('competitions').doc(), {
        name,
        slug,
        seriesName: r.festival_name,
        season:     String(r.season),
        type:       'festival',
        gender:     null,
        ageGroup:   null,
        status:     'draft',
        published:  false,
        rules:      festivalRules(),
        createdBy:  'brief2a-import',
        createdAt:  FieldValue.serverTimestamp(),
      })
      if (++pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0 }
    }
    summary.created++
  }

  if (pending && !DRY_RUN) await batch.commit()

  console.log('\n=== Summary ===')
  console.log(`  created: ${summary.created}`)
  console.log(`  skipped: ${summary.skipped}  (name already existed)`)
  console.log(`  rows:    ${ROWS.length}  (expected 31 across 7 festivals)`)
  if (DRY_RUN) console.log('\n  DRY RUN — nothing was written.')
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
