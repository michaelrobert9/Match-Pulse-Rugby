#!/usr/bin/env node
//
// Brief 1B — create one "1st team" for every school Organisation.
//
// For each of the 104 schools in scripts/data/brief1b_schools_for_1st_team.json
// (created as Organisations in Brief 1, already activated for rugby), ensure
// the Organisation has EXACTLY ONE rugby team named `1st team` — the exact
// string the downstream ranking/import logic (Brief 2) matches on.
//
//   0 teams under the org   -> create one named "1st team"
//   1 team, wrong name      -> rename it to "1st team" (displayName + searchName)
//   1 team, already correct -> leave it (idempotent no-op)
//   >1 teams under the org  -> DO NOT auto-merge/delete: renaming one and
//                              deleting the others could orphan match/stat
//                              records whose merge semantics this brief does not
//                              specify. One is reconciled to "1st team" and the
//                              rest are reported as CONFLICTS for a human to
//                              merge/remove. Nothing is deleted by this script.
//
// The rugby app is single-sport, so "belongs to the Organisation under Rugby"
// is expressed purely by teams.organizationId — there is no sport field to set.
// New teams mirror what src/lib/adminQueries.js#createTeam writes (org colour /
// crest / shortCode denormalised, standings counters zeroed); no new fields are
// introduced.
//
// Auth — two ways, whichever fits the machine:
//   • Cloud Shell / any gcloud-authenticated shell (no key file needed):
//       DRY_RUN=1 node scripts/create-first-teams.mjs      # dry run
//       node scripts/create-first-teams.mjs                # live
//     Uses Application Default Credentials for project match-pulse-4560e.
//     (If ADC is not set up: `gcloud auth application-default login`.)
//   • Explicit service account:
//       FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" \
//         node scripts/create-first-teams.mjs
//
// Requires firebase-admin on the module path — run it from a directory that
// has it installed (e.g. the main-site functions/ dir), or `npm i firebase-admin`
// first. Writes to the `rugby` named database (override with FIRESTORE_DATABASE_ID).
//
// Idempotent — safe to re-run. Re-running after a clean run reports 104 skips.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const TEAM_NAME = '1st team'   // exact string, everywhere — do not vary casing

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHOOLS = JSON.parse(
  readFileSync(join(__dirname, 'data', 'brief1b_schools_for_1st_team.json'), 'utf8')
).map(s => s.org_name)   // wp_team_id_reference_only is a WordPress cross-check only; never stored

// Explicit service account if provided; otherwise Application Default
// Credentials (Cloud Shell, or `gcloud auth application-default login`).
const sa = process.env.FIREBASE_SERVICE_ACCOUNT
// With a service account the project comes from the key; with ADC (Cloud Shell)
// the project id must be supplied — auto-detection is unreliable there.
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'match-pulse-4560e'
initializeApp(sa ? { credential: cert(JSON.parse(sa)) } : { credential: applicationDefault(), projectId })
const db      = getFirestore(process.env.FIRESTORE_DATABASE_ID || 'rugby')
const DRY_RUN = !!process.env.DRY_RUN

