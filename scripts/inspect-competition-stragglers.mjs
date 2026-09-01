#!/usr/bin/env node
//
// Diagnostic (read-only) — find the festival match(es) that were NOT written by
// this import (createdBy !== 'brief2b-import') but sit under one of the Brief 2A
// competitions, and dump the full document. These are the "earlier testing/setup"
// leftovers the import skipped over. For each straggler we also print one
// brief2b-import sibling from the SAME competition, so the field that makes the
// straggler invisible on the site jumps out in a side-by-side.
//
// Writes nothing. Run it exactly like the import:
//   node scripts/inspect-competition-stragglers.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROWS = JSON.parse(
  readFileSync(join(__dirname, 'data', 'brief2b_part1_competition_matches.json'), 'utf8')
)

const sa = process.env.FIREBASE_SERVICE_ACCOUNT
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'match-pulse-4560e'
initializeApp(sa ? { credential: cert(JSON.parse(sa)) } : { credential: applicationDefault(), projectId })
const db = getFirestore(process.env.FIRESTORE_DATABASE_ID || 'rugby')

function slugify(str) {
  return String(str).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Render Firestore values (Timestamps → ISO) so the dump is readable.
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

  // Our 31 competitions (by the names in the file), id → name.
  const wantedNames = new Set(ROWS.map(r => r.competition_name))
  const compNameById = new Map()
  const ourCompIds = new Set()
  const dupNames = new Map()   // name → [ids] to catch accidental duplicate competitions
  for (const d of compSnap.docs) {
    const c = d.data()
    if (!wantedNames.has(c.name)) continue
    compNameById.set(d.id, c.name)
    ourCompIds.add(d.id)
    if (!dupNames.has(c.name)) dupNames.set(c.name, [])
    dupNames.get(c.name).push(d.id)
  }

  // Flag duplicate competition docs sharing a name (a match under the "other" one
  // would be linked but off the navigated edition).
  const dups = [...dupNames.entries()].filter(([, ids]) => ids.length > 1)
  if (dups.length) {
    console.log('!! DUPLICATE competition docs sharing a name:')
    for (const [name, ids] of dups) console.log(`   "${name}": ${ids.join(', ')}`)
    console.log('')
  }

  // Matches under our competitions, split by author.
  const byComp = new Map()   // compId → { mine: [], straggler: [] }
  for (const d of matchSnap.docs) {
    const m = d.data()
    if (!m.competitionId || !ourCompIds.has(m.competitionId)) continue
    if (!byComp.has(m.competitionId)) byComp.set(m.competitionId, { mine: [], straggler: [] })
    const bucket = byComp.get(m.competitionId)
    if (m.createdBy === 'brief2b-import') bucket.mine.push({ id: d.id, ...m })
    else bucket.straggler.push({ id: d.id, ...m })
  }

  const stragglers = [...byComp.entries()].filter(([, b]) => b.straggler.length)
  console.log(`=== Stragglers (matches under our competitions NOT from this import): ${stragglers.reduce((n, [, b]) => n + b.straggler.length, 0)} ===\n`)

  for (const [compId, bucket] of stragglers) {
    for (const s of bucket.straggler) {
      console.log(`--- STRAGGLER in "${compNameById.get(compId)}" (${compId}) ---`)
      console.log(JSON.stringify(plain(s), null, 2))
      const sib = bucket.mine[0]
      if (sib) {
        console.log(`\n--- working sibling (brief2b-import) in the SAME competition, for comparison ---`)
        console.log(JSON.stringify(plain(sib), null, 2))
        // Field-level diff of keys present in one but not the other, or differing shapes.
        const keys = new Set([...Object.keys(s), ...Object.keys(sib)])
        const diffs = []
        for (const k of keys) {
          const a = k in s, b = k in sib
          if (a !== b) diffs.push(`${k}: ${a ? 'only in straggler' : 'only in sibling'}`)
        }
        if (diffs.length) { console.log('\n  key differences:'); diffs.forEach(x => console.log('    ' + x)) }
      }
      console.log('\n')
    }
  }

  if (!stragglers.length) {
    console.log('No stragglers found by createdBy. The invisible match may share createdBy with the import,')
    console.log('or the issue is elsewhere (e.g. competition publish state). Re-check with the competition name.')
  }
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
