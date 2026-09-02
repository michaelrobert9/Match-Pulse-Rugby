#!/usr/bin/env node
//
// One-time export/join — map Rugby Ignite historical match URLs to their Match
// Pulse equivalents for a 301-redirect migration. READ-ONLY: reads competitions
// and matches, writes a CSV. Nothing in the database is modified.
//
// Correctness rules (both matter for redirects):
//  • The Match Pulse URL is the match's OWN stored `path` (the exact string the
//    app froze at creation via createMatch's slug/path logic) — never
//    reconstructed from a pattern. That path already encodes home-before-away
//    order AND, for festival matches, the competition's db-assigned slug
//    (e.g. .../wildeklawer-4/...), so team order and the un-derivable slug are
//    both taken straight from our record.
//  • The input CSV's team_a/team_b order is NOT assumed to be home/away — matches
//    join order-agnostically on the pair of org names, and the URL comes from the
//    stored record's own order.
//
// Join:
//  • regular rows (blank competition_name): candidates = standalone matches
//    (competitionId == null) on the same date; match the {team_a, team_b} pair.
//  • festival rows: resolve competition by name, then match the pair within that
//    competition's own matches (no date-only join once a comp has many matches).
// Team names are compared normalised (case/diacritics/punctuation-insensitive) so
// minor spelling/apostrophe differences match; anything below a confident match
// is left "unmatched" rather than guessed.
//
// Output columns: rugby_ignite_url, matchpulse_url, match_id, match_confidence,
// plus team_a, team_b, date, competition_name, note (for review).
//
//   node scripts/build-redirect-map.mjs
//   OUT=/tmp/redirects.csv BASE_URL=https://rugby.matchpulse.co.za node scripts/build-redirect-map.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, isAbsolute } from 'node:path'
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const __dirname = dirname(fileURLToPath(import.meta.url))
const IN_FILE  = process.env.IN_FILE || 'data/rugbyignite_redirect_source_final.csv'
const SLUG_FILE = process.env.SLUG_FILE || 'data/matchpulse_competition_slugs.csv'
const OUT      = process.env.OUT || 'redirect_map_output.csv'
const BASE_URL = (process.env.BASE_URL || 'https://rugby.matchpulse.co.za').replace(/\/$/, '')
const p = f => isAbsolute(f) ? f : join(__dirname, f)

const sa = process.env.FIREBASE_SERVICE_ACCOUNT
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'match-pulse-4560e'
initializeApp(sa ? { credential: cert(JSON.parse(sa)) } : { credential: applicationDefault(), projectId })
const db = getFirestore(process.env.FIRESTORE_DATABASE_ID || 'rugby')

// ── CSV parse/format (RFC4180-ish: quotes, escaped quotes, embedded commas) ─────
function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* skip */ }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''))
}
const csvCell = v => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Normalise a team/org name for matching: lowercase, strip diacritics, drop
// apostrophes, & -> and, other punctuation -> space, collapse.
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
}
const pairKey = (a, b) => [norm(a), norm(b)].sort().join(' || ')
// token Jaccard for the fuzzy fallback
function jac(a, b) {
  const A = new Set(norm(a).split(' ').filter(Boolean)), B = new Set(norm(b).split(' ').filter(Boolean))
  if (!A.size || !B.size) return 0
  let inter = 0; for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}
// Best pair similarity across both orientations (candidate home/away vs a/b).
function pairSim(cHome, cAway, a, b) {
  const o1 = (jac(cHome, a) + jac(cAway, b)) / 2
  const o2 = (jac(cHome, b) + jac(cAway, a)) / 2
  return Math.max(o1, o2)
}

