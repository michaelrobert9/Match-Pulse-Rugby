// Rugby scoring model — the single source of truth for scoring-event types,
// their point values and their labels. Everything that records, displays or
// aggregates a scoring play (scorer console, match timeline, stats engine
// mirror in functions/statsEngine.js) derives from this module.
//
// The match document stores ONE array of scoring events (`match.scores`); the
// running homeScore/awayScore totals are incremented by each event's points at
// write time and are never recomputed from the array. Tries are additionally
// tallied on homeTries/awayTries because standings need the try count for
// bonus-point calculation without scanning every event.

export const SCORE_TYPES = [
  { key: 'try',         label: 'Try',         points: 5 },
  { key: 'conversion',  label: 'Conversion',  points: 2 },
  { key: 'penalty',     label: 'Penalty',     points: 3 },
  { key: 'drop_goal',   label: 'Drop Goal',   points: 3 },
  { key: 'penalty_try', label: 'Penalty Try', points: 7 },
]

export const SCORE_POINTS = Object.fromEntries(SCORE_TYPES.map(t => [t.key, t.points]))
export const SCORE_LABEL  = Object.fromEntries(SCORE_TYPES.map(t => [t.key, t.label]))

// Events that add to the tries tally. A penalty try counts as a try (World
// Rugby: 7 points, no conversion, counts toward try bonus points).
const TRY_KINDS = new Set(['try', 'penalty_try'])
// Events attributed to a kicker rather than a try scorer.
const KICK_KINDS = new Set(['conversion', 'penalty', 'drop_goal'])

export function isTryEvent(ev)  { return TRY_KINDS.has(ev?.scoreType) }
export function isKickEvent(ev) { return KICK_KINDS.has(ev?.scoreType) }

// Attribution label for an event's credited player: try scorers "score",
// kicks are "kicked".
export function scorerLabel(scoreType) {
  return KICK_KINDS.has(scoreType) ? 'Kicker' : 'Scorer'
}

// An event's point value. The stored `points` wins (it is what the score total
// was actually incremented by); the type default only covers legacy events.
export function scorePoints(ev) {
  const p = Number(ev?.points)
  if (Number.isFinite(p)) return p
  return SCORE_POINTS[ev?.scoreType] ?? 0
}

// Active (non-reversed) scoring events for a match.
export function activeScores(match) {
  return (match?.scores ?? []).filter(e => e.status !== 'reversed')
}

// A side's try count. The incrementally-maintained homeTries/awayTries field
// is authoritative; fall back to counting try events for matches that predate
// the field; null when the count is genuinely unknown (e.g. a submitted result
// with no tries entered) — standings must then skip try-bonus calculation
// rather than assume zero.
export function matchTries(match, side) {
  const field = side === 'home' ? match?.homeTries : match?.awayTries
  if (field != null) return Number(field)
  const events = activeScores(match).filter(e => e.side === side && isTryEvent(e))
  if (events.length > 0) return events.length
  // No field and no events: distinguish "no tries scored in a tracked match"
  // from "count never captured". A live-tracked or event-carrying match with
  // zero try events genuinely had none; a bare submitted result is unknown.
  if (match?.resultSource === 'tracked' || (match?.scores?.length ?? 0) > 0) return 0
  return null
}
