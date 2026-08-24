// Bulk team-sheet persistence + profile matching (platform brief §4, §6).
//
// Matching bias: LINK rather than duplicate. A wrong link is visible and
// fixable; a duplicate profile is silent. Confident matches link with no
// prompt; only genuine ambiguity asks a question.
//
// Saving creates LIVE player profiles — the same people docs, through the same
// consent-gated creation path (creator attaches as manager), that the existing
// one-at-a-time flow uses. No shadow profiles, no unclaimed state.

import {
  collection, doc, addDoc, getDoc, getDocs, query, where, setDoc, updateDoc, serverTimestamp, arrayUnion,
} from 'firebase/firestore'
import { db, auth } from '../firebase'
import { generatePersonSlug, linkPersonToOrg, seedFixturesFromTeamSheet } from './adminQueries'
import { positionForNumber, splitName } from './teamSheet'
import { resolveSideLineup } from './lineupResolve'

const uid = () => auth?.currentUser?.uid ?? null

const norm = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z\s]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

// Decorate parsed rows with a match against existing player profiles.
// Returns rows with { match: { status: 'linked'|'ambiguous'|'new',
// personId?, personName?, photoUrl?, candidates? } }.
//
// people: the full profile pool (people read is public; the pool is fetched
// once per paste session). orgId: the team's organisation, used as the
// confident tiebreak — same name + same school/club is the same player.
//
// Bias towards SURFACING a match: a silent duplicate is worse than showing the
// user a candidate they can dismiss. Every profile is scored by ranked
// similarity and anything plausible is offered as a candidate to link — the
// user is never forced to link, but is never left creating a duplicate blind.
//   100 exact normalised full name
//    90 same first + same surname (extra middle name etc.)
//    70 same surname + same first initial
//    45 same surname
//    25 same first name (only when the entered name has more than one word)
export function matchRowsToPeople(rows, people, { orgId = null } = {}) {
  // Pre-normalise the pool once; skip merged tombstones (claimStatus 'merged').
  const pool = (people ?? [])
    .filter(p => p && p.claimStatus !== 'merged')
    .map(p => {
      const n = norm(p.fullName)
      const parts = n.split(' ').filter(Boolean)
      return { p, n, first: parts[0] ?? '', last: parts[parts.length - 1] ?? '' }
    })
    .filter(x => x.n)

  return rows.map(row => {
    const fullName = `${row.firstName} ${row.lastName}`.trim()
    const target = norm(fullName)
    if (!target || row.unreadable) return { ...row, match: { status: 'new' } }

    const tParts   = target.split(' ').filter(Boolean)
    const tFirst   = tParts[0]
    const tLast    = tParts[tParts.length - 1]
    const tInitial = tFirst?.[0]

    // Score every profile; keep anything plausible as a candidate.
    const scored = []
    for (const { p, n, first, last } of pool) {
      let score = 0
      if (n === target)                                                        score = 100
      else if (tLast && last === tLast && tFirst && first === tFirst)          score = 90
      else if (tLast && last === tLast && tInitial && first?.[0] === tInitial) score = 70
      else if (tLast && last === tLast)                                        score = 45
      else if (tFirst && first === tFirst && tParts.length > 1)                score = 25
      if (score > 0) scored.push({ p, n, score })
    }
    scored.sort((a, b) => b.score - a.score || a.n.localeCompare(b.n))
    const candidates = scored.slice(0, 8).map(s => stripCandidate(s.p))
    if (candidates.length === 0) return { ...row, match: { status: 'new' } }

    // A single exact-name match links by default (still overridable via the
    // chooser). If several share the exact name, org membership breaks the tie;
    // otherwise ask. Any other plausible candidates → ask.
    const exact = scored.filter(s => s.score === 100).map(s => s.p)
    if (exact.length === 1) {
      const p = exact[0]
      return { ...row, match: { status: 'linked', personId: p.id, personName: p.fullName, photoUrl: p.photoUrl ?? null, candidates } }
    }
    if (exact.length > 1 && orgId) {
      const inOrg = exact.filter(p => (p.representativeOrgIds ?? []).includes(orgId))
      if (inOrg.length === 1) {
        const p = inOrg[0]
        return { ...row, match: { status: 'linked', personId: p.id, personName: p.fullName, photoUrl: p.photoUrl ?? null, candidates } }
      }
    }
    return { ...row, match: { status: 'ambiguous', candidates } }
  })
}

function stripCandidate(p) {
  return {
    id: p.id,
    fullName: p.fullName,
    photoUrl: p.photoUrl ?? null,
    dateOfBirth: p.dateOfBirth ?? null,
    orgNames: (p.representativeOrgs ?? []).map(o => o.orgName).filter(Boolean),
  }
}

