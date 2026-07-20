// Match clock + half/period helpers.
//
// The timer is never persisted tick-by-tick. Elapsed time is computed from
// the match document's startedAt / pausedAt / totalPausedMs fields, so it
// survives page reloads and never drifts (always wall-clock based).

function toMillis(val) {
  if (!val) return null
  if (typeof val.toMillis === 'function') return val.toMillis()
  if (val instanceof Date) return val.getTime()
  return new Date(val).getTime()
}

// Elapsed match time in milliseconds, accounting for pauses and breaks.
// For final matches, uses endedAt instead of Date.now() so the clock shows
// the actual game duration rather than time-since-kickoff.
export function getElapsedMs(match) {
  if (!match?.startedAt) return 0
  const started     = toMillis(match.startedAt)
  if (started == null) return 0
  const totalPaused = match.totalPausedMs ?? 0
  const pausingNow  = match.pausedAt ? (Date.now() - toMillis(match.pausedAt)) : 0
  const refNow = (match.status === 'final' && match.endedAt)
    ? (toMillis(match.endedAt) ?? Date.now())
    : Date.now()
  return Math.max(0, (refNow - started) - totalPaused - pausingNow)
}

// mm:ss formatting for the running clock and timeline rows.
export function formatClock(ms) {
  const total = Math.floor((ms ?? 0) / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ── Half clock ──────────────────────────────────────────────────────────────
// Rugby time counts UP: the scorer's clock runs from 00:00 to the half length
// (40:00 for a senior half) and then keeps climbing into added time until the
// half is ended manually — a rugby half only ends when the ball goes dead
// after the hooter, never on the hooter itself.

// Nominal half/period length in ms from the fixture config.
export function periodLengthMs(match) {
  return (match?.periodMinutes ?? DEFAULT_PERIOD_MINUTES) * 60 * 1000
}

// Cumulative elapsed-ms at which the current half began, read from the last
// match_start / period_start entry in the control log. The clock is frozen
// during breaks, so this equals the total ACTUAL play time of all completed
// halves — which is why each new half restarts the clock at 00:00 regardless
// of how much added time earlier halves ran.
export function currentPeriodStartMs(match) {
  const log = match?.controlLog ?? []
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].type === 'match_start' || log[i].type === 'period_start') {
      return log[i].matchTimestamp ?? 0
    }
  }
  return 0
}

// Time elapsed within the current half — what the scorer's count-up clock shows.
export function periodElapsedMs(match) {
  return Math.max(0, getElapsedMs(match) - currentPeriodStartMs(match))
}

// Time remaining in the current half; negative once play runs into added time.
// Used to fire the hooter at 00:00 — nothing in the model stops the clock.
export function periodRemainingMs(match) {
  return periodLengthMs(match) - periodElapsedMs(match)
}

// ── Game-minute labels (timeline) ───────────────────────────────────────────
// Timeline stamps count UP in game minutes and are half-aware: completed
// halves contribute their NOMINAL length, never their actual duration, so a
// first half that ran 44 real minutes still hands the second half a 40'
// baseline (for 40-minute halves). An event in a half's added time is capped
// at the half's nominal end and flagged rugby-style: 40'+.
export function gameMinuteLabel(match, matchTimestamp) {
  const ts = matchTimestamp ?? 0
  const nominalMs  = periodLengthMs(match)
  const nominalMin = nominalMs / 60000
  // Cumulative elapsed-ms at which each half began, in order.
  const starts = (match?.controlLog ?? [])
    .filter(e => e.type === 'match_start' || e.type === 'period_start')
    .map(e => e.matchTimestamp ?? 0)
    .sort((a, b) => a - b)
  if (starts.length === 0) starts.push(0)
  let idx = 0
  for (let i = 0; i < starts.length; i++) if (ts >= starts[i]) idx = i
  const within   = ts - starts[idx]
  const baseline = idx * nominalMin
  if (within > nominalMs) return `${Math.floor(baseline + nominalMin)}'+`
  return `${Math.floor(baseline + within / 60000)}'`
}

// ── Half model ──────────────────────────────────────────────────────────────
// Derive half labels from the fixture's `periods` setting. Two halves is the
// rugby default; 3–4 periods model a knockout that goes to extra time.

export function periodLabels(periods) {
  const n = periods ?? 2
  if (n === 2) return ['1st Half', '2nd Half']
  if (n === 3) return ['1st Half', '2nd Half', 'Extra Time']
  if (n === 4) return ['1st Half', '2nd Half', 'ET 1st Half', 'ET 2nd Half']
  return Array.from({ length: n }, (_, i) => `Period ${i + 1}`)
}

