// Competition rule templates, type metadata, and helpers.
//
// CRITICAL: A competition stores its OWN copy of its rules. These exported
// objects are templates used only to PRE-FILL a new competition at creation
// time — they are copied into the competition document and never referenced at
// runtime by a live competition. Changing a template here never changes the
// rules of any competition that already exists.
//
// This module is part of the competition schema foundation. It deliberately
// contains NO calculation logic (no standings engine, no advancement, no
// bracket inference) — only the shape of the rules and their defaults.

// ── Competition types ────────────────────────────────────────────────────────
// User-facing comparison data for the three supported competition types. Used to
// render the "what each type does / does not do" comparison at creation time.
export const COMPETITION_TYPES = {
  league: {
    value: 'league',
    label: 'League',
    summary: 'Season-long competition with a cumulative log table.',
    bestFor: 'Season-long competition',
    features: {
      fixtures: 'Yes', results: 'Yes', standings: 'Full table', rankings: 'Yes',
      knockouts: 'No', pools: 'No', bonusPoints: 'Optional', deciders: 'No', teamSchedules: 'Yes',
    },
  },
  tournament: {
    value: 'tournament',
    label: 'Tournament',
    summary: 'Short competitive event with pools and/or knockout stages.',
    bestFor: 'Short competitive event',
    features: {
      fixtures: 'Yes', results: 'Yes', standings: 'Pool standings', rankings: 'Yes',
      knockouts: 'Yes', pools: 'Yes', bonusPoints: 'Optional', deciders: 'Knockout use', teamSchedules: 'Yes',
    },
  },
  festival: {
    value: 'festival',
    label: 'Festival',
    summary: 'Showcase fixture collection. No winners, rankings or qualification.',
    bestFor: 'Showcase event',
    features: {
      fixtures: 'Yes', results: 'Yes', standings: 'Optional stats only', rankings: 'No official ranking',
      knockouts: 'No', pools: 'No', bonusPoints: 'No', deciders: 'No', teamSchedules: 'Yes',
    },
  },
}

export const COMPETITION_TYPE_ORDER = ['league', 'tournament', 'festival']

// ── Lifecycle ─────────────────────────────────────────────────────────────────
// A competition's lifecycle status is DERIVED automatically from its start and
// end datetimes — it is never set by hand. The three states are:
//   upcoming   — now is before startDate (or no start set yet)
//   live       — now is between startDate and endDate
//   completed  — now is after endDate
// Visibility is a SEPARATE concern, governed by the `published` flag (a
// competition is private while being set up, public once published).
export const COMPETITION_STATUSES = ['upcoming', 'live', 'completed']

// Normalise any stored date value (Firestore Timestamp, Date, epoch ms, or an
// ISO / datetime-local string) to epoch milliseconds, or null if absent/invalid.
function toMs(val) {
  if (val == null) return null
  if (typeof val === 'number') return val
  if (typeof val.toMillis === 'function') return val.toMillis()
  if (val instanceof Date) return val.getTime()
  const t = new Date(val).getTime()
  return Number.isNaN(t) ? null : t
}

// Derive the lifecycle status from the competition's start/end datetimes.
export function competitionLifecycle(competition, now = Date.now()) {
  const t     = typeof now === 'number' ? now : now.getTime()
  const start = toMs(competition?.startDate)
  const end   = toMs(competition?.endDate)
  if (start != null && t < start) return 'upcoming'
  if (end   != null && t > end)   return 'completed'
  if (start != null && t >= start) return 'live'
  return 'upcoming' // no start date yet
}

// ── Points ────────────────────────────────────────────────────────────────────
// Rugby log points: 4 for a win, 2 for a draw, 0 for a loss is the standard
// across World Rugby, URC, Currie Cup and SA school leagues.
export const DEFAULT_POINTS = { win: 4, draw: 2, loss: 0 }

export const POINTS_PRESETS = [
  { label: '4 / 2 / 0 (standard)', points: { win: 4, draw: 2, loss: 0 } },
  { label: '3 / 1 / 0',            points: { win: 3, draw: 1, loss: 0 } },
  { label: '2 / 1 / 0',            points: { win: 2, draw: 1, loss: 0 } },
]

