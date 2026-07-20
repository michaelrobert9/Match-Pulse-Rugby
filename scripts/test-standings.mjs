// Deterministic unit tests for src/lib/standings.js (rugby log rules).
// Run: node scripts/test-standings.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeStandings } from '../src/lib/standings.js'

// ── Helpers ────────────────────────────────────────────────────────────────

const POINTS = { win: 4, draw: 2, loss: 0 }
const BONUS_OFF = { tryBonus: false, tryBonusThreshold: 4, losingBonus: false, losingBonusMargin: 7 }
const BONUS_ON  = { tryBonus: true,  tryBonusThreshold: 4, losingBonus: true,  losingBonusMargin: 7 }

const TIE_BREAKERS = [
  { key: 'points',              direction: 'desc' },
  { key: 'headToHeadMiniTable', direction: 'desc' },
  { key: 'pointsDifference',    direction: 'desc' },
  { key: 'triesFor',            direction: 'desc' },
  { key: 'pointsFor',           direction: 'desc' },
  { key: 'pointsAgainst',       direction: 'asc'  },
  { key: 'wins',                direction: 'desc' },
  { key: 'manualDecision',      direction: null   },
]

const comp = (bonus = BONUS_OFF, tbs = TIE_BREAKERS) =>
  ({ id: 'c1', rules: { points: POINTS, bonusPoints: bonus, tieBreakers: tbs } })

const member = (teamId, status = 'accepted') =>
  ({ teamId, status, displaySnapshot: { teamName: teamId } })

// Final match between two teams. Tries default to unknown (no counters, no
// events) — exactly what a bare submitted result looks like.
const match = (id, homeId, awayId, homeScore, awayScore, status = 'final', extra = {}) =>
  ({ id, homeTeamId: homeId, awayTeamId: awayId, homeScore, awayScore, status, cards: [], ...extra })

// Fixture-membership join record.
const fixture = (matchId, homeId, awayId, counts = true) =>
  ({ matchId, homeTeamId: homeId, awayTeamId: awayId, countsTowardStandings: counts })

const row = (res, teamId) => res.rows.find(r => r.teamId === teamId)

// ── Core log mechanics ─────────────────────────────────────────────────────

test('1. A beats B: A gets 4pts/1W, B gets 0pts/1L; A ranked above B', () => {
  const res = computeStandings(
    comp(),
    [member('A'), member('B')],
    [fixture('m1', 'A', 'B')],
    [match('m1', 'A', 'B', 28, 3)],
  )
  const A = row(res, 'A'), B = row(res, 'B')
  assert.equal(A.Pts, 4);  assert.equal(A.W, 1); assert.equal(A.L, 0)
  assert.equal(A.PF, 28);  assert.equal(A.PA, 3); assert.equal(A.PD, 25)
  assert.equal(B.Pts, 0);  assert.equal(B.W, 0); assert.equal(B.L, 1)
  assert.equal(B.PF, 3);   assert.equal(B.PA, 28); assert.equal(B.PD, -25)
  assert.equal(A.pos, 1);  assert.equal(B.pos, 2)
  assert.equal(res.manualDecisionRequired.length, 0)
})

test('2. C draws D: both 2pts, P=1 D=1, PD=0', () => {
  const res = computeStandings(
    comp(),
    [member('C'), member('D')],
    [fixture('m1', 'C', 'D')],
    [match('m1', 'C', 'D', 13, 13)],
  )
  const C = row(res, 'C'), D = row(res, 'D')
  assert.equal(C.Pts, 2); assert.equal(C.D, 1); assert.equal(C.PD, 0)
  assert.equal(D.Pts, 2); assert.equal(D.D, 1); assert.equal(D.PD, 0)
  assert.equal(C.P, 1);   assert.equal(D.P, 1)
})

test('3. Only accepted + admin_approved teams appear in standings', () => {
  const res = computeStandings(
    comp(),
    [
      member('A', 'accepted'),
      member('B', 'admin_approved'),
      member('X', 'declined'),
      member('Y', 'withdrawn'),
      member('Z', 'invited'),
    ],
    [], [],
  )
  const ids = res.rows.map(r => r.teamId).sort()
  assert.deepEqual(ids, ['A', 'B'])
  assert.equal(res.rows.find(r => r.teamId === 'X'), undefined)
  assert.equal(res.rows.find(r => r.teamId === 'Z'), undefined)
})

test('4. Fixture involving a pending (invited) team is ignored', () => {
  const res = computeStandings(
    comp(),
    [member('A', 'accepted'), member('P', 'invited')],
    [fixture('m1', 'A', 'P')],
    [match('m1', 'A', 'P', 30, 0)],
  )
  // Pending team P must not appear at all.
  assert.equal(row(res, 'P'), undefined)
  // A is a confirmed member but its opponent is pending — result must be ignored.
  const A = row(res, 'A')
  assert.equal(A.P, 0)
  assert.equal(A.Pts, 0)
  assert.equal(A.PF, 0)
})

