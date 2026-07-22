// Pure standings computation — no Firebase reads or writes.
//
// computeStandings(competition, members, fixtures, matches, options) →
//   { rows, manualDecisionRequired }
//
// rows: sorted array of team stat rows. Each row has:
//   pos, teamId, teamName, P, W, D, L, PF, PA, PD, TF, BP, Pts,
//   manualDecisionRequired
//
//   PF/PA/PD — match points for / against / difference
//   TF       — tries scored (only fixtures whose try count is known contribute)
//   BP       — bonus points earned (try + losing bonuses), already included
//              in Pts; broken out so the log can display them
//
// manualDecisionRequired: array of { pos, teamIds } for groups where the
//   tie-breaker chain reached `manualDecision` (or was exhausted) AND no
//   recorded manual placement covers every team in the group. The UI MUST
//   surface a "Manual decision required" warning for these groups — the
//   engine will never invent an ordering alphabetically or randomly.
//
// options.manualOverrides: array of { placements: [{ teamId, position }] }
//   (the pool's recorded manual placements). When every team in a tied group
//   has a recorded placement, that explicit administrator order is applied,
//   the group is marked resolved (manuallyPlaced: true) and it no longer
//   appears in manualDecisionRequired. The engine still never decides — it
//   only applies an order an administrator explicitly recorded.

import { fixtureContribution } from './fixtureResult.js'
import { DEFAULT_BONUS_POINTS } from './competitionRules.js'

const CONFIRMED = new Set(['accepted', 'admin_approved'])

// Fair play: yellow=1pt, red=3pts. A 20-minute red (red20) counts as a red.
// Lower score is better (direction: 'asc').
const FAIR_PLAY_WEIGHTS = { yellow: 1, red20: 3, red: 3 }

function mkStats(teamId) {
  return { teamId, P: 0, W: 0, D: 0, L: 0, PF: 0, PA: 0, PD: 0, TF: 0, BP: 0, Pts: 0, fairPlayScore: 0 }
}

// Log points each side earns from one result, bonus points included.
// Returns { home: { pts, bp }, away: { pts, bp } } so the same rule is applied
// identically by the full table and the head-to-head mini-table.
//   • Try bonus: `tryBonusThreshold`+ tries, either side, win or lose. Only
//     when the try count is KNOWN (non-null) — unknown never earns a bonus.
//   • Losing bonus: losing by `losingBonusMargin` or fewer match points.
function matchPointsAward(homePoints, awayPoints, homeTries, awayTries, pts, bonus) {
  const b = { ...DEFAULT_BONUS_POINTS, ...(bonus ?? {}) }
  const award = { home: { pts: 0, bp: 0 }, away: { pts: 0, bp: 0 } }

  if (homePoints > awayPoints) {
    award.home.pts = pts.win ?? 4;  award.away.pts = pts.loss ?? 0
    if (b.losingBonus && (homePoints - awayPoints) <= (b.losingBonusMargin ?? 7)) award.away.bp++
  } else if (awayPoints > homePoints) {
    award.away.pts = pts.win ?? 4;  award.home.pts = pts.loss ?? 0
    if (b.losingBonus && (awayPoints - homePoints) <= (b.losingBonusMargin ?? 7)) award.home.bp++
  } else {
    award.home.pts = pts.draw ?? 2; award.away.pts = pts.draw ?? 2
  }

  if (b.tryBonus) {
    const threshold = b.tryBonusThreshold ?? 4
    if (homeTries != null && homeTries >= threshold) award.home.bp++
    if (awayTries != null && awayTries >= threshold) award.away.bp++
  }

  award.home.pts += award.home.bp
  award.away.pts += award.away.bp
  return award
}

function applyResult(stats, homeId, awayId, c, pts, bonus) {
  const h = stats[homeId]
  const a = stats[awayId]
  if (!h || !a) return
  const homePoints = c.home, awayPoints = c.away
  h.P++; a.P++
  h.PF += homePoints; h.PA += awayPoints; h.PD = h.PF - h.PA
  a.PF += awayPoints; a.PA += homePoints; a.PD = a.PF - a.PA
  if (c.homeTries != null) h.TF += c.homeTries
  if (c.awayTries != null) a.TF += c.awayTries
  if (homePoints > awayPoints)      { h.W++; a.L++ }
  else if (awayPoints > homePoints) { h.L++; a.W++ }
  else                              { h.D++; a.D++ }
  // Awarded results (walkover etc.) earn the win points but never a bonus —
  // fixtureContribution reports their tries as null, and a losing bonus for a
  // team that never took the field would be absurd.
  const award = c.awarded
    ? matchPointsAward(homePoints, awayPoints, null, null, pts, { losingBonus: false, tryBonus: false })
    : matchPointsAward(homePoints, awayPoints, c.homeTries, c.awayTries, pts, bonus)
  h.Pts += award.home.pts; h.BP += award.home.bp
  a.Pts += award.away.pts; a.BP += award.away.bp
}

