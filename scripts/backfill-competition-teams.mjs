#!/usr/bin/env node
//
// Brief 3A — backfill the Teams tab for the 31 rugby festival competitions.
//
// Each festival competition (createdBy 'brief2a-import') has matches linked to it
// but an empty Teams tab. This adds, for every competition, one membership doc per
// distinct team that appears as home or away in its matches — skipping any team
// already listed. Nothing else is touched (no matches, scores, or competition docs).
//
// Membership doc shape mirrors what the app writes for an admin-added registered
// team (see addNamedTeamToCompetition / the invite→accept flow in
// src/lib/adminQueries.js), keyed by the REAL team id so it joins matches by
// teamId and earns standings:
//   competitions/{compId}/teams/{teamId} = {
//     teamId, organizationId, claimed, status: 'admin_approved',
//     displaySnapshot: { teamName, orgName, primaryColor }, addedAt, addedBy }
// status 'admin_approved' is in the standings CONFIRMED set, so festival logs /
// head-to-head start counting once these exist (a fixture only counts when BOTH
// team ids are confirmed members — which is why the empty tab left them blank).
//
//   DRY_RUN=1 node scripts/backfill-competition-teams.mjs      # preview
//   node scripts/backfill-competition-teams.mjs                # write

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const COMP_MARK = 'brief2a-import'   // the 31 festival competitions

const sa = process.env.FIREBASE_SERVICE_ACCOUNT
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'match-pulse-4560e'
initializeApp(sa ? { credential: cert(JSON.parse(sa)) } : { credential: applicationDefault(), projectId })
const db      = getFirestore(process.env.FIRESTORE_DATABASE_ID || 'rugby')
const DRY_RUN = !!process.env.DRY_RUN

async function run() {
  console.log(DRY_RUN ? '=== DRY RUN — no writes ===' : '=== LIVE — backfilling competition Teams tabs ===')

  const [compSnap, teamSnap, matchSnap] = await Promise.all([
    db.collection('competitions').get(),
    db.collection('teams').get(),
    db.collection('matches').get(),
  ])

  const comps = compSnap.docs.filter(d => d.data().createdBy === COMP_MARK)
  const compName = new Map(comps.map(d => [d.id, d.data().name]))
  const compIds = new Set(comps.map(d => d.id))
  console.log(`Festival competitions: ${comps.length}  (expected 31)`)

  const teamsById = new Map(teamSnap.docs.map(d => [d.id, { id: d.id, ...d.data() }]))

  // Distinct participating team ids per competition, from its matches. Fall back
  // to the match's denormalised team snapshot if a team doc is somehow missing.
  const participantsByComp = new Map()   // compId → Map(teamId → snapshot)
  const noTeamDoc = new Set()
  const addParticipant = (compId, teamId, snap) => {
    if (!teamId) return
    if (!participantsByComp.has(compId)) participantsByComp.set(compId, new Map())
    const m = participantsByComp.get(compId)
    if (!m.has(teamId)) m.set(teamId, snap)
  }
  for (const d of matchSnap.docs) {
    const m = d.data()
    if (!m.competitionId || !compIds.has(m.competitionId)) continue
    const home = teamsById.get(m.homeTeamId)
    const away = teamsById.get(m.awayTeamId)
    if (m.homeTeamId) {
      addParticipant(m.competitionId, m.homeTeamId, home
        ? { teamName: home.displayName, orgName: home.orgName ?? null, primaryColor: home.primaryColor ?? null, organizationId: home.organizationId ?? null }
        : { teamName: m.homeTeamName ?? null, orgName: m.homeOrgName ?? null, primaryColor: m.homeTeamColor ?? null, organizationId: m.homeOrgId ?? null })
      if (!home) noTeamDoc.add(m.homeTeamId)
    }
    if (m.awayTeamId) {
      addParticipant(m.competitionId, m.awayTeamId, away
        ? { teamName: away.displayName, orgName: away.orgName ?? null, primaryColor: away.primaryColor ?? null, organizationId: away.organizationId ?? null }
        : { teamName: m.awayTeamName ?? null, orgName: m.awayOrgName ?? null, primaryColor: m.awayTeamColor ?? null, organizationId: m.awayOrgId ?? null })
      if (!away) noTeamDoc.add(m.awayTeamId)
    }
  }

  const summary = { added: 0, skipped: 0, comps: 0 }
  let batch = db.batch(); let pending = 0
  const flush = async () => { if (pending && !DRY_RUN) { await batch.commit(); batch = db.batch(); pending = 0 } }

  for (const d of comps) {
    const compId = d.id
    const parts = participantsByComp.get(compId) || new Map()
    // Existing members to skip.
    const existing = new Set((await db.collection('competitions').doc(compId).collection('teams').get()).docs.map(x => x.id))
    let added = 0, skipped = 0
    for (const [teamId, snap] of parts) {
      if (existing.has(teamId)) { skipped++; continue }
      added++
      if (!DRY_RUN) {
        batch.set(db.collection('competitions').doc(compId).collection('teams').doc(teamId), {
          teamId,
          organizationId: snap.organizationId ?? null,
          claimed:        snap.organizationId != null,
          status:         'admin_approved',
          displaySnapshot: {
            teamName:     snap.teamName ?? null,
            orgName:      snap.orgName ?? null,
            primaryColor: snap.primaryColor ?? null,
          },
          addedAt: FieldValue.serverTimestamp(),
          addedBy: 'brief3a-backfill',
        })
        if (++pending >= 400) await flush()
      }
    }
    console.log(`  ${compName.get(compId)}: ${parts.size} participating, +${added} added, ${skipped} already listed`)
    summary.added += added; summary.skipped += skipped; summary.comps++
  }

  await flush()

  console.log('\n=== Summary ===')
  console.log(`  competitions:     ${summary.comps}`)
  console.log(`  memberships added:${summary.added}`)
  console.log(`  already listed:   ${summary.skipped}`)
  if (noTeamDoc.size) console.log(`  WARN team docs missing for ${noTeamDoc.size} id(s) — used match snapshot instead`)
  if (DRY_RUN) console.log('\n  DRY RUN — nothing was written.')
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
