// Derived fixture line-ups for tournaments & festivals (platform brief §4, §9).
//
// The fixture line-up is DERIVED, not stored: it equals the competition squad
// minus exceptions. Nothing is written per fixture unless something changes.
// On transition to live (or an entered result) the resolved line-up is written
// into the match's own homeLineup/awayLineup — rugby's existing stored shape,
// which the scorer, the stats engine and historical pages already treat as
// immutable after final — and lineupMode flips to 'frozen'. Historical
// fixtures never mutate afterwards.
//
// Exceptions live on the match doc as (shared model, addendum B1/B2)
//   exceptions: [{ playerId, side, type: 'absent' | 'added' | 'override',
//                  shirtNumber?, position? }]
// 'override' is a PER-FIXTURE shirt-number override (rugby: the number changes
// and the position changes with it); it never touches the competition squad.
// The side field is part of the shared model: one match doc carries both
// teams, so each exception says which sheet it belongs to.
//
// Pure functions only — callers own all Firestore I/O.

import { positionForNumber } from './teamSheet'

// Bulk team sheets apply to tournaments and festivals ONLY. Leagues and
// standalone fixtures keep the existing per-match flow untouched.
export function isBulkLineupCompetition(competition) {
  return competition?.type === 'tournament' || competition?.type === 'festival'
}

// A side derives from the squad only while the fixture is still ahead of the
// freeze: not yet frozen, not live/final, and nothing stored manually. A
// non-empty stored array (legacy manual lineup) stays authoritative.
export function sideIsInherited(match, side) {
  if (!match) return false
  if (match.lineupMode === 'frozen') return false
  if (['live', 'paused', 'final', 'abandoned'].includes(match.status)) return false
  const stored = side === 'home' ? match.homeLineup : match.awayLineup
  return !(stored?.length > 0)
}

function exceptionsFor(match, side) {
  return (match?.exceptions ?? []).filter(e => e.side === side)
}

// Squad entry → line-up entry (the shape homeLineup/awayLineup already use,
// plus position + isCaptain which the rendered sheet reads from the entry).
function entryFromSquad(sq, override) {
  const shirtNumber = override?.shirtNumber ?? sq.shirtNumber ?? null
  const position = override
    ? (override.position ?? positionForNumber(override.shirtNumber))
    : (sq.position ?? positionForNumber(sq.shirtNumber))
  return {
    id: `sq-${sq.playerId}`,
    personId: sq.playerId,
    personName: sq.playerName ?? sq.name ?? '',
    photoUrl: sq.photoUrl ?? null,
    shirtNumber,
    position: position ?? null,
    isCaptain: sq.isCaptain === true,
    isStarter: shirtNumber != null && shirtNumber <= 15,
  }
}

// The resolved line-up for one side: competition squad minus 'absent'
// exceptions, with 'override' entries applied. Sorted by shirt number.
export function resolveSideLineup(match, side, member) {
  const squad = member?.squad ?? []
  if (squad.length === 0) return []
  const ex = exceptionsFor(match, side)
  const absent = new Set(ex.filter(e => e.type === 'absent').map(e => e.playerId))
  const overrides = new Map(
    ex.filter(e => e.type === 'override').map(e => [e.playerId, e])
  )
  return squad
    .filter(sq => !absent.has(sq.playerId))
    .map(sq => entryFromSquad(sq, overrides.get(sq.playerId)))
    .sort((a, b) => (a.shirtNumber ?? 999) - (b.shirtNumber ?? 999))
}

// ── Exception list manipulation (pure; caller writes the patch) ─────────────

export function toggleAbsent(exceptions, side, playerId) {
  const list = exceptions ?? []
  const has = list.some(e => e.side === side && e.playerId === playerId && e.type === 'absent')
  if (has) {
    return list.filter(e => !(e.side === side && e.playerId === playerId && e.type === 'absent'))
  }
  return [...list, { playerId, side, type: 'absent' }]
}

export function isAbsent(exceptions, side, playerId) {
  return (exceptions ?? []).some(e => e.side === side && e.playerId === playerId && e.type === 'absent')
}

// Per-fixture shirt-number override. The override updates that fixture's
// position too (derived from the new number) and never touches the
// competition squad. Passing null clears the override.
export function setNumberOverride(exceptions, side, playerId, shirtNumber) {
  const rest = (exceptions ?? []).filter(
    e => !(e.side === side && e.playerId === playerId && e.type === 'override')
  )
  if (shirtNumber == null) return rest
  return [...rest, {
    playerId, side, type: 'override',
    shirtNumber,
    position: positionForNumber(shirtNumber),
  }]
}

export function overrideFor(exceptions, side, playerId) {
  return (exceptions ?? []).find(
    e => e.side === side && e.playerId === playerId && e.type === 'override'
  ) ?? null
}