function applyCards(stats, homeId, awayId, cards) {
  if (!Array.isArray(cards)) return
  for (const c of cards) {
    if (c.status === 'reversed') continue
    const id = c.side === 'home' ? homeId : awayId
    if (stats[id] !== undefined) stats[id].fairPlayScore += FAIR_PLAY_WEIGHTS[c.cardType] ?? 0
  }
}

function getStatValue(key, row) {
  switch (key) {
    case 'points':           return row.Pts
    case 'pointsDifference': return row.PD
    case 'pointsFor':        return row.PF
    case 'pointsAgainst':    return row.PA
    case 'triesFor':         return row.TF
    case 'wins':             return row.W
    case 'fairPlayScore':    return row.fairPlayScore ?? 0
    default:                 return 0
  }
}

// Compute mini-table stats restricted to matches BETWEEN teams in the group.
// Returns an array of { teamId, Pts, PD, PF } — only what H2H sorting needs.
// Bonus points count here exactly as they do in the full log.
function computeH2HStats(group, fixtures, matches, pts, bonus) {
  const groupIds = new Set(group.map(t => t.teamId))
  const h2h = {}
  for (const t of group) h2h[t.teamId] = { teamId: t.teamId, Pts: 0, PD: 0, PF: 0, PA: 0 }
  for (const fx of fixtures) {
    if (!fx.countsTowardStandings) continue
    const match = matches[fx.matchId]
    if (!match || match.status !== 'final') continue
    const hId = fx.homeTeamId ?? match.homeTeamId
    const aId = fx.awayTeamId ?? match.awayTeamId
    if (!groupIds.has(hId) || !groupIds.has(aId)) continue
    const c = fixtureContribution(match)
    if (!c.standings) continue
    const hp = c.home, ap = c.away
    h2h[hId].PF += hp; h2h[hId].PA += ap; h2h[hId].PD = h2h[hId].PF - h2h[hId].PA
    h2h[aId].PF += ap; h2h[aId].PA += hp; h2h[aId].PD = h2h[aId].PF - h2h[aId].PA
    const award = c.awarded
      ? matchPointsAward(hp, ap, null, null, pts, { losingBonus: false, tryBonus: false })
      : matchPointsAward(hp, ap, c.homeTries, c.awayTries, pts, bonus)
    h2h[hId].Pts += award.home.pts
    h2h[aId].Pts += award.away.pts
  }
  return Object.values(h2h)
}

// Partition a sorted array into runs of equal values and recursively sort
// each run of size > 1 with the remaining tie-breakers.
function splitEqualRuns(sorted, equalFn, recurse) {
  const result = []
  let i = 0
  while (i < sorted.length) {
    let j = i + 1
    while (j < sorted.length && equalFn(sorted[i], sorted[j])) j++
    const run = sorted.slice(i, j)
    if (run.length === 1) result.push({ teams: run, manual: false })
    else result.push(...recurse(run))
    i = j
  }
  return result
}