// Same slug rule as scripts/backfill-org-slugs.mjs and src/lib/slugify.js.
function slugify(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// Normalise for fuzzy near-miss detection ONLY (curly vs straight apostrophe,
// stray whitespace). Never used to attach a team — matching an org is exact.
function loose(str) {
  return String(str).toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim()
}

async function uniqueTeamSlug(orgSlug, qualifier, takenSlugs) {
  const base = `${slugify(orgSlug)}-${slugify(String(qualifier ?? 'team'))}`
  let slug = base
  let n = 2
  while (takenSlugs.has(slug)) slug = `${base}-${n++}`
  takenSlugs.add(slug)
  return slug
}

async function run() {
  console.log(DRY_RUN ? '=== DRY RUN — no writes ===' : '=== LIVE — creating/renaming teams ===')

  // Load all orgs and all teams once (104 orgs; team count is small).
  const [orgSnap, teamSnap] = await Promise.all([
    db.collection('organizations').get(),
    db.collection('teams').get(),
  ])

  // Exact-name index of orgs, plus a loose index for near-miss reporting.
  const orgByName  = new Map()
  const orgByLoose = new Map()
  for (const d of orgSnap.docs) {
    const data = d.data()
    orgByName.set(data.name, { id: d.id, ...data })
    orgByLoose.set(loose(data.name), { id: d.id, ...data, _exact: data.name })
  }

  // Teams grouped by organizationId.
  const teamsByOrg = new Map()
  const takenSlugs = new Set()
  for (const d of teamSnap.docs) {
    const data = d.data()
    if (data.slug) takenSlugs.add(data.slug)
    if (!data.organizationId) continue
    if (!teamsByOrg.has(data.organizationId)) teamsByOrg.set(data.organizationId, [])
    teamsByOrg.get(data.organizationId).push({ id: d.id, ref: d.ref, ...data })
  }

  const summary = { created: 0, renamed: 0, skipped: 0, missing: 0, conflicts: 0 }
  let batch = db.batch()
  let pending = 0
  const flush = async () => { if (pending && !DRY_RUN) { await batch.commit(); batch = db.batch(); pending = 0 } }

  for (const name of SCHOOLS) {
    let org = orgByName.get(name)
    if (!org) {
      const near = orgByLoose.get(loose(name))
      if (near) {
        // Exact string differs (apostrophe/whitespace). Do NOT attach — the
        // org name is the match key and Brief 1 was meant to create it exactly.
        console.log(`  MISSING (near-miss: stored as "${near._exact}"): ${name}`)
      } else {
        console.log(`  MISSING (no Organisation): ${name}`)
      }
      summary.missing++
      continue
    }

    const teams = teamsByOrg.get(org.id) ?? []

    if (teams.length === 0) {
      const slug = await uniqueTeamSlug(org.slug || slugify(org.name), TEAM_NAME, takenSlugs)
      console.log(`  CREATE  ${name}: teams/{new} "${TEAM_NAME}" (slug ${slug})`)
      if (!DRY_RUN) {
        batch.set(db.collection('teams').doc(), {
          organizationId: org.id,
          orgName:        org.name ?? null,
          displayName:    TEAM_NAME,
          // searchName leads with the org name (matches src createTeam): a
          // registered team is found by its school name when adding a match.
          searchName:     [org.name, TEAM_NAME].filter(Boolean).join(' ').toLowerCase(),
          logoUrl:        org.logoUrl || null,
          primaryColor:   org.primaryColor ?? null,
          secondaryColor: org.secondaryColor || '#FFFFFF',
          slug,
          active: true,
          played: 0, won: 0, drawn: 0, lost: 0,
          pointsFor: 0, pointsAgainst: 0, points: 0,
          createdBy: 'brief1b-import',
          createdAt: FieldValue.serverTimestamp(),
        })
        if (++pending >= 400) await flush()
      }
      summary.created++
      continue
    }

    // Choose the reconcile target: an already-correct team if present, else the
    // oldest (earliest createdAt) so match history stays on the surviving team.
    const already = teams.find(t => t.displayName === TEAM_NAME)
    const target = already ?? [...teams].sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0, tb = b.createdAt?.toMillis?.() ?? 0
      return ta - tb
    })[0]

    if (teams.length > 1) {
      const extras = teams.filter(t => t.id !== target.id).map(t => `${t.id} "${t.displayName}"`)
      console.log(`  CONFLICT ${name}: ${teams.length} teams — keeping ${target.id}, needs manual merge/remove of: ${extras.join(', ')}`)
      summary.conflicts++
      // fall through to also normalise the target's name below
    }

    if (target.displayName === TEAM_NAME) {
      console.log(`  skip    ${name}: already "${TEAM_NAME}" (${target.id})`)
      summary.skipped++
      continue
    }

    console.log(`  RENAME  ${name}: ${target.id} "${target.displayName}" -> "${TEAM_NAME}"`)
    if (!DRY_RUN) {
      batch.update(target.ref, {
        displayName: TEAM_NAME,
        searchName:  [org.name, TEAM_NAME].filter(Boolean).join(' ').toLowerCase(),
        updatedAt:   FieldValue.serverTimestamp(),
      })
      if (++pending >= 400) await flush()
    }
    summary.renamed++
  }

  await flush()

  console.log('\n=== Summary ===')
  console.log(`  created:   ${summary.created}`)
  console.log(`  renamed:   ${summary.renamed}`)
  console.log(`  skipped:   ${summary.skipped}  (already "${TEAM_NAME}")`)
  console.log(`  missing:   ${summary.missing}  (Organisation not found — fix Brief 1 first)`)
  console.log(`  conflicts: ${summary.conflicts}  (org has >1 team — manual merge/remove needed)`)
  const accountedFor = summary.created + summary.renamed + summary.skipped + summary.missing
  console.log(`  schools processed: ${SCHOOLS.length}  (create+rename+skip+missing = ${accountedFor})`)
  if (DRY_RUN) console.log('\n  DRY RUN — nothing was written.')
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