async function run() {
  const rows = parseCSV(readFileSync(p(IN_FILE), 'utf8'))
  const header = rows[0]
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]))
  const need = ['rugby_ignite_url', 'team_a', 'team_b', 'date', 'season', 'match_status', 'competition_name']
  for (const k of need) if (!(k in idx)) throw new Error(`input CSV missing column "${k}"`)
  const data = rows.slice(1)

  // Expected competition slugs (QA cross-check only; DB is source of truth).
  const slugRows = parseCSV(readFileSync(p(SLUG_FILE), 'utf8'))
  const sIdx = Object.fromEntries(slugRows[0].map((h, i) => [h.trim(), i]))
  const expectedPath = new Map()   // competition_name -> matchpulse_competition_path
  for (const r of slugRows.slice(1)) expectedPath.set(r[sIdx.competition_name], r[sIdx.matchpulse_competition_path])

  const [compSnap, orgSnap, matchSnap] = await Promise.all([
    db.collection('competitions').get(),
    db.collection('organizations').get(),
    db.collection('matches').get(),
  ])

  const compIdByName = new Map(compSnap.docs.map(d => [d.data().name, d.id]))
  const orgByNorm = new Map()
  for (const d of orgSnap.docs) { const o = d.data(); const n = norm(o.name); if (n && !orgByNorm.has(n)) orgByNorm.set(n, o) }

  // Index matches. Regular: by date. Festival: by competitionId.
  const regByDate = new Map()      // date -> [match]
  const festByComp = new Map()     // compId -> [match]
  for (const d of matchSnap.docs) {
    const m = { id: d.id, ...d.data() }
    if (m.competitionId) {
      if (!festByComp.has(m.competitionId)) festByComp.set(m.competitionId, [])
      festByComp.get(m.competitionId).push(m)
    } else if (m.matchDate) {
      if (!regByDate.has(m.matchDate)) regByDate.set(m.matchDate, [])
      regByDate.get(m.matchDate).push(m)
    }
  }

  const FUZZY_MIN = 0.80
  const pick = (cands, a, b) => {
    if (!cands || !cands.length) return { m: null, conf: 'unmatched', note: 'no candidate in scope' }
    const want = pairKey(a, b)
    const exact = cands.filter(c => pairKey(c.homeOrgName, c.awayOrgName) === want)
    if (exact.length === 1) return { m: exact[0], conf: 'exact', note: '' }
    if (exact.length > 1)  return { m: exact[0], conf: 'fuzzy', note: `${exact.length} identical-pair candidates; took first` }
    // fuzzy fallback
    const scored = cands.map(c => ({ c, s: pairSim(c.homeOrgName, c.awayOrgName, a, b) })).sort((x, y) => y.s - x.s)
    if (scored[0] && scored[0].s >= FUZZY_MIN && (!scored[1] || scored[0].s - scored[1].s >= 0.1)) {
      return { m: scored[0].c, conf: 'fuzzy', note: `fuzzy pair sim ${scored[0].s.toFixed(2)}` }
    }
    return { m: null, conf: 'unmatched', note: scored[0] ? `best sim ${scored[0].s.toFixed(2)} < ${FUZZY_MIN} or ambiguous` : 'no candidate' }
  }

  const out = [['rugby_ignite_url', 'matchpulse_url', 'match_id', 'match_confidence', 'team_a', 'team_b', 'date', 'competition_name', 'note']]
  const stats = { exact: 0, fuzzy: 0, unmatched: 0, removed: 0, slugMismatch: 0 }
  const unmatchedSamples = []

  for (const r of data) {
    const url = r[idx.rugby_ignite_url], a = r[idx.team_a], b = r[idx.team_b]
    const date = r[idx.date], comp = (r[idx.competition_name] || '').trim(), status = r[idx.match_status]

    if (status !== 'migrated') {
      // Removed (practice/abandoned): point at the home team's org page if we can.
      const o = orgByNorm.get(norm(a))
      const orgPath = o ? `/${o.type === 'club' ? 'clubs' : o.type === 'association' ? 'associations' : 'schools'}/${o.slug || norm(a).replace(/ /g, '-')}` : ''
      out.push([url, o ? BASE_URL + orgPath : '', '', 'removed', a, b, date, comp, `status=${status}${o ? ' -> home team org page' : ' (org not found; left blank)'}`])
      stats.removed++
      continue
    }

    let res
    if (comp) {
      const compId = compIdByName.get(comp)
      res = compId ? pick(festByComp.get(compId), a, b) : { m: null, conf: 'unmatched', note: `competition "${comp}" not found` }
    } else {
      res = pick(regByDate.get(date), a, b)
    }

    if (res.m) {
      let note = res.note
      if (comp) { // QA: does the DB path agree with the confirmed slug list?
        const exp = expectedPath.get(comp)
        if (exp && res.m.path && !res.m.path.startsWith(`/competitions/${exp}/`)) { note = (note ? note + '; ' : '') + `slug!=confirmed(${exp})`; stats.slugMismatch++ }
      }
      out.push([url, BASE_URL + res.m.path, res.m.id, res.conf, a, b, date, comp, note])
      stats[res.conf]++
    } else {
      out.push([url, '', '', 'unmatched', a, b, date, comp, res.note])
      stats.unmatched++
      if (unmatchedSamples.length < 12) unmatchedSamples.push(`${a} v ${b} (${date}${comp ? ', ' + comp : ''}) — ${res.note}`)
    }
  }

  writeFileSync(p(OUT), out.map(r => r.map(csvCell).join(',')).join('\n') + '\n')

  const migrated = stats.exact + stats.fuzzy + stats.unmatched
  console.log('=== Redirect map ===')
  console.log(`  output:            ${p(OUT)}`)
  console.log(`  input rows:        ${data.length}`)
  console.log(`  migrated rows:     ${migrated}`)
  console.log(`    exact:           ${stats.exact}`)
  console.log(`    fuzzy:           ${stats.fuzzy}`)
  console.log(`    unmatched:       ${stats.unmatched}`)
  console.log(`  removed rows:      ${stats.removed}  (pointed at home team org page where found)`)
  console.log(`  slug cross-check mismatches vs confirmed list: ${stats.slugMismatch}  (DB path is source of truth)`)
  if (unmatchedSamples.length) {
    console.log('\n  sample unmatched:')
    for (const s of unmatchedSamples) console.log(`    - ${s}`)
  }
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