// Sort a group of teams by the tie-breaker chain.
// Returns: Array<{ teams: Team[], manual: boolean }>
//   manual=true → these teams could not be separated; UI must show warning.
function sortGroup(group, tieBreakers, fixtures, matches, pts, bonus) {
  if (group.length <= 1) return [{ teams: group, manual: false }]
  if (tieBreakers.length === 0) return [{ teams: group, manual: true }]

  const [tb, ...rest] = tieBreakers

  if (tb.key === 'manualDecision') return [{ teams: group, manual: true }]

  if (tb.key === 'headToHeadMiniTable') {
    const h2hRows = computeH2HStats(group, fixtures, matches, pts, bonus)
    const h2hById = Object.fromEntries(h2hRows.map(r => [r.teamId, r]))
    const sorted = [...group].sort((a, b) => {
      const ha = h2hById[a.teamId], hb = h2hById[b.teamId]
      return (hb.Pts - ha.Pts) || (hb.PD - ha.PD) || (hb.PF - ha.PF)
    })
    return splitEqualRuns(
      sorted,
      (a, b) => {
        const ha = h2hById[a.teamId], hb = h2hById[b.teamId]
        return ha.Pts === hb.Pts && ha.PD === hb.PD && ha.PF === hb.PF
      },
      g => sortGroup(g, rest, fixtures, matches, pts, bonus),
    )
  }

  // Standard numeric tie-breaker
  const sorted = [...group].sort((a, b) => {
    const av = getStatValue(tb.key, a)
    const bv = getStatValue(tb.key, b)
    return tb.direction === 'asc' ? av - bv : bv - av
  })
  return splitEqualRuns(
    sorted,
    (a, b) => getStatValue(tb.key, a) === getStatValue(tb.key, b),
    g => sortGroup(g, rest, fixtures, matches, pts, bonus),
  )
}

export function computeStandings(competition, members, fixtures, matchesInput, { manualOverrides = [] } = {}) {
  const pts = competition.rules?.points ?? { win: 4, draw: 2, loss: 0 }
  const bonus = competition.rules?.bonusPoints ?? DEFAULT_BONUS_POINTS
  const tieBreakers = competition.rules?.tieBreakers ?? []

  // Flatten recorded manual placements to teamId → position. Later overrides
  // win (they are appended chronologically by setPoolManualPlacement).
  const manualPos = {}
  for (const ov of manualOverrides ?? []) {
    for (const p of ov?.placements ?? []) {
      if (p && p.teamId != null && p.position != null) manualPos[p.teamId] = p.position
    }
  }

  const matchesMap = Array.isArray(matchesInput)
    ? Object.fromEntries(matchesInput.map(m => [m.id, m]))
    : (matchesInput ?? {})

  const confirmedMembers = (members ?? []).filter(m => CONFIRMED.has(m.status))
  const confirmedIds = new Set(confirmedMembers.map(m => m.teamId))

  const stats = {}
  const teamNames = {}
  const teamOrgNames = {}
  for (const m of confirmedMembers) {
    stats[m.teamId] = mkStats(m.teamId)
    teamNames[m.teamId] = m.displaySnapshot?.teamName ?? m.teamId
    teamOrgNames[m.teamId] = m.displaySnapshot?.orgName ?? null
  }

  let played = 0
  for (const fx of fixtures ?? []) {
    if (!fx.countsTowardStandings) continue
    const match = matchesMap[fx.matchId]
    if (!match) continue
    // The banner flag decides whether (and with what score) a fixture counts:
    // Awarded/Final count; Not-played/Frozen do not.
    const c = fixtureContribution(match)
    if (!c.standings) continue
    const hId = fx.homeTeamId ?? match.homeTeamId
    const aId = fx.awayTeamId ?? match.awayTeamId
    if (!confirmedIds.has(hId) || !confirmedIds.has(aId)) continue
    applyResult(stats, hId, aId, c, pts, bonus)
    // Cards apply for genuinely-played results only (not awarded allocations).
    if (c.stats) applyCards(stats, hId, aId, match.cards)
    played++
  }

  const teams = confirmedMembers.map(m => ({ ...stats[m.teamId], teamName: teamNames[m.teamId], orgName: teamOrgNames[m.teamId] }))

  // Before ANY match has been played the log has no sporting order yet — the
  // points/tie-breaker calculation would just report every team as tied. Until
  // then, list teams ALPHABETICALLY (by full org + team label). The configured
  // scoring/tie-breaker system kicks in as soon as the first result is in.
  if (played === 0) {
    const labelOf = t => `${t.orgName ? t.orgName + ' ' : ''}${t.teamName ?? ''}`.trim().toLowerCase()
    const sorted = [...teams].sort((a, b) => labelOf(a).localeCompare(labelOf(b)))
    return {
      rows: sorted.map((team, i) => ({ pos: i + 1, ...team, manualDecisionRequired: false })),
      manualDecisionRequired: [],
    }
  }

  const groups = sortGroup(teams, tieBreakers, fixtures ?? [], matchesMap, pts, bonus)

  const rows = []
  const manualDecisionRequired = []
  let pos = 1
  for (const group of groups) {
    if (group.manual) {
      // A recorded manual placement resolves the tie — but only when it covers
      // EVERY team in the group. A partial placement never silently orders
      // the remaining teams.
      const fullyPlaced = group.teams.length > 0
        && group.teams.every(t => manualPos[t.teamId] != null)
      if (fullyPlaced) {
        const ordered = [...group.teams].sort((a, b) => manualPos[a.teamId] - manualPos[b.teamId])
        for (const team of ordered) {
          rows.push({ pos, ...team, manualDecisionRequired: false, manuallyPlaced: true })
          pos++
        }
      } else {
        manualDecisionRequired.push({ pos, teamIds: group.teams.map(t => t.teamId) })
        for (const team of group.teams) {
          rows.push({ pos, ...team, manualDecisionRequired: true })
        }
        pos += group.teams.length
      }
    } else {
      for (const team of group.teams) {
        rows.push({ pos, ...team, manualDecisionRequired: false })
        pos++
      }
    }
  }

  return { rows, manualDecisionRequired }
}