// Match progression states used to decide which single control to show.
// currentPeriod stores either a play label, a break marker, or null.
export function isBreak(currentPeriod) {
  return currentPeriod === 'break' || currentPeriod === 'half_time'
}

// Given the fixture settings and current half, return the next action.
// Returns one of: { kind, label, period }
//   kind: 'end_period' | 'start_period' | 'end_match'
export function nextPeriodAction(match) {
  const labels = periodLabels(match?.periods)
  const current = match?.currentPeriod

  // Between halves → start next
  if (isBreak(current)) {
    const nextIndex = match?.nextPeriodIndex ?? 1
    if (nextIndex < labels.length) {
      return { kind: 'start_period', label: `Start ${labels[nextIndex]}`, period: labels[nextIndex], index: nextIndex }
    }
    return { kind: 'end_match', label: 'End match', period: null }
  }

  const idx = labels.indexOf(current)
  // If the stored label isn't in the current scheme — e.g. the half COUNT was
  // edited mid-match (a knockout extended into extra time, flipping the label
  // set) — fall back to the explicitly tracked position. During active play
  // the current half's index is always nextPeriodIndex - 1, so a count change
  // is honoured immediately.
  const resolvedIdx = idx >= 0 ? idx : ((match?.nextPeriodIndex ?? 1) - 1)
  const isLast = resolvedIdx >= labels.length - 1

  if (isLast) {
    return { kind: 'end_match', label: 'End match', period: null }
  }
  return { kind: 'end_period', label: `End ${current}`, period: current, index: resolvedIdx }
}

// Default fixture format when none is set — school/club fifteens: two
// 35-minute halves with a 10-minute half-time break. (Senior rugby plays
// 2 × 40; sevens plays 2 × 7 — both configurable per competition/fixture.)
export const DEFAULT_PERIODS = 2
export const DEFAULT_PERIOD_MINUTES = 35
// Default break between halves in minutes (one entry per gap = periods - 1).
export const DEFAULT_BREAK_MINUTES = [10]
// Sevens defaults, used when a fixture is flagged sevens.
export const SEVENS_PERIOD_MINUTES = 7
export const SEVENS_BREAK_MINUTES = [2]

// The match format new fixtures should default to: the competition's configured
// `matchFormat` when set, otherwise the platform default. Callers spread this
// into a new fixture; the per-fixture form can still override it (e.g. a final
// played to a different format, or extended for extra time).
export function competitionMatchFormat(competition) {
  const f = competition?.matchFormat
  if (f && Number(f.periods) > 0) {
    return {
      periods:       Number(f.periods),
      periodMinutes: Number(f.periodMinutes ?? DEFAULT_PERIOD_MINUTES),
      breakMinutes:  Array.isArray(f.breakMinutes) ? f.breakMinutes : DEFAULT_BREAK_MINUTES,
      sevens:        f.sevens === true,
    }
  }
  return { periods: DEFAULT_PERIODS, periodMinutes: DEFAULT_PERIOD_MINUTES, breakMinutes: DEFAULT_BREAK_MINUTES, sevens: false }
}

// Rough expected full-time, in epoch ms: kickoff + all half minutes + breaks
// + a buffer. Used ONLY to surface a possibly-unfinished match to humans (the
// scorer nudge and the admin dashboard flag — spec §7); never to change state.
// Wall-clock based (an abandoned match is detected by real time elapsed, not
// game clock). Returns null when the match has not started.
export function expectedEndMs(match, bufferMinutes = 30) {
  const raw = match?.startedAt
  const startMs = raw?.toMillis ? raw.toMillis()
    : (typeof raw === 'number' ? raw : (raw ? new Date(raw).getTime() : null))
  if (startMs == null || Number.isNaN(startMs)) return null
  const periods   = match.periods ?? DEFAULT_PERIODS
  const periodMin = match.periodMinutes ?? DEFAULT_PERIOD_MINUTES
  const breakMin  = Array.isArray(match.breakMinutes)
    ? match.breakMinutes.reduce((a, b) => a + (Number(b) || 0), 0) : 0
  return startMs + (periods * periodMin + breakMin + bufferMinutes) * 60000
}

// Is a started match past its rough expected end (+ buffer)? A signal that a
// tracked match may have been abandoned without the scorer tapping End.
export function isPastExpectedEnd(match, bufferMinutes = 30) {
  const end = expectedEndMs(match, bufferMinutes)
  return end != null && Date.now() > end
}
