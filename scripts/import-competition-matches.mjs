#!/usr/bin/env node
//
// Brief 2B, Part 1 — import the 482 festival/competition matches into Rugby.
//
// Each row in scripts/data/brief2b_part1_competition_matches.json becomes ONE
// match document, written exactly as the app itself would create-then-finalise a
// competition fixture:
//   • linked to its Brief 2A competition   (competition_name → competitions/{id})
//   • linked to both teams' "1st team"     (home/away org name → Brief 1B team)
//   • linked to its Brief 1C venue          (venue name → central venueIndex)
//   • final result recorded                 (home_points / away_points, status 'final')
//   • dated                                 (scheduledAt = the match day, SAST)
//
// The document mirrors src/lib/adminQueries.js#createMatch (a competition match:
// competition-scoped, dateless URL) MERGED with the fields
// submitFixtureResult() writes for an untracked submitted result — so these are
// indistinguishable from a fixture entered through the UI. Nothing is invented:
// a row whose competition, either team, or venue cannot be resolved is REPORTED
// and skipped, never guessed.
//
// Links resolved from:
//   competitions, organizations, teams   — the `rugby` named database (this app)
//   venueIndex/current                   — the CENTRAL (default) database, the
//                                          same handle the app reads venues from
//                                          (src/lib/venues.js). Venues are owned
//                                          by the main site; this script only
//                                          reads them and snapshots id + slug.
//
// Idempotent — a match is a duplicate when a match already exists in the SAME
// competition between the SAME two teams on the SAME day; re-running skips those.
// Only these 482 rows are touched (Part 2 — the ~2,572 regular-season fixtures —
// is a separate pass).
//
// Auth — Cloud Shell (ADC, no key file) or an explicit service account:
//   DRY_RUN=1 node scripts/import-competition-matches.mjs        # dry run
//   node scripts/import-competition-matches.mjs                  # live
//   FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" node scripts/import-competition-matches.mjs
//
// Requires firebase-admin on the module path (run from a dir that has it, e.g.
// the main-site functions/ dir). Writes to the `rugby` named database (override
// with FIRESTORE_DATABASE_ID); reads venues from the (default) database (override
// with IDENTITY_DATABASE_ID).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'

const TEAM_NAME = '1st team'                 // the exact team every match links to
const TZ        = 'Africa/Johannesburg'      // SAST (UTC+2, no DST) — the match day

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROWS = JSON.parse(
  readFileSync(join(__dirname, 'data', 'brief2b_part1_competition_matches.json'), 'utf8')
)

const sa = process.env.FIREBASE_SERVICE_ACCOUNT
// With a service account the project comes from the key; with ADC (Cloud Shell)
// the project id must be supplied — auto-detection is unreliable there.
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'match-pulse-4560e'
initializeApp(sa ? { credential: cert(JSON.parse(sa)) } : { credential: applicationDefault(), projectId })
// Rugby data lives in the `rugby` named DB; venues in the central (default) DB —
// two handles on the one app, exactly as the running app splits them. The
// default database's handle is getFirestore() with NO argument — the literal
// id '(default)' is not accepted as an explicit database id by all
// firebase-admin versions, so only pass IDENTITY_DATABASE_ID when it is a real
// named database.
const db         = getFirestore(process.env.FIRESTORE_DATABASE_ID || 'rugby')
const identityId = process.env.IDENTITY_DATABASE_ID
const identityDb = identityId ? getFirestore(identityId) : getFirestore()
const DRY_RUN    = !!process.env.DRY_RUN

// ── App helpers, inlined verbatim so this script is self-contained ──────────────
// slugify + matchSlug from src/lib/slugify.js (the build used by createMatch).
function slugify(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
function matchSlug(homeName, awayName) {
  return `${slugify(homeName)}-vs-${slugify(awayName)}`
}
// competitionMatchPath from src/lib/matchPaths.js (dateless competition shape).
function competitionMatchPath(season, competitionSlug, slug) {
  return `/competitions/${season}/${competitionSlug}/match/${slug}`
}
// dedupeSlug from src/lib/matchPaths.js.
function dedupeSlug(base, taken) {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}
// composeTeamDisplay from src/lib/teamNaming.js ("Name – Label", en-dash).
function composeTeamDisplay(namePortion, teamLabel) {
  const name  = (namePortion ?? '').trim()
  const label = (teamLabel ?? '').trim()
  if (!name)  return label
  if (!label) return name
  return `${name} – ${label}`
}
// Venue-index normalisation from src/lib/venues.js#normaliseVenueText — used
// ONLY as a fallback when an exact venue-name match misses (diacritics/spacing).
function normaliseVenueText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// The match day as a YYYY-MM-DD string in SAST — for dedupe keys derived from an
// existing doc's scheduledAt Timestamp (or its matchDate, if it carries one).
function sastDateString(value) {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10)
  const d = value.toDate ? value.toDate() : (value instanceof Date ? value : null)
  if (!d) return null
  // en-CA renders ISO YYYY-MM-DD; the timeZone pins it to the SA match day.
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}