// Read the stored sheet (squad + staff) off the competition membership doc.
export async function fetchCompetitionTeamSheet(competitionId, teamId) {
  const snap = await getDoc(doc(db, 'competitions', competitionId, 'teams', teamId))
  if (!snap.exists()) return null
  const d = snap.data()
  return { squad: d.squad ?? [], staff: d.staff ?? [], member: { id: snap.id, ...d } }
}

// Ownerless profile creation (addendum Part A). Bulk paste creates REAL player
// profiles with NO owner: nobody claims rights over anyone, so there is
// nothing to consent to at creation. managerUids stays empty until the player
// (or, for a minor, their parent) claims the profile themselves.
// createdByUid is an AUDIT field only — no rule may read it to grant access.
// createdInCompetitionId / createdForTeamId carry the squad-write authority
// context the create rule checks.
export async function createUnclaimedProfile({
  firstName, lastName, position = null,
  orgId = null, orgName = null, competitionId, teamId,
}) {
  const fullName = `${firstName} ${lastName}`.trim()
  const slug = await generatePersonSlug(fullName)
  return addDoc(collection(db, 'people'), {
    fullName,
    firstName: firstName || splitName(fullName).firstName,
    lastName:  lastName  || splitName(fullName).lastName,
    roles: ['player'],
    position,
    ...(orgId ? {
      representativeOrgs: [{ orgId, orgName: orgName ?? null }],
      representativeOrgIds: [orgId],
    } : {}),
    ownerUid: null,
    guardianUids: [],
    managerUids: [],                          // empty at creation, always
    claimStatus: 'unclaimed',
    createdVia: 'teamSheet',
    createdByUid: uid(),                      // audit only
    createdInCompetitionId: competitionId,    // audit + create-rule context
    createdForTeamId: teamId ?? null,         // audit + create-rule context
    careerCaps: 0, careerTries: 0, careerPoints: 0,
    careerCards: { yellow: 0, red: 0 },
    slug,
    createdAt: serverTimestamp(),
  })
}

// Persist the confirmed grid. Creates OWNERLESS profiles for 'new' rows
// (addendum Part A — no consent, no manager), links everything else, and
// writes the squad + staff arrays onto the competition membership doc in one
// shot. Squad entries denormalise name/photo so fixture line-ups derive
// without a read per player.
export async function saveCompetitionTeamSheet(competitionId, teamId, {
  rows, staff = [], orgId = null, orgName = null,
} = {}) {
  const squad = []
  for (const row of rows) {
    const fullName = `${row.firstName} ${row.lastName}`.trim()
    if (!fullName) continue
    let personId = row.match?.personId ?? null
    let photoUrl = row.match?.photoUrl ?? null
    if (!personId) {
      const ref = await createUnclaimedProfile({
        firstName: row.firstName, lastName: row.lastName,
        position: row.position ?? null,
        orgId, orgName, competitionId, teamId,
      })
      personId = ref.id
      photoUrl = null
    }
    squad.push({
      playerId: personId,
      playerName: fullName,
      photoUrl: photoUrl ?? null,
      shirtNumber: row.shirtNumber ?? null,
      position: row.position ?? positionForNumber(row.shirtNumber) ?? null,
      isCaptain: row.isCaptain === true,
    })
  }

  // competitionIds union per player (append-only maintenance path in rules) —
  // committed before any stat write reads it, same as the one-at-a-time flow.
  await Promise.all(squad.map(s =>
    updateDoc(doc(db, 'people', s.playerId), {
      competitionIds: arrayUnion(competitionId),
    }).catch(() => {})
  ))

  const cleanStaff = (staff ?? [])
    .map(s => ({ role: s.role, name: (s.name ?? '').trim() }))
    .filter(s => s.name)

  await setDoc(doc(db, 'competitions', competitionId, 'teams', teamId), {
    squad,
    staff: cleanStaff,
    updatedAt: serverTimestamp(),
    updatedBy: uid(),
  }, { merge: true })

  // Give every pasted player a proper linked record right away: a competition
  // stat slice (so they show on the players list and accrue stats as fixtures
  // play) and a link to the team's org for the roll-up. Best-effort, idempotent.
  await ensureCompetitionSquadSlices(competitionId, teamId, squad).catch(() => {})
  if (orgId) {
    for (const s of squad) {
      if (s.playerId) await linkPersonToOrg(s.playerId, orgId, orgName ?? null).catch(() => {})
    }
  }

  // Link every pasted player into the team's actual fixtures (real lineups +
  // lineupPersonIds), so their profile lists those matches and the merge tool
  // can move them — the standard behaviour, not the derived-only sheet.
  await seedFixturesFromTeamSheet(competitionId, teamId, squad).catch(() => {})

  return squad
}