test('5. countsTowardStandings=false fixture is excluded', () => {
  const res = computeStandings(
    comp(),
    [member('A'), member('B')],
    [fixture('m1', 'A', 'B', /* counts= */ false)],
    [match('m1', 'A', 'B', 24, 0)],
  )
  const A = row(res, 'A'), B = row(res, 'B')
  assert.equal(A.P, 0); assert.equal(A.Pts, 0)
  assert.equal(B.P, 0); assert.equal(B.Pts, 0)
})

test('6. Equal points separated by points difference: better PD ranks higher', () => {
  // A and B both beat C (4pts each), but A wins by a bigger margin.
  // H2H does not apply (A and B never played each other), so PD decides.
  const res = computeStandings(
    comp(),
    [member('A'), member('B'), member('C')],
    [fixture('m1', 'A', 'C'), fixture('m2', 'B', 'C')],
    [
      match('m1', 'A', 'C', 45, 0),  // A: PD +45
      match('m2', 'B', 'C', 10, 0),  // B: PD +10
    ],
  )
  const A = row(res, 'A'), B = row(res, 'B')
  assert.equal(A.Pts, 4); assert.equal(B.Pts, 4)
  assert.equal(A.PD, 45); assert.equal(B.PD, 10)
  assert.equal(A.pos, 1); assert.equal(B.pos, 2)
  assert.equal(res.manualDecisionRequired.length, 0)
})

test('7. Points-tied cluster resolved by head-to-head mini-table', () => {
  // A beats B, D beats A, B beats C — margins all > 7 so no losing bonuses.
  // A, B, D all finish on 4pts — enter the H2H mini-table.
  // H2H results among {A,B,D}: D beat A, A beat B → strict order D > A > B.
  const res = computeStandings(
    comp(),
    [member('A'), member('B'), member('C'), member('D')],
    [fixture('m1', 'A', 'B'), fixture('m2', 'D', 'A'), fixture('m3', 'B', 'C')],
    [
      match('m1', 'A', 'B', 15, 3),   // A beats B
      match('m2', 'D', 'A', 22, 10),  // D beats A
      match('m3', 'B', 'C', 30, 8),   // B beats C
    ],
  )
  const A = row(res, 'A'), B = row(res, 'B'), D = row(res, 'D')
  // Confirm all three are level on raw points.
  assert.equal(A.Pts, 4); assert.equal(B.Pts, 4); assert.equal(D.Pts, 4)
  // H2H order: D > A > B.
  assert.equal(D.pos, 1); assert.equal(A.pos, 2); assert.equal(B.pos, 3)
  assert.ok(A.pos < B.pos, 'A should rank above B (A beat B head-to-head)')
  assert.ok(D.pos < A.pos, 'D should rank above A (D beat A head-to-head)')
  // Fully separated — no manual decision.
  assert.equal(res.manualDecisionRequired.length, 0)
})

test('8. Tie-breakers exhausted: MANUAL DECISION REQUIRED flagged, no ordering invented', () => {
  // A and B are statistically identical and never played each other.
  const res = computeStandings(
    comp(),
    [member('A'), member('B'), member('C'), member('D')],
    [fixture('m1', 'A', 'C'), fixture('m2', 'B', 'D')],
    [
      match('m1', 'A', 'C', 20, 8),  // A: 4pts, PF=20, PA=8, PD=+12, W=1
      match('m2', 'B', 'D', 20, 8),  // B: identical stats
    ],
  )
  const A = row(res, 'A'), B = row(res, 'B')
  assert.equal(A.Pts, B.Pts)
  assert.equal(A.PD,  B.PD)
  assert.equal(A.PF,  B.PF)
  assert.equal(A.PA,  B.PA)
  assert.equal(A.W,   B.W)
  // They share the same position (tie unresolved — no invented order).
  assert.equal(A.pos, B.pos)
  assert.equal(A.manualDecisionRequired, true)
  assert.equal(B.manualDecisionRequired, true)
  const grp = res.manualDecisionRequired.find(
    g => g.teamIds.includes('A') && g.teamIds.includes('B')
  )
  assert.ok(grp, 'expected manualDecisionRequired group with A and B')
  assert.equal(grp.teamIds.length, 2)
})

// ── Rugby bonus points ─────────────────────────────────────────────────────

test('9. Losing bonus: losing by 7 or fewer earns 1 log point', () => {
  const res = computeStandings(
    comp(BONUS_ON),
    [member('A'), member('B')],
    [fixture('m1', 'A', 'B')],
    [match('m1', 'A', 'B', 20, 15)],   // B loses by 5
  )
  const A = row(res, 'A'), B = row(res, 'B')
  assert.equal(A.Pts, 4); assert.equal(A.BP, 0)
  assert.equal(B.Pts, 1); assert.equal(B.BP, 1); assert.equal(B.L, 1)
})