async function run() {
  console.log(DRY_RUN ? '=== DRY RUN — no writes ===' : '=== LIVE — importing competition matches ===')

  // ── Load every index we resolve against, once ────────────────────────────────
  const [compSnap, orgSnap, teamSnap, matchSnap, venueDoc] = await Promise.all([
    db.collection('competitions').get(),
    db.collection('organizations').get(),
    db.collection('teams').get(),
    db.collection('matches').get(),
    identityDb.collection('venueIndex').doc('current').get(),
  ])

  // Competitions by exact name → { id, slug, season }.
  const compByName = new Map()
  for (const d of compSnap.docs) {
    const c = d.data()
    compByName.set(c.name, { id: d.id, slug: c.slug || slugify(c.name), season: String(c.season ?? '') })
  }
  const ourCompIds = new Set([...compByName.values()].map(c => c.id))

  // Organisations by exact name → id.
  const orgIdByName = new Map()
  for (const d of orgSnap.docs) orgIdByName.set(d.data().name, d.id)

  // Each org's "1st team" (Brief 1B), by organizationId.
  const firstTeamByOrgId = new Map()
  for (const d of teamSnap.docs) {
    const t = d.data()
    if (t.displayName === TEAM_NAME && t.organizationId) {
      firstTeamByOrgId.set(t.organizationId, { id: d.id, ...t })
    }
  }

  // Central venue index → exact-name map + a normalised fallback map.
  const venues = Array.isArray(venueDoc.data()?.venues) ? venueDoc.data().venues : []
  const venueByName   = new Map()
  const venueByNorm   = new Map()
  for (const v of venues) {
    if (v?.name) venueByName.set(v.name, v)
    const norm = v?.nameNormalised || normaliseVenueText(v?.name)
    if (norm && !venueByNorm.has(norm)) venueByNorm.set(norm, v)
  }

  // Existing matches in OUR competitions: dedupe keys + per-competition taken slugs.
  const existingKeys      = new Set()   // `${compId}|${homeTeamId}|${awayTeamId}|${date}`
  const takenSlugsByComp  = new Map()   // compId → Set(matchSlug)
  for (const d of matchSnap.docs) {
    const m = d.data()
    if (!m.competitionId || !ourCompIds.has(m.competitionId)) continue
    if (m.matchSlug) {
      if (!takenSlugsByComp.has(m.competitionId)) takenSlugsByComp.set(m.competitionId, new Set())
      takenSlugsByComp.get(m.competitionId).add(m.matchSlug)
    }
    const date = sastDateString(m.scheduledAt) || sastDateString(m.matchDate)
    if (m.homeTeamId && m.awayTeamId && date) {
      existingKeys.add(`${m.competitionId}|${m.homeTeamId}|${m.awayTeamId}|${date}`)
    }
  }

  const summary = { created: 0, skippedExisting: 0, unresolved: 0 }
  const problems = { competition: [], homeTeam: [], awayTeam: [], venue: [] }
  const seenThisRun = new Set()
  let batch = db.batch()
  let pending = 0
  const flush = async () => { if (pending && !DRY_RUN) { await batch.commit(); batch = db.batch(); pending = 0 } }

  const resolveTeam = (orgName) => {
    const orgId = orgIdByName.get(orgName)
    if (!orgId) return { err: `no Organisation "${orgName}"` }
    const team = firstTeamByOrgId.get(orgId)
    if (!team) return { err: `Organisation "${orgName}" has no "${TEAM_NAME}"` }
    return { team }
  }

  for (const [i, r] of ROWS.entries()) {
    const where = `row ${i + 1} (${r.home_team} v ${r.away_team}, ${r.competition_name} ${r.date})`

    const comp = compByName.get(r.competition_name)
    if (!comp) { console.log(`  UNRESOLVED competition — ${where}: "${r.competition_name}"`); problems.competition.push(where); summary.unresolved++; continue }

    const home = resolveTeam(r.home_team)
    if (home.err) { console.log(`  UNRESOLVED home team — ${where}: ${home.err}`); problems.homeTeam.push(`${where}: ${home.err}`); summary.unresolved++; continue }
    const away = resolveTeam(r.away_team)
    if (away.err) { console.log(`  UNRESOLVED away team — ${where}: ${away.err}`); problems.awayTeam.push(`${where}: ${away.err}`); summary.unresolved++; continue }

    let venue = venueByName.get(r.venue)
    if (!venue) venue = venueByNorm.get(normaliseVenueText(r.venue))
    if (!venue) { console.log(`  UNRESOLVED venue — ${where}: "${r.venue}"`); problems.venue.push(`${where}: "${r.venue}"`); summary.unresolved++; continue }

    // Duplicate? Same competition, same two teams, same day — existing or already
    // queued in this run.
    const key = `${comp.id}|${home.team.id}|${away.team.id}|${r.date}`
    if (existingKeys.has(key) || seenThisRun.has(key)) {
      console.log(`  skip    ${where}: already exists`)
      summary.skippedExisting++
      continue
    }
    seenThisRun.add(key)

    // URL identity — competition-scoped, dateless (exactly like createMatch).
    const homeDisplay = composeTeamDisplay(home.team.orgName, home.team.displayName)
    const awayDisplay = composeTeamDisplay(away.team.orgName, away.team.displayName)
    if (!takenSlugsByComp.has(comp.id)) takenSlugsByComp.set(comp.id, new Set())
    const taken = takenSlugsByComp.get(comp.id)
    const slug  = dedupeSlug(matchSlug(homeDisplay, awayDisplay), taken)
    taken.add(slug)
    const path  = competitionMatchPath(comp.season, comp.slug, slug)

    // The match day, SAST midnight (source carries no kickoff time). The app
    // reads the DATE off scheduledAt (MatchDetail/fixtures), so this is where the
    // day lives; competition matches carry no separate matchDate field.
    const scheduledAt = Timestamp.fromDate(new Date(`${r.date}T00:00:00+02:00`))

    console.log(`  CREATE  ${where} -> ${path}  [${r.home_points}-${r.away_points}]  @ ${venue.name}`)
    if (!DRY_RUN) {
      batch.set(db.collection('matches').doc(), {
        competitionId:  comp.id,
        // Home team (registered "1st team").
        homeTeamId:     home.team.id,
        homeTeamName:   home.team.displayName,
        homeDisplay,
        homeOrgName:    home.team.orgName || null,
        homeTeamSlug:   home.team.slug || null,
        homeTeamColor:  home.team.primaryColor || null,
        homeOrgId:      home.team.organizationId ?? null,
        homeRegistered: true,
        // Away team.
        awayTeamId:     away.team.id,
        awayTeamName:   away.team.displayName,
        awayDisplay,
        awayOrgName:    away.team.orgName || null,
        awayTeamSlug:   away.team.slug || null,
        awayTeamColor:  away.team.primaryColor || null,
        awayOrgId:      away.team.organizationId ?? null,
        awayRegistered: true,
        // Final result (submitted, untracked). Tries were not captured by the
        // source — null means "unknown", NOT a known zero (which would deny a try
        // bonus); mirrors submitFixtureResult for an untracked submission.
        homeScore:      Number(r.home_points),
        awayScore:      Number(r.away_points),
        homeTries:      null,
        awayTries:      null,
        status:         'final',
        resultSource:   'submitted',
        endedAt:        FieldValue.serverTimestamp(),
        // Match shell (createMatch defaults).
        periods: 2, periodMinutes: 35, breakMinutes: [10],
        scores: [], cards: [], controlLog: [],
        startedAt: null, pausedAt: null, totalPausedMs: 0,
        nextPeriodIndex: 1,
        scheduledAt, pitch: '',
        // Central venue link: id + slug snapshot travel with the match so a public
        // page renders/links the venue with no cross-database read.
        venueId: venue.id || null, venueSlug: venue.slug || null,
        sevens: false, tracked: false,
        // Competition-scoped URL identity.
        matchSlug: slug,
        path,
        season: comp.season,
        competitionSlug: comp.slug,
        competitionSeason: comp.season,
        // Audit marker (this import), plus the sourcing flag from the file.
        importSource: r.source || null,
        ...(r.venue_note && r.venue_note.trim() ? { venueNote: r.venue_note.trim() } : {}),
        createdBy: 'brief2b-import',
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
  console.log(`  rows:             ${ROWS.length}  (expected 482)`)
  const accounted = summary.created + summary.skippedExisting + summary.unresolved
  console.log(`  accounted for:    ${accounted}  (create + skip + unresolved)`)
  for (const [kind, list] of Object.entries(problems)) {
    if (!list.length) continue
    console.log(`\n  --- unresolved ${kind} (${list.length}) ---`)
    for (const p of list) console.log(`    ${p}`)
  }
  if (DRY_RUN) console.log('\n  DRY RUN — nothing was written.')
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
