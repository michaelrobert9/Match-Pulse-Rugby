#!/usr/bin/env node
//
// Brief 2B, Part 3 (and the Part 2 shape generally) — import NON-competition
// (standalone) matches into Rugby: plain historical fixtures with no competition
// tag. Defaults to the 23 resolved neutral-venue matches; point it at any file
// with the same schema via DATA_FILE.
//
// Row schema (competition_name is empty for every row):
//   date "YYYY-MM-DD", time "HH:mm", home_team / away_team (org names),
//   home_points / away_points, venue (org/venue name), venue_note, source.
//
// Each row becomes ONE match written exactly as the app create-then-finalises a
// STANDALONE fixture — createMatch's non-competition branch (dated URL
// /match/{date}/{slug}, matchDate set, NO competitionId/season) merged with the
// fields submitFixtureResult writes for an untracked submitted result. Both teams
// resolve to their org's "1st team" (Brief 1B); the venue resolves against the
// central venueIndex (Brief 1C), same as the Part 1 importer. Nothing is
// invented — a row whose team or venue cannot be resolved is reported and skipped.
//
// Idempotent — a match is a duplicate when a standalone match already exists on
// the SAME day between the SAME two teams. Re-running skips those.
//
// Auth / databases identical to the Part 1 importer:
//   DRY_RUN=1 node scripts/import-standalone-matches.mjs        # dry run
//   node scripts/import-standalone-matches.mjs                  # live
//   DATA_FILE=scripts/data/other.json node scripts/import-standalone-matches.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, isAbsolute } from 'node:path'
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'

const TEAM_NAME = '1st team'
const TZ        = 'Africa/Johannesburg'   // SAST (UTC+2, no DST)

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = process.env.DATA_FILE || 'data/brief2b_part3_neutral_resolved_matches.json'
const ROWS = JSON.parse(readFileSync(isAbsolute(DATA_FILE) ? DATA_FILE : join(__dirname, DATA_FILE), 'utf8'))

const sa = process.env.FIREBASE_SERVICE_ACCOUNT
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'match-pulse-4560e'
initializeApp(sa ? { credential: cert(JSON.parse(sa)) } : { credential: applicationDefault(), projectId })
const db         = getFirestore(process.env.FIRESTORE_DATABASE_ID || 'rugby')
const identityId = process.env.IDENTITY_DATABASE_ID
const identityDb = identityId ? getFirestore(identityId) : getFirestore()
const DRY_RUN    = !!process.env.DRY_RUN

// ── App helpers, inlined verbatim (slugify.js / matchPaths.js / teamNaming.js) ──
function slugify(str) {
  return String(str).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
function matchSlug(homeName, awayName) { return `${slugify(homeName)}-vs-${slugify(awayName)}` }
function matchPath(date, slug) { return `/match/${date}/${slug}` }
function dedupeSlug(base, taken) {
  if (!taken.has(base)) return base
  let n = 2; while (taken.has(`${base}-${n}`)) n++; return `${base}-${n}`
}
function composeTeamDisplay(namePortion, teamLabel) {
  const name = (namePortion ?? '').trim(), label = (teamLabel ?? '').trim()
  if (!name) return label
  if (!label) return name
  return `${name} – ${label}`
}
function normaliseVenueText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function sastDateString(value) {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10)
  const d = value.toDate ? value.toDate() : (value instanceof Date ? value : null)
  return d ? d.toLocaleDateString('en-CA', { timeZone: TZ }) : null
}

