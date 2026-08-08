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
  collection, doc, addDoc, getDoc, setDoc, updateDoc, serverTimestamp, arrayUnion,
} from 'firebase/firestore'
import { db, auth } from '../firebase'
import { generatePersonSlug } from './adminQueries'
import { positionForNumber, splitName } from './teamSheet'

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
export function matchRowsToPeople(rows, people, { orgId = null } = {}) {
  const pool = (people ?? []).map(p => ({
    ...p,
    _norm: norm(p.fullName),
    _surname: norm(p.fullName).split(' ').pop() ?? '',
  }))

  return rows.map(row => {
    const fullName = `${row.firstName} ${row.lastName}`.trim()
    const key = norm(fullName)
    if (!key || row.unreadable) return { ...row, match: { status: 'new' } }

    const exact = pool.filter(p => p._norm === key)
    if (exact.length === 1) {
      const p = exact[0]
      return { ...row, match: { status: 'linked', personId: p.id, personName: p.fullName, photoUrl: p.photoUrl ?? null } }
    }
    if (exact.length > 1) {
      const withOrg = orgId
        ? exact.filter(p => (p.representativeOrgIds ?? []).includes(orgId))
        : []
      if (withOrg.length === 1) {
        const p = withOrg[0]
        return { ...row, match: { status: 'linked', personId: p.id, personName: p.fullName, photoUrl: p.photoUrl ?? null } }
      }
      return { ...row, match: { status: 'ambiguous', candidates: exact.map(stripCandidate) } }
    }

    // Partial: same surname + same first initial → plausible, ask.
    const surname = norm(row.lastName)
    const initial = norm(row.firstName)[0] ?? ''
    if (surname) {
      const partial = pool.filter(p =>
        p._surname === surname && (!initial || norm(p.fullName)[0] === initial))
      if (partial.length > 0) {
        return { ...row, match: { status: 'ambiguous', candidates: partial.map(stripCandidate) } }
      }
    }
    return { ...row, match: { status: 'new' } }
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

  return squad
}
