#!/usr/bin/env node
//
// Brief 2B follow-up — set festival match kick-off times, set each festival
// competition's lifecycle dates, and (as a separate, gated step) publish them.
//
// TWO MODES, so publishing can never happen before the dates/times are reviewed:
//
//   default  (no PUBLISH):  Phase A — the reviewable changes.
//     • Every festival match (createdBy 'brief2b-import') has its scheduledAt set
//       to KICKOFF (default 15:00) on its own match day, SAST. The DATE is kept;
//       only the time moves off midnight.
//     • Every festival competition (createdBy 'brief2a-import') gets its Lifecycle
//       startDate / endDate filled from the span of its own matches:
//           startDate = <earliest match day>T15:00   (first kick-off)
//           endDate   = <latest match day>T23:59     (end of the final day)
//       Stored as datetime-local strings — byte-identical to what the config
//       panel's Settings tab writes (src/pages/manage/competitions/…), so the
//       derived status badge (upcoming/live/completed) reads correctly.
//     Does NOT publish anything.
//
//   PUBLISH=1:  Phase B — flip published:true on all 31 festival competitions.
//     Refuses to publish a competition that has no startDate/endDate yet (run the
//     default phase first). Touches nothing else.
//
// Both phases are idempotent and support DRY_RUN. Writes to the `rugby` named
// database (override FIRESTORE_DATABASE_ID).
//
//   DRY_RUN=1 node scripts/finalize-festivals.mjs     # preview times + dates
//   node scripts/finalize-festivals.mjs               # apply times + dates
//   DRY_RUN=1 PUBLISH=1 node scripts/finalize-festivals.mjs   # preview publish
//   PUBLISH=1 node scripts/finalize-festivals.mjs             # publish

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'

const TZ       = 'Africa/Johannesburg'         // SAST (UTC+2, no DST)
const KICKOFF  = process.env.KICKOFF || '15:00' // match + festival start time
const END_TIME = process.env.END_TIME || '23:59' // festival end-of-day time
const COMP_MARK  = 'brief2a-import'             // the 31 festival competitions
const MATCH_MARK = 'brief2b-import'             // the imported festival matches

const sa = process.env.FIREBASE_SERVICE_ACCOUNT
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'match-pulse-4560e'
initializeApp(sa ? { credential: cert(JSON.parse(sa)) } : { credential: applicationDefault(), projectId })
const db      = getFirestore(process.env.FIRESTORE_DATABASE_ID || 'rugby')
const DRY_RUN = !!process.env.DRY_RUN
const PUBLISH = !!process.env.PUBLISH

// The match day as YYYY-MM-DD in SAST, from a Timestamp / Date / date-string.
function sastDateString(value) {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10)
  const d = value.toDate ? value.toDate() : (value instanceof Date ? value : null)
  if (!d) return null
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}
// A SAST wall-clock Timestamp for a given day + HH:mm.
function sastTimestamp(dateStr, hm) {
  return Timestamp.fromDate(new Date(`${dateStr}T${hm}:00+02:00`))
}

async function commitInChunks(ops) {
  // ops: [{ ref, data }] — apply as update(), ≤400 per batch.
  if (DRY_RUN) return
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch()
    for (const { ref, data } of ops.slice(i, i + 400)) batch.update(ref, data)
    await batch.commit()
  }
}