async function run() {
  console.log(DRY_RUN ? '=== DRY RUN — no writes ===' : '=== LIVE — importing standalone matches ===')
  console.log(`  data: ${DATA_FILE}  (${ROWS.length} rows)`)

  const [orgSnap, teamSnap, matchSnap, groupSnap, venueDoc] = await Promise.all([
    db.collection('organizations').get(),
    db.collection('teams').get(),
    db.collection('matches').get(),
    db.collection('matchGroups').get().catch(() => ({ docs: [] })),
    identityDb.collection('venueIndex').doc('current').get(),
  ])

  const orgIdByName = new Map()
  for (const d of orgSnap.docs) orgIdByName.set(d.data().name, d.id)

  const firstTeamByOrgId = new Map()
  for (const d of teamSnap.docs) {
    const t = d.data()
    if (t.displayName === TEAM_NAME && t.organizationId) firstTeamByOrgId.set(t.organizationId, { id: d.id, ...t })
  }

  const venues = Array.isArray(venueDoc.data()?.venues) ? venueDoc.data().venues : []
  const venueByName = new Map(), venueByNorm = new Map()
  for (const v of venues) {
    if (v?.name) venueByName.set(v.name, v)
    const norm = v?.nameNormalised || normaliseVenueText(v?.name)
    if (norm && !venueByNorm.has(norm)) venueByNorm.set(norm, v)
  }

  // Existing standalone matches: dedupe map keyed by (matchDate, home, away), and
  // per-date taken top-level slugs (matches without a group + match-group slugs),
  // matching takenTopLevelSlugsForDate in the app.
  const existingByKey    = new Map()   // `${date}|${homeTeamId}|${awayTeamId}`
  const takenSlugsByDate = new Map()   // date → Set(slug)
  const addTaken = (date, slug) => {
    if (!date || !slug) return
    if (!takenSlugsByDate.has(date)) takenSlugsByDate.set(date, new Set())
    takenSlugsByDate.get(date).add(slug)
  }
  for (const d of matchSnap.docs) {
    const m = d.data()
    const date = m.matchDate || sastDateString(m.scheduledAt)
    if (m.matchDate && !m.matchGroupId) addTaken(m.matchDate, m.matchSlug)
    if (!m.competitionId && date && m.homeTeamId && m.awayTeamId) {
      existingByKey.set(`${date}|${m.homeTeamId}|${m.awayTeamId}`, {
        id: d.id, status: m.status ?? null, homeScore: m.homeScore ?? null,
        awayScore: m.awayScore ?? null, path: m.path ?? null, venueId: m.venueId ?? null,
      })
    }
  }
  for (const d of (groupSnap.docs || [])) { const g = d.data(); addTaken(g.matchDate, g.slug) }

  const summary = { created: 0, skippedExisting: 0, unresolved: 0 }
  const problems = { homeTeam: [], awayTeam: [], venue: [] }
  const seenThisRun = new Set()
  let batch = db.batch(); let pending = 0
  const flush = async () => { if (pending && !DRY_RUN) { await batch.commit(); batch = db.batch(); pending = 0 } }

  const resolveTeam = (orgName) => {
    const orgId = orgIdByName.get(orgName)
    if (!orgId) return { err: `no Organisation "${orgName}"` }
    const team = firstTeamByOrgId.get(orgId)
    if (!team) return { err: `Organisation "${orgName}" has no "${TEAM_NAME}"` }
    return { team }
  }

  for (const [i, r] of ROWS.entries()) {
    const where = `row ${i + 1} (${r.home_team} v ${r.away_team}, ${r.date})`

    const home = resolveTeam(r.home_team)
    if (home.err) { console.log(`  UNRESOLVED home — ${where}: ${home.err}`); problems.homeTeam.push(`${where}: ${home.err}`); summary.unresolved++; continue }
    const away = resolveTeam(r.away_team)
    if (away.err) { console.log(`  UNRESOLVED away — ${where}: ${away.err}`); problems.awayTeam.push(`${where}: ${away.err}`); summary.unresolved++; continue }

    let venue = venueByName.get(r.venue) || venueByNorm.get(normaliseVenueText(r.venue))
    if (!venue) { console.log(`  UNRESOLVED venue — ${where}: "${r.venue}"`); problems.venue.push(`${where}: "${r.venue}"`); summary.unresolved++; continue }

    const key = `${r.date}|${home.team.id}|${away.team.id}`
    if (seenThisRun.has(key)) { console.log(`  skip    ${where}: duplicate row within this file`); summary.skippedExisting++; continue }
    const hit = existingByKey.get(key)
    if (hit) {
      console.log(`  skip    ${where}: existing match ${hit.id} [status=${hit.status} score=${hit.homeScore}-${hit.awayScore}]`)
      summary.skippedExisting++; continue
    }
    seenThisRun.add(key)

    // Standalone URL identity — dated path, slug unique within the date.
    const homeDisplay = composeTeamDisplay(home.team.orgName, home.team.displayName)
    const awayDisplay = composeTeamDisplay(away.team.orgName, away.team.displayName)
    if (!takenSlugsByDate.has(r.date)) takenSlugsByDate.set(r.date, new Set())
    const taken = takenSlugsByDate.get(r.date)
    const slug  = dedupeSlug(matchSlug(homeDisplay, awayDisplay), taken)
    taken.add(slug)
    const path  = matchPath(r.date, slug)

    const time = /^([01]?\d|2[0-3]):[0-5]\d$/.test(r.time || '') ? r.time : '15:00'
    const scheduledAt = Timestamp.fromDate(new Date(`${r.date}T${time}:00+02:00`))

    console.log(`  CREATE  ${where} -> ${path}  [${r.home_points}-${r.away_points}]  ${time}  @ ${venue.name}`)
    if (!DRY_RUN) {
      batch.set(db.collection('matches').doc(), {
        competitionId:  null,
        homeTeamId:     home.team.id,
        homeTeamName:   home.team.displayName,
        homeDisplay,
        homeOrgName:    home.team.orgName || null,
        homeTeamSlug:   home.team.slug || null,
        homeTeamColor:  home.team.primaryColor || null,
        homeOrgId:      home.team.organizationId ?? null,
        homeRegistered: true,
        awayTeamId:     away.team.id,
        awayTeamName:   away.team.displayName,
        awayDisplay,
        awayOrgName:    away.team.orgName || null,
        awayTeamSlug:   away.team.slug || null,
        awayTeamColor:  away.team.primaryColor || null,
        awayOrgId:      away.team.organizationId ?? null,
        awayRegistered: true,
        homeScore:      Number(r.home_points),
        awayScore:      Number(r.away_points),
        homeTries:      null,
        awayTries:      null,
        status:         'final',
        resultSource:   'submitted',
        endedAt:        FieldValue.serverTimestamp(),
        periods: 2, periodMinutes: 35, breakMinutes: [10],
        scores: [], cards: [], controlLog: [],
        startedAt: null, pausedAt: null, totalPausedMs: 0,
        nextPeriodIndex: 1,
        scheduledAt, pitch: '',
        venueId: venue.id || null, venueSlug: venue.slug || null,
        sevens: false, tracked: false,
        // Standalone: dated URL identity, matchDate set, NO competition fields.
        matchDate: r.date,
        matchSlug: slug,
        path,
        importSource: r.source || null,
        ...(r.venue_note && r.venue_note.trim() ? { venueNote: r.venue_note.trim() } : {}),
        ...(r.time_defaulted ? { timeDefaulted: true } : {}),
        createdBy: 'brief2b-part3-import',
        createdAt: FieldValue.serverTimestamp(),
      })
      if (++pending >= 400) await flush()
    }
    summary.created++
  }

  await flush()

  console.log('\n=== Summary ===')
  console.log(`  created:          ${summary.created}`)
  console.log(`  skipped (exists): ${summary.skippedExisting}`)
  console.log(`  unresolved:       ${summary.unresolved}  (reported below — nothing invented)`)
  console.log(`  rows:             ${ROWS.length}`)
  for (const [kind, list] of Object.entries(problems)) {
    if (!list.length) continue
    console.log(`\n  --- unresolved ${kind} (${list.length}) ---`)
    for (const p of list) console.log(`    ${p}`)
  }
  if (DRY_RUN) console.log('\n  DRY RUN — nothing was written.')
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