// Compute pool standings — identical engine, restricted to the fixtures assigned
// to one pool AND to the teams assigned to that pool's slots. The caller passes
// only that pool's fixture-membership records plus poolTeamIds taken from
// pool.slots[].teamId — the single source of truth for pool membership
// (membership.poolId is a dead field and must not be used).
// Same eligibility and manual-decision guarantees as the full table.
export function computePoolStandings(competition, members, poolFixtures, matchesInput, {
  poolTeamIds = null, manualOverrides = [],
} = {}) {
  const scopedMembers = poolTeamIds
    ? (members ?? []).filter(m => poolTeamIds.includes(m.teamId))
    : (members ?? [])
  return computeStandings(competition, scopedMembers, poolFixtures, matchesInput, { manualOverrides })
}

// Festival informational stats — accumulation WITHOUT ranking. There is no
// position, no points-based sort, no winner. Rows are returned in the order the
// members were supplied (a stable, non-decisive order). This is deliberately
// NOT a standings table; the UI must label it as informational only.
export function computeFestivalStats(competition, members, fixtures, matchesInput) {
  const matchesMap = Array.isArray(matchesInput)
    ? Object.fromEntries(matchesInput.map(m => [m.id, m]))
    : (matchesInput ?? {})

  const confirmedMembers = (members ?? []).filter(m => CONFIRMED.has(m.status))
  const confirmedIds = new Set(confirmedMembers.map(m => m.teamId))

  const stats = {}
  const teamNames = {}
  const teamOrgNames = {}
  for (const m of confirmedMembers) {
    stats[m.teamId] = mkStats(m.teamId)
    teamNames[m.teamId] = m.displaySnapshot?.teamName ?? m.teamId
    teamOrgNames[m.teamId] = m.displaySnapshot?.orgName ?? null
  }

  for (const fx of fixtures ?? []) {
    // Festival fixtures are created with countsTowardStandings:false (no official
    // standings), but ALL final festival matches count for informational stats.
    const match = matchesMap[fx.matchId]
    if (!match || match.status !== 'final') continue
    const hId = fx.homeTeamId ?? match.homeTeamId
    const aId = fx.awayTeamId ?? match.awayTeamId
    if (!confirmedIds.has(hId) || !confirmedIds.has(aId)) continue
    const c = fixtureContribution(match)
    // No log points at a festival — accumulate the informational counters only.
    const h = stats[hId], a = stats[aId]
    h.P++; a.P++
    h.PF += c.home; h.PA += c.away; h.PD = h.PF - h.PA
    a.PF += c.away; a.PA += c.home; a.PD = a.PF - a.PA
    if (c.homeTries != null) h.TF += c.homeTries
    if (c.awayTries != null) a.TF += c.awayTries
    if (c.home > c.away)      { h.W++; a.L++ }
    else if (c.away > c.home) { h.L++; a.W++ }
    else                      { h.D++; a.D++ }
  }

  // No sort — preserve membership order. No position field. Informational only.
  return confirmedMembers.map(m => ({
    teamId: m.teamId,
    teamName: teamNames[m.teamId],
    orgName: teamOrgNames[m.teamId],
    P: stats[m.teamId].P, W: stats[m.teamId].W, D: stats[m.teamId].D, L: stats[m.teamId].L,
    PF: stats[m.teamId].PF, PA: stats[m.teamId].PA, PD: stats[m.teamId].PD, TF: stats[m.teamId].TF,
  }))
}
