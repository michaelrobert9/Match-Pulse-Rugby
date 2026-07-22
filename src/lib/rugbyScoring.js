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

// ── Cards / discipline ────────────────────────────────────────────────────────
// Rugby cards, with sin-bin length fixed by the match format rather than chosen
// per card:
//   Fifteens (XV): Yellow = 10-minute sin-bin, Red = 20-minute sin-bin (the
//                  player may be replaced after 20'), Permanent Red = sent off
//                  for the rest of the game.
//   Sevens (7s):   Yellow = 2-minute sin-bin, Red = sent off (there is no
//                  20-minute red in sevens — only two options).
//
// Stored card types:
//   'yellow' — temporary sin-bin (10' in fifteens, 2' in sevens)
//   'red20'  — 20-minute red card (fifteens only); player replaced after 20'
//   'red'    — permanent sending-off for the whole game
//
// For discipline stats and fair-play scoring, red20 and red both count as a
// "red"; only the sin-bin behaviour differs.
const CARD_CATEGORY = { yellow: 'yellow', red20: 'red', red: 'red' }

// Is this a sevens match? Falls back to fifteens when the flag is absent.
export function isSevensMatch(match) {
  return match?.sevens === true
}

// Yellow-card sin-bin length in minutes for the match's format.
export function yellowSinBinMinutes(match) {
  return isSevensMatch(match) ? 2 : 10
}

// The card types offered for a match, in display order, with format-correct
// labels and sin-bin descriptions:
//   Fifteens → yellow (10'), red20 "Red Card" (20'), red "Permanent Red" (off)
//   Sevens   → yellow (2'), red "Red Card" (off) — no third option
export function cardTypesForMatch(match) {
  if (isSevensMatch(match)) {
    return [
      { key: 'yellow', label: 'Yellow Card', duration: '2 min sin-bin', minutes: 2,    category: 'yellow' },
      { key: 'red',    label: 'Red Card',    duration: 'Sent off',      minutes: null,  category: 'red' },
    ]
  }
  return [
    { key: 'yellow', label: 'Yellow Card',   duration: '10 min sin-bin', minutes: 10,   category: 'yellow' },
    { key: 'red20',  label: 'Red Card',      duration: '20 min sin-bin', minutes: 20,   category: 'red' },
    { key: 'red',    label: 'Permanent Red', duration: 'Sent off',       minutes: null, category: 'red' },
  ]
}

// Discipline category for a stored card type: 'yellow' or 'red'. A red20 or a
// legacy/unknown non-yellow type both count as a red.
export function cardCategory(cardType) {
  return cardType === 'yellow' ? 'yellow' : (CARD_CATEGORY[cardType] ?? 'red')
}

// Tailwind dot/swatch colour for a card type: yellow vs red.
export function cardDotClass(cardType) {
  return cardCategory(cardType) === 'yellow' ? 'bg-yellow-400' : 'bg-red-500'
}

// Human label for a stored card type, format-aware. In fifteens a 'red' is a
// "Permanent Red"; in sevens (where there is no 20-minute red) a 'red' is just
// the "Red Card".
export function cardLabel(cardType, match) {
  if (cardType === 'yellow') return 'Yellow Card'
  if (cardType === 'red20')  return 'Red Card'
  // cardType === 'red' (or legacy)
  return isSevensMatch(match) ? 'Red Card' : 'Permanent Red'
}

// Sin-bin / sending-off description for a stored card event.
export function cardDurationText(ev, match) {
  const cardType = ev?.cardType
  if (cardType === 'red')   return 'Sent off'
  if (cardType === 'red20') return '20 min sin-bin'
  // yellow — the stored duration wins; otherwise the format default.
  const mins = Number(ev?.durationMinutes)
  if (Number.isFinite(mins) && mins > 0) return `${mins} min sin-bin`
  return `${yellowSinBinMinutes(match)} min sin-bin`
}