// Ensure a competition stat slice exists for EVERY player in a team's sheet the
// moment it is saved — so a pasted player has a proper, linked record on the
// players list right away, not only once a fixture is played. One slice per
// (person, team, competition); tallies start at 0 and the stats engine fills
// them in from played fixtures. Idempotent — existing slices are untouched.
export async function ensureCompetitionSquadSlices(competitionId, teamId, squad = []) {
  if (!competitionId || !teamId || !squad.length) return
  const [existingSnap, teamSnap, compSnap] = await Promise.all([
    getDocs(query(collection(db, 'players'),
      where('teamId', '==', teamId), where('competitionId', '==', competitionId))),
    getDoc(doc(db, 'teams', teamId)),
    getDoc(doc(db, 'competitions', competitionId)),
  ])
  const have = new Set(existingSnap.docs.map(d => d.data().personId).filter(Boolean))
  const t = teamSnap.exists() ? teamSnap.data() : {}
  const c = compSnap.exists() ? compSnap.data() : {}
  for (const s of squad) {
    const personId = s.playerId ?? s.personId
    if (!personId || have.has(personId)) continue
    have.add(personId)
    await addDoc(collection(db, 'players'), {
      personId,
      personName: s.playerName ?? s.personName ?? null,
      personSlug: s.personSlug ?? null,
      teamId, competitionId, season: null,
      organizationId: t.organizationId ?? null,
      shirtNumber: s.shirtNumber ?? null, position: s.position ?? null, isCaptain: s.isCaptain === true,
      caps: 0, tries: 0, conversions: 0, penalties: 0, dropGoals: 0, points: 0, cards: { yellow: 0, red: 0 },
      competitionName: c.name ?? null,
      competitionSeason: c.season ?? null,
      competitionStatus: c.status ?? null,
      teamDisplayName: t.displayName ?? null,
      teamPrimaryColor: t.primaryColor ?? null,
      createdBy: uid(), createdAt: serverTimestamp(),
    }).catch(() => {})
  }
}

// Write a whole side's fixture line-up directly from a confirmed grid — leagues
// and standalone fixtures (team-sheets-everywhere §3). Builds the squad from the
// grid rows exactly like saveCompetitionTeamSheet (creating ownerless profiles
// for new rows), then maps it through the shared resolveSideLineup and REPLACES
// that side's line-up on the match doc. It never touches the competition squad,
// the other side or the exceptions array, and it does NOT set lineupMode:'frozen'
// — freeze stays the "played" signal (§4), applied at start/result.
export async function saveFixtureLineup(matchId, side, {
  rows, orgId = null, orgName = null, competitionId = null, teamId = null,
} = {}) {
  const squad = []
  for (const row of rows) {
    const fullName = `${row.firstName} ${row.lastName}`.trim()
    if (!fullName) continue
    let personId = row.match?.personId ?? null
    let photoUrl = row.match?.photoUrl ?? null
    if (!personId) {
      const ref = await createUnclaimedProfile({
        firstName: row.firstName, lastName: row.lastName,
        position: row.position ?? null,
        orgId, orgName, competitionId, teamId,
      })
      personId = ref.id
      photoUrl = null
    }
    squad.push({
      playerId: personId,
      playerName: fullName,
      photoUrl: photoUrl ?? null,
      shirtNumber: row.shirtNumber ?? null,
      position: row.position ?? positionForNumber(row.shirtNumber) ?? null,
      isCaptain: row.isCaptain === true,
    })
  }

  // A real (league) competition keeps the competitionIds union in step, same as
  // the competition-squad path; a standalone fixture has no competition to add.
  if (competitionId) {
    await Promise.all(squad.map(s =>
      updateDoc(doc(db, 'people', s.playerId), {
        competitionIds: arrayUnion(competitionId),
      }).catch(() => {})
    ))
  }

  // Map the squad → line-up entries through the SAME resolver a freeze uses, so a
  // pasted line-up is identical in shape to an inherited one.
  const entries = resolveSideLineup({ exceptions: [] }, side, { squad })
  const ref = doc(db, 'matches', matchId)
  const snap = await getDoc(ref)
  const m = snap.exists() ? snap.data() : {}
  const field = side === 'home' ? 'homeLineup' : 'awayLineup'
  const otherField = side === 'home' ? 'awayLineup' : 'homeLineup'
  const other = m[otherField] ?? []
  const lineupPersonIds = [...new Set([...entries, ...other].map(e => e.personId).filter(Boolean))]
  await updateDoc(ref, {
    [field]: entries,
    lineupPersonIds,
    updatedAt: serverTimestamp(),
    updatedBy: uid(),
  })
  return entries
}