// ── Bonus points ──────────────────────────────────────────────────────────────
// The standard rugby bonus-point system, on by default and configurable per
// competition:
//   • Try bonus    — 1 log point for scoring `tryBonusThreshold`+ tries
//                    (either team, win or lose). Default 4 (World Rugby / URC /
//                    Currie Cup standard; some competitions use a try-margin
//                    variant, which is not modelled in V1).
//   • Losing bonus — 1 log point for losing by `losingBonusMargin` or fewer
//                    match points. Default 7.
// A try bonus can only be earned when the fixture's try count is KNOWN (live
// scored, or entered with a submitted result) — an unknown count never counts
// as zero and never earns a bonus.
export const DEFAULT_BONUS_POINTS = {
  tryBonus: true,  tryBonusThreshold: 4,
  losingBonus: true, losingBonusMargin: 7,
}

// ── Tie-breakers ──────────────────────────────────────────────────────────────
// Default recommended rugby order, matching the World Rugby / URC / Six Nations
// / Currie Cup convention: log points, then head-to-head, then points
// difference, then tries scored — followed by points for, wins and finally
// discipline (fair play) before a manual administrator decision.
//
// `pointsAgainst` is deliberately NOT a step: once teams are level on points
// difference AND points for, points against is arithmetically identical, so it
// could never break a further tie. Alphabetical is intentionally absent — it
// may only ever be used for display stability, never to decide an outcome. If
// the chain is exhausted, callers must surface "Manual placement required"
// rather than inventing a winner (manualDecision is the explicit terminal step).
export const DEFAULT_TIE_BREAKERS = [
  { key: 'points',              label: 'Log points',                    direction: 'desc', scope: 'all_fixtures' },
  { key: 'headToHeadMiniTable', label: 'Head-to-head mini-table',       direction: 'desc', scope: 'head_to_head' },
  { key: 'pointsDifference',    label: 'Points difference',             direction: 'desc', scope: 'all_fixtures' },
  { key: 'triesFor',            label: 'Tries scored',                  direction: 'desc', scope: 'all_fixtures' },
  { key: 'pointsFor',           label: 'Points for',                    direction: 'desc', scope: 'all_fixtures' },
  { key: 'wins',                label: 'Wins',                          direction: 'desc', scope: 'all_fixtures' },
  { key: 'fairPlayScore',       label: 'Fair play',                     direction: 'asc',  scope: 'all_fixtures' },
  { key: 'manualDecision',      label: 'Manual administrator decision', direction: null,   scope: 'all_fixtures' },
]

// A walkover awards the opposing team a default scoreline; the conceding team
// records a loss. 28–0 is the World Rugby standard walkover score. Values are
// configurable per competition.
export const DEFAULT_WALKOVER_SCORE = { concedingTeam: 0, opposingTeam: 28 }

// Festival informational stats — fixed canonical column order. No position
// column, no sorting (V1). Off by default.
export const FESTIVAL_STATS_COLUMNS = [
  'played', 'won', 'drawn', 'lost', 'pointsFor', 'pointsAgainst', 'pointsDifference', 'triesFor',
]

// Build the default, fully self-contained rules object for a competition type.
// The returned object is a fresh deep copy safe to store on a new competition.
export function defaultRulesForType(type) {
  const rules = {
    points:        { ...DEFAULT_POINTS },
    bonusPoints:   { ...DEFAULT_BONUS_POINTS },
    tieBreakers:   DEFAULT_TIE_BREAKERS.map(t => ({ ...t })),
    walkoverScore: { ...DEFAULT_WALKOVER_SCORE },
  }
  if (type === 'tournament') rules.stages = []
  if (type === 'festival') {
    rules.statsTable  = { enabled: false, columns: [...FESTIVAL_STATS_COLUMNS] }
    // A festival has no log, so bonus points are meaningless there.
    rules.bonusPoints = { tryBonus: false, tryBonusThreshold: 4, losingBonus: false, losingBonusMargin: 7 }
  }
  return rules
}

// Deterministic, order-sensitive hash of a rules object. Stored on verified
// snapshots so a historical standings decision can be explained even if the
// competition's rules are later edited. Stable across key ordering via a sorted
// serialisation; djb2 over the result.
export function rulesHash(rules) {
  const json = stableStringify(rules ?? {})
  let h = 5381
  for (let i = 0; i < json.length; i++) h = (((h << 5) + h) + json.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}