async function run() {
  const [compSnap, matchSnap] = await Promise.all([
    db.collection('competitions').get(),
    db.collection('matches').get(),
  ])

  const comps = compSnap.docs.filter(d => d.data().createdBy === COMP_MARK)
  const compById = new Map(comps.map(d => [d.id, d]))
  console.log(`Festival competitions (createdBy ${COMP_MARK}): ${comps.length}  (expected 31)`)

  // ── Phase B: publish ─────────────────────────────────────────────────────────
  if (PUBLISH) {
    console.log(DRY_RUN ? '=== DRY RUN — publish preview ===' : '=== LIVE — publishing festival competitions ===')
    const ops = []
    let already = 0, blocked = 0
    for (const d of comps) {
      const c = d.data()
      if (!c.startDate || !c.endDate) {
        console.log(`  BLOCKED  ${c.name}: no start/end date yet — run the default phase first`)
        blocked++
        continue
      }
      if (c.published === true) { console.log(`  skip     ${c.name}: already published`); already++; continue }
      console.log(`  PUBLISH  ${c.name}  (${c.startDate} → ${c.endDate})`)
      ops.push({ ref: d.ref, data: { published: true, updatedAt: FieldValue.serverTimestamp() } })
    }
    await commitInChunks(ops)
    console.log('\n=== Summary (publish) ===')
    console.log(`  published now: ${ops.length}`)
    console.log(`  already:       ${already}`)
    console.log(`  blocked:       ${blocked}  (missing dates)`)
    if (blocked) console.log('  -> run `node scripts/finalize-festivals.mjs` (no PUBLISH) first, then re-run publish.')
    if (DRY_RUN) console.log('\n  DRY RUN — nothing was written.')
    return
  }

  // ── Phase A: match times + competition dates ─────────────────────────────────
  console.log(DRY_RUN ? '=== DRY RUN — times + dates preview ===' : '=== LIVE — setting match times + festival dates ===')

  // 1) Match kick-off times → KICKOFF on each match's own day. Also collect each
  //    competition's match-day span for its lifecycle dates.
  const daysByComp = new Map()   // compId → { min, max }
  const matchOps = []
  let matchesTouched = 0, matchesAlready = 0
  for (const d of matchSnap.docs) {
    const m = d.data()
    if (m.createdBy !== MATCH_MARK) continue
    const day = sastDateString(m.scheduledAt) || sastDateString(m.matchDate)
    if (!day) { console.log(`  WARN match ${d.id}: no date — skipped`); continue }

    if (m.competitionId) {
      const span = daysByComp.get(m.competitionId) || { min: day, max: day }
      if (day < span.min) span.min = day
      if (day > span.max) span.max = day
      daysByComp.set(m.competitionId, span)
    }

    const want = sastTimestamp(day, KICKOFF)
    const cur  = m.scheduledAt
    const curMs = cur?.toMillis ? cur.toMillis() : null
    if (curMs === want.toMillis()) { matchesAlready++; continue }
    matchOps.push({ ref: d.ref, data: { scheduledAt: want, updatedAt: FieldValue.serverTimestamp() } })
    matchesTouched++
  }
  console.log(`\n  match times: ${matchesTouched} to set to ${KICKOFF}, ${matchesAlready} already correct`)

  // 2) Competition lifecycle dates from each festival's match-day span.
  const compOps = []
  let compsTouched = 0, compsAlready = 0, compsNoMatches = 0
  for (const d of comps) {
    const c = d.data()
    const span = daysByComp.get(d.id)
    if (!span) { console.log(`  WARN  ${c.name}: no matches found — no dates set`); compsNoMatches++; continue }
    const startDate = `${span.min}T${KICKOFF}`
    const endDate   = `${span.max}T${END_TIME}`
    if (c.startDate === startDate && c.endDate === endDate) {
      compsAlready++
      continue
    }
    console.log(`  DATES  ${c.name}:  start ${startDate}   end ${endDate}` +
      (span.min === span.max ? '  (single day)' : `  (${span.min} … ${span.max})`))
    compOps.push({ ref: d.ref, data: { startDate, endDate, updatedAt: FieldValue.serverTimestamp() } })
    compsTouched++
  }

  await commitInChunks(matchOps)
  await commitInChunks(compOps)

  console.log('\n=== Summary (times + dates) ===')
  console.log(`  match times set:      ${matchesTouched}  (to ${KICKOFF} SAST; ${matchesAlready} already correct)`)
  console.log(`  competition dates set:${compsTouched}  (${compsAlready} already correct, ${compsNoMatches} without matches)`)
  console.log(`  festival window time: start ${KICKOFF}, end ${END_TIME}`)
  console.log('\n  Nothing was published. Review, then: PUBLISH=1 node scripts/finalize-festivals.mjs')
  if (DRY_RUN) console.log('\n  DRY RUN — nothing was written.')
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