test('10. Losing bonus boundary: exactly 7 earns it, 8 does not', () => {
  const res = computeStandings(
    comp(BONUS_ON),
    [member('A'), member('B'), member('C'), member('D')],
    [fixture('m1', 'A', 'B'), fixture('m2', 'C', 'D')],
    [
      match('m1', 'A', 'B', 17, 10),  // margin 7 → B gets the bonus
      match('m2', 'C', 'D', 18, 10),  // margin 8 → D does not
    ],
  )
  assert.equal(row(res, 'B').Pts, 1)
  assert.equal(row(res, 'D').Pts, 0)
})

test('11. Try bonus: 4+ tries earns 1 log point, win or lose; TF accumulates', () => {
  const res = computeStandings(
    comp(BONUS_ON),
    [member('A'), member('B')],
    [fixture('m1', 'A', 'B')],
    // A wins with 4 tries; B scores 4 tries too but loses by more than 7.
    [match('m1', 'A', 'B', 40, 26, 'final', { homeTries: 4, awayTries: 4 })],
  )
  const A = row(res, 'A'), B = row(res, 'B')
  assert.equal(A.Pts, 5); assert.equal(A.BP, 1); assert.equal(A.TF, 4)
  assert.equal(B.Pts, 1); assert.equal(B.BP, 1); assert.equal(B.TF, 4)
})

test('12. Try bonus: an UNKNOWN try count never counts as zero and never earns', () => {
  // Bare submitted result (no try fields, no events) — bonus rules on.
  const res = computeStandings(
    comp(BONUS_ON),
    [member('A'), member('B')],
    [fixture('m1', 'A', 'B')],
    [match('m1', 'A', 'B', 40, 0)],
  )
  const A = row(res, 'A')
  assert.equal(A.Pts, 4)   // no try bonus without a known count
  assert.equal(A.BP, 0)
  assert.equal(A.TF, 0)    // unknown contributes nothing to TF
})

test('13. Tries derived from scoring events when counters are absent', () => {
  const tryEvents = [
    { id: 'e1', side: 'home', scoreType: 'try', points: 5, status: 'active' },
    { id: 'e2', side: 'home', scoreType: 'try', points: 5, status: 'active' },
    { id: 'e3', side: 'home', scoreType: 'penalty_try', points: 7, status: 'active' },
    { id: 'e4', side: 'home', scoreType: 'try', points: 5, status: 'active' },
    { id: 'e5', side: 'home', scoreType: 'conversion', points: 2, status: 'active' },
  ]
  const res = computeStandings(
    comp(BONUS_ON),
    [member('A'), member('B')],
    [fixture('m1', 'A', 'B')],
    [match('m1', 'A', 'B', 24, 0, 'final', { scores: tryEvents })],
  )
  const A = row(res, 'A')
  assert.equal(A.TF, 4)    // 3 tries + 1 penalty try; the conversion is not a try
  assert.equal(A.Pts, 5)   // 4 win + 1 try bonus
})

test('14. Awarded walkover: standings count the score but never a bonus', () => {
  const res = computeStandings(
    comp(BONUS_ON),
    [member('A'), member('B')],
    [fixture('m1', 'A', 'B')],
    [match('m1', 'A', 'B', 28, 0, 'final', {
      outcome: { kind: 'walkover', flag: 'awarded', awardedTo: 'home' },
    })],
  )
  const A = row(res, 'A'), B = row(res, 'B')
  assert.equal(A.Pts, 4); assert.equal(A.BP, 0); assert.equal(A.W, 1)
  assert.equal(A.PF, 28); assert.equal(A.TF, 0)
  assert.equal(B.Pts, 0); assert.equal(B.BP, 0)  // no losing bonus on a walkover
})

test('15. H2H mini-table includes bonus points earned in the tied games', () => {
  // A, B, C round-robin, everyone 1W 1L (margins > 7 except where noted).
  // A beat B 20-15 (B losing bonus), B beat C 20-3, C beat A 30-10.
  // Raw: A 4, B 5 (4+1 LB), C 4 → B top on points; A vs C tied on 4.
  // H2H between {A, C}: C beat A → C above A.
  const res = computeStandings(
    comp(BONUS_ON),
    [member('A'), member('B'), member('C')],
    [fixture('m1', 'A', 'B'), fixture('m2', 'B', 'C'), fixture('m3', 'C', 'A')],
    [
      match('m1', 'A', 'B', 20, 15),
      match('m2', 'B', 'C', 20, 3),
      match('m3', 'C', 'A', 30, 10),
    ],
  )
  assert.equal(row(res, 'B').Pts, 5)
  assert.equal(row(res, 'B').pos, 1)
  assert.equal(row(res, 'C').pos, 2)   // won the H2H against A
  assert.equal(row(res, 'A').pos, 3)
  assert.equal(res.manualDecisionRequired.length, 0)
})
