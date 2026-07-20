// Realistic SA rugby sample data matching the Firestore schema.
// Used as fallback when Firebase is not yet configured.

export const organizations = {
  'org-wp': {
    id: 'org-wp',
    name: 'Western Province',
    shortCode: 'WP',
    logoUrl: null,
    primaryColor: '#006B3C',
    secondaryColor: '#FFFFFF',
    type: 'club',
    region: 'Western Cape',
  },
  'org-gl': {
    id: 'org-gl',
    name: 'Golden Lions',
    shortCode: 'GL',
    logoUrl: null,
    primaryColor: '#CC0000',
    secondaryColor: '#FFFFFF',
    type: 'club',
    region: 'Gauteng',
  },
  'org-bb': {
    id: 'org-bb',
    name: 'Blue Bulls',
    shortCode: 'BB',
    logoUrl: null,
    primaryColor: '#003087',
    secondaryColor: '#FFFFFF',
    type: 'club',
    region: 'Gauteng North',
  },
  'org-fs': {
    id: 'org-fs',
    name: 'Free State',
    shortCode: 'FS',
    logoUrl: null,
    primaryColor: '#C8A400',
    secondaryColor: '#000000',
    type: 'club',
    region: 'Free State',
  },
}

export const competitions = {
  'comp-sprl-2026': {
    id: 'comp-sprl-2026',
    name: 'SA Provincial Rugby League',
    season: '2026',
    gender: 'men',
    ageGroup: 'senior',
    type: 'league',
    status: 'active',
    startDate: new Date('2026-02-14'),
    endDate: new Date('2026-09-26'),
  },
  'comp-sevens-2025': {
    id: 'comp-sevens-2025',
    name: 'Provincial Sevens Series',
    season: '2025',
    gender: 'men',
    ageGroup: 'senior',
    type: 'tournament',
    status: 'final',
    startDate: new Date('2025-11-29'),
    endDate: new Date('2025-12-07'),
  },
  'comp-sprl-2025': {
    id: 'comp-sprl-2025',
    name: 'SA Provincial Rugby League',
    season: '2025',
    gender: 'men',
    ageGroup: 'senior',
    type: 'league',
    status: 'final',
    startDate: new Date('2025-02-15'),
    endDate: new Date('2025-09-27'),
  },
  'comp-sevens-2024': {
    id: 'comp-sevens-2024',
    name: 'Provincial Sevens Series',
    season: '2024',
    gender: 'men',
    ageGroup: 'senior',
    type: 'tournament',
    status: 'final',
    startDate: new Date('2024-11-30'),
    endDate: new Date('2024-12-08'),
  },
  'comp-sprl-2024': {
    id: 'comp-sprl-2024',
    name: 'SA Provincial Rugby League',
    season: '2024',
    gender: 'men',
    ageGroup: 'senior',
    type: 'league',
    status: 'final',
    startDate: new Date('2024-02-17'),
    endDate: new Date('2024-09-28'),
  },
  'comp-u21-week-2023': {
    id: 'comp-u21-week-2023',
    name: 'U21 Provincial Week',
    season: '2023',
    gender: 'men',
    ageGroup: 'u21',
    type: 'tournament',
    status: 'final',
    startDate: new Date('2023-07-08'),
    endDate: new Date('2023-07-16'),
  },
}

// ── Teams (standings) ──────────────────────────────────────────────────────

export const teams = {
  'team-wp-sprl-2026': {
    id: 'team-wp-sprl-2026',
    competitionId: 'comp-sprl-2026',
    organizationId: 'org-wp',
    displayName: 'Western Province',
    shortCode: 'WP',
    primaryColor: '#006B3C',
    secondaryColor: '#FFFFFF',
    played: 7, won: 5, drawn: 0, lost: 2,
    pointsFor: 201, pointsAgainst: 138, points: 25,
  },
  'team-gl-sprl-2026': {
    id: 'team-gl-sprl-2026',
    competitionId: 'comp-sprl-2026',
    organizationId: 'org-gl',
    displayName: 'Golden Lions',
    shortCode: 'GL',
    primaryColor: '#CC0000',
    secondaryColor: '#FFFFFF',
    played: 7, won: 4, drawn: 1, lost: 2,
    pointsFor: 176, pointsAgainst: 154, points: 22,
  },
  'team-bb-sprl-2026': {
    id: 'team-bb-sprl-2026',
    competitionId: 'comp-sprl-2026',
    organizationId: 'org-bb',
    displayName: 'Blue Bulls',
    shortCode: 'BB',
    primaryColor: '#003087',
    secondaryColor: '#FFFFFF',
    played: 7, won: 3, drawn: 0, lost: 4,
    pointsFor: 149, pointsAgainst: 167, points: 16,
  },
  'team-fs-sprl-2026': {
    id: 'team-fs-sprl-2026',
    competitionId: 'comp-sprl-2026',
    organizationId: 'org-fs',
    displayName: 'Free State',
    shortCode: 'FS',
    primaryColor: '#C8A400',
    secondaryColor: '#000000',
    played: 7, won: 1, drawn: 1, lost: 5,
    pointsFor: 118, pointsAgainst: 185, points: 9,
  },
}

// ── Matches ─────────────────────────────────────────────────────────────────
// Sample fixtures use the legacy homeScorers/awayScorers shape (try scorers
// with minutes) plus explicit homeTries/awayTries counters — exactly what a
// submitted result with attribution looks like.

export const matches = {
  'match-001': {
    id: 'match-001',
    competitionId: 'comp-sprl-2026',
    homeTeamId: 'team-wp-sprl-2026',  homeTeamName: 'Western Province', homeTeamShortCode: 'WP', homeTeamColor: '#006B3C',
    awayTeamId: 'team-gl-sprl-2026',  awayTeamName: 'Golden Lions',     awayTeamShortCode: 'GL', awayTeamColor: '#CC0000',
    homeScore: 27, awayScore: 15,
    homeTries: 3, awayTries: 2,
    scheduledAt: new Date('2026-02-14T15:00:00'),
    pitch: 'Main Field', status: 'final',
    homeScorers: [
      { name: 'T. van der Merwe', minute: 12 },
      { name: 'T. van der Merwe', minute: 34 },
      { name: 'L. Abrahams',      minute: 56 },
    ],
    awayScorers: [
      { name: 'P. Mokoena', minute: 41 },
      { name: 'S. Radebe',  minute: 68 },
    ],
  },
  'match-002': {
    id: 'match-002',
    competitionId: 'comp-sprl-2026',
    homeTeamId: 'team-bb-sprl-2026', homeTeamName: 'Blue Bulls', homeTeamShortCode: 'BB', homeTeamColor: '#003087',
    awayTeamId: 'team-fs-sprl-2026', awayTeamName: 'Free State', awayTeamShortCode: 'FS', awayTeamColor: '#C8A400',
    homeScore: 13, awayScore: 20,
    homeTries: 1, awayTries: 2,
    scheduledAt: new Date('2026-02-14T17:15:00'),
    pitch: 'Field 2', status: 'final',
    homeScorers: [{ name: 'D. Groenewald', minute: 28 }],
    awayScorers: [{ name: 'J. van Wyk', minute: 17 }, { name: 'J. van Wyk', minute: 63 }],
  },
  'match-003': {
    id: 'match-003',
    competitionId: 'comp-sprl-2026',
    homeTeamId: 'team-wp-sprl-2026', homeTeamName: 'Western Province', homeTeamShortCode: 'WP', homeTeamColor: '#006B3C',
    awayTeamId: 'team-bb-sprl-2026', awayTeamName: 'Blue Bulls',       awayTeamShortCode: 'BB', awayTeamColor: '#003087',
    homeScore: 24, awayScore: 6,
    homeTries: 2, awayTries: 0,
    scheduledAt: new Date('2026-03-14T15:00:00'),
    pitch: 'Main Field', status: 'final',
    homeScorers: [{ name: 'T. van der Merwe', minute: 23 }, { name: 'L. Abrahams', minute: 67 }],
    awayScorers: [],
  },
  'match-004': {
    id: 'match-004',
    competitionId: 'comp-sprl-2026',
    homeTeamId: 'team-gl-sprl-2026', homeTeamName: 'Golden Lions', homeTeamShortCode: 'GL', homeTeamColor: '#CC0000',
    awayTeamId: 'team-fs-sprl-2026', awayTeamName: 'Free State',   awayTeamShortCode: 'FS', awayTeamColor: '#C8A400',
    homeScore: 22, awayScore: 22,
    homeTries: 2, awayTries: 2,
    scheduledAt: new Date('2026-03-14T17:15:00'),
    pitch: 'Field 2', status: 'final',
    homeScorers: [{ name: 'P. Mokoena', minute: 19 }, { name: 'P. Mokoena', minute: 55 }],
    awayScorers: [{ name: 'J. van Wyk', minute: 33 }, { name: 'R. Maharaj', minute: 78 }],
  },
  'match-005': {
    id: 'match-005',
    competitionId: 'comp-sprl-2026',
    homeTeamId: 'team-wp-sprl-2026', homeTeamName: 'Western Province', homeTeamShortCode: 'WP', homeTeamColor: '#006B3C',
    awayTeamId: 'team-gl-sprl-2026', awayTeamName: 'Golden Lions',     awayTeamShortCode: 'GL', awayTeamColor: '#CC0000',
    homeScore: 14, awayScore: 10,
    homeTries: 2, awayTries: 1,
    scheduledAt: new Date('2026-05-28T15:00:00'),
    pitch: 'Main Field', status: 'live',
    homeScorers: [{ name: 'T. van der Merwe', minute: 8 }, { name: 'M. de Beer', minute: 31 }],
    awayScorers: [{ name: 'P. Mokoena', minute: 44 }],
  },
  'match-006': {
    id: 'match-006',
    competitionId: 'comp-sprl-2026',
    homeTeamId: 'team-fs-sprl-2026', homeTeamName: 'Free State', homeTeamShortCode: 'FS', homeTeamColor: '#C8A400',
    awayTeamId: 'team-bb-sprl-2026', awayTeamName: 'Blue Bulls', awayTeamShortCode: 'BB', awayTeamColor: '#003087',
    homeScore: 0, awayScore: 0,
    homeTries: 0, awayTries: 0,
    scheduledAt: new Date('2026-05-28T17:15:00'),
    pitch: 'Field 2', status: 'scheduled', tracked: false,
    homeScorers: [], awayScorers: [],
  },
  'match-007': {
    id: 'match-007',
    competitionId: 'comp-sprl-2026',
    homeTeamId: 'team-bb-sprl-2026', homeTeamName: 'Blue Bulls',   homeTeamShortCode: 'BB', homeTeamColor: '#003087',
    awayTeamId: 'team-gl-sprl-2026', awayTeamName: 'Golden Lions', awayTeamShortCode: 'GL', awayTeamColor: '#CC0000',
    homeScore: 0, awayScore: 0,
    homeTries: 0, awayTries: 0,
    scheduledAt: new Date('2026-06-15T15:00:00'),
    pitch: 'Main Field', status: 'scheduled', tracked: false,
    homeScorers: [], awayScorers: [],
  },
  'match-008': {
    id: 'match-008',
    competitionId: 'comp-sprl-2026',
    homeTeamId: 'team-wp-sprl-2026', homeTeamName: 'Western Province', homeTeamShortCode: 'WP', homeTeamColor: '#006B3C',
    awayTeamId: 'team-fs-sprl-2026', awayTeamName: 'Free State',       awayTeamShortCode: 'FS', awayTeamColor: '#C8A400',
    homeScore: 0, awayScore: 0,
    homeTries: 0, awayTries: 0,
    scheduledAt: new Date('2026-07-20T15:00:00'),
    pitch: 'Main Field', status: 'scheduled', tracked: false,
    homeScorers: [], awayScorers: [],
  },
}

// ── People ──────────────────────────────────────────────────────────────────

export const people = {
  'person-tvdm-001': {
    id: 'person-tvdm-001',
    fullName: 'Tyrone van der Merwe',
    photoUrl: null,
    dateOfBirth: new Date('1998-03-15'),
    careerCaps: 94,
    careerTries: 47,
    careerPoints: 235,
    careerCards: { yellow: 4, red: 0 },
  },
  'person-pmokoena-002': {
    id: 'person-pmokoena-002',
    fullName: 'Phumlani Mokoena',
    photoUrl: null,
    dateOfBirth: new Date('2000-07-22'),
    careerCaps: 48,
    careerTries: 31,
    careerPoints: 155,
    careerCards: { yellow: 1, red: 0 },
  },
}

// ── Players ──────────────────────────────────────────────────────────────────

export const players = {
  // ── SA Provincial Rugby League 2026 — WP ─────────────────────────────────
  'player-wp-1': {
    id: 'player-wp-1', personId: 'p-smith', teamId: 'team-wp-sprl-2026', competitionId: 'comp-sprl-2026',
    personName: 'J. Smith', shirtNumber: 1, position: 'Prop', isCaptain: false,
    caps: 7, tries: 0, conversions: 0, penalties: 0, dropGoals: 0, points: 0, cards: { yellow: 0, red: 0 },
    teamDisplayName: 'Western Province', teamShortCode: 'WP', teamPrimaryColor: '#006B3C',
    competitionName: 'SA Provincial Rugby League', competitionSeason: '2026', competitionStatus: 'active',
  },
  'player-wp-5': {
    id: 'player-wp-5', personId: 'p-davids', teamId: 'team-wp-sprl-2026', competitionId: 'comp-sprl-2026',
    personName: 'R. Davids', shirtNumber: 5, position: 'Lock', isCaptain: false,
    caps: 7, tries: 0, conversions: 0, penalties: 0, dropGoals: 0, points: 0, cards: { yellow: 1, red: 0 },
    teamDisplayName: 'Western Province', teamShortCode: 'WP', teamPrimaryColor: '#006B3C',
    competitionName: 'SA Provincial Rugby League', competitionSeason: '2026', competitionStatus: 'active',
  },
  'player-wp-14': {
    id: 'player-tvdm-sprl-2026', personId: 'person-tvdm-001', teamId: 'team-wp-sprl-2026', competitionId: 'comp-sprl-2026',
    personName: 'T. van der Merwe', shirtNumber: 14, position: 'Wing', isCaptain: true,
    caps: 7, tries: 5, conversions: 0, penalties: 0, dropGoals: 0, points: 25, cards: { yellow: 1, red: 0 },
    teamDisplayName: 'Western Province', teamShortCode: 'WP', teamPrimaryColor: '#006B3C',
    competitionName: 'SA Provincial Rugby League', competitionSeason: '2026', competitionStatus: 'active',
  },
  'player-wp-10': {
    id: 'player-wp-10', personId: 'p-abrahams', teamId: 'team-wp-sprl-2026', competitionId: 'comp-sprl-2026',
    personName: 'L. Abrahams', shirtNumber: 10, position: 'Flyhalf', isCaptain: false,
    caps: 7, tries: 3, conversions: 12, penalties: 8, dropGoals: 1, points: 66, cards: { yellow: 0, red: 0 },
    teamDisplayName: 'Western Province', teamShortCode: 'WP', teamPrimaryColor: '#006B3C',
    competitionName: 'SA Provincial Rugby League', competitionSeason: '2026', competitionStatus: 'active',
  },
  'player-wp-12': {
    id: 'player-wp-12', personId: 'p-debeer', teamId: 'team-wp-sprl-2026', competitionId: 'comp-sprl-2026',
    personName: 'M. de Beer', shirtNumber: 12, position: 'Centre', isCaptain: false,
    caps: 6, tries: 2, conversions: 0, penalties: 0, dropGoals: 0, points: 10, cards: { yellow: 0, red: 0 },
    teamDisplayName: 'Western Province', teamShortCode: 'WP', teamPrimaryColor: '#006B3C',
    competitionName: 'SA Provincial Rugby League', competitionSeason: '2026', competitionStatus: 'active',
  },

  // ── SA Provincial Rugby League 2026 — Golden Lions ───────────────────────
  'player-gl-2': {
    id: 'player-gl-2', personId: 'p-singh', teamId: 'team-gl-sprl-2026', competitionId: 'comp-sprl-2026',
    personName: 'A. Singh', shirtNumber: 2, position: 'Hooker', isCaptain: false,
    caps: 7, tries: 0, conversions: 0, penalties: 0, dropGoals: 0, points: 0, cards: { yellow: 0, red: 0 },
    teamDisplayName: 'Golden Lions', teamShortCode: 'GL', teamPrimaryColor: '#CC0000',
    competitionName: 'SA Provincial Rugby League', competitionSeason: '2026', competitionStatus: 'active',
  },
  'player-gl-4': {
    id: 'player-gl-4', personId: 'p-pillay', teamId: 'team-gl-sprl-2026', competitionId: 'comp-sprl-2026',
    personName: 'K. Pillay', shirtNumber: 4, position: 'Lock', isCaptain: false,
    caps: 7, tries: 1, conversions: 0, penalties: 0, dropGoals: 0, points: 5, cards: { yellow: 1, red: 0 },
    teamDisplayName: 'Golden Lions', teamShortCode: 'GL', teamPrimaryColor: '#CC0000',
    competitionName: 'SA Provincial Rugby League', competitionSeason: '2026', competitionStatus: 'active',
  },
  'player-gl-9': {
    id: 'player-gl-9', personId: 'p-madlala', teamId: 'team-gl-sprl-2026', competitionId: 'comp-sprl-2026',
    personName: 'N. Madlala', shirtNumber: 9, position: 'Scrumhalf', isCaptain: false,
    caps: 7, tries: 2, conversions: 0, penalties: 0, dropGoals: 0, points: 10, cards: { yellow: 0, red: 0 },
    teamDisplayName: 'Golden Lions', teamShortCode: 'GL', teamPrimaryColor: '#CC0000',
    competitionName: 'SA Provincial Rugby League', competitionSeason: '2026', competitionStatus: 'active',
  },
  'player-gl-11': {
    id: 'player-gl-11', personId: 'person-pmokoena-002', teamId: 'team-gl-sprl-2026', competitionId: 'comp-sprl-2026',
    personName: 'P. Mokoena', shirtNumber: 11, position: 'Wing', isCaptain: true,
    caps: 7, tries: 4, conversions: 0, penalties: 0, dropGoals: 0, points: 20, cards: { yellow: 0, red: 0 },
    teamDisplayName: 'Golden Lions', teamShortCode: 'GL', teamPrimaryColor: '#CC0000',
    competitionName: 'SA Provincial Rugby League', competitionSeason: '2026', competitionStatus: 'active',
  },
  'player-gl-10': {
    id: 'player-gl-10', personId: 'p-ntuli', teamId: 'team-gl-sprl-2026', competitionId: 'comp-sprl-2026',
    personName: 'T. Ntuli', shirtNumber: 10, position: 'Flyhalf', isCaptain: false,
    caps: 6, tries: 1, conversions: 9, penalties: 11, dropGoals: 0, points: 56, cards: { yellow: 1, red: 0 },
    teamDisplayName: 'Golden Lions', teamShortCode: 'GL', teamPrimaryColor: '#CC0000',
    competitionName: 'SA Provincial Rugby League', competitionSeason: '2026', competitionStatus: 'active',
  },

  // ── Tyrone's other competition records ────────────────────────────────────
  'player-tvdm-sevens-2025': {
    id: 'player-tvdm-sevens-2025', personId: 'person-tvdm-001', teamId: 'team-wp-sevens-2025', competitionId: 'comp-sevens-2025',
    personName: 'Tyrone van der Merwe', shirtNumber: 7, position: 'Wing', isCaptain: false,
    caps: 9, tries: 8, conversions: 2, penalties: 0, dropGoals: 0, points: 44, cards: { yellow: 1, red: 0 },
    teamDisplayName: 'Western Province', teamShortCode: 'WP', teamPrimaryColor: '#006B3C',
    competitionName: 'Provincial Sevens Series', competitionSeason: '2025', competitionStatus: 'final',
  },
  'player-tvdm-sprl-2025': {
    id: 'player-tvdm-sprl-2025', personId: 'person-tvdm-001', teamId: 'team-wp-sprl-2025', competitionId: 'comp-sprl-2025',
    personName: 'Tyrone van der Merwe', shirtNumber: 14, position: 'Wing', isCaptain: false,
    caps: 14, tries: 11, conversions: 0, penalties: 0, dropGoals: 0, points: 55, cards: { yellow: 1, red: 0 },
    teamDisplayName: 'Western Province', teamShortCode: 'WP', teamPrimaryColor: '#006B3C',
    competitionName: 'SA Provincial Rugby League', competitionSeason: '2025', competitionStatus: 'final',
  },
  'player-tvdm-sevens-2024': {
    id: 'player-tvdm-sevens-2024', personId: 'person-tvdm-001', teamId: 'team-wp-sevens-2024', competitionId: 'comp-sevens-2024',
    personName: 'Tyrone van der Merwe', shirtNumber: 7, position: 'Wing', isCaptain: false,
    caps: 9, tries: 9, conversions: 0, penalties: 0, dropGoals: 0, points: 45, cards: { yellow: 2, red: 0 },
    teamDisplayName: 'Western Province', teamShortCode: 'WP', teamPrimaryColor: '#006B3C',
    competitionName: 'Provincial Sevens Series', competitionSeason: '2024', competitionStatus: 'final',
  },
  'player-tvdm-sprl-2024': {
    id: 'player-tvdm-sprl-2024', personId: 'person-tvdm-001', teamId: 'team-wp-sprl-2024', competitionId: 'comp-sprl-2024',
    personName: 'Tyrone van der Merwe', shirtNumber: 11, position: 'Wing', isCaptain: false,
    caps: 13, tries: 8, conversions: 0, penalties: 0, dropGoals: 0, points: 40, cards: { yellow: 1, red: 0 },
    teamDisplayName: 'Western Province', teamShortCode: 'WP', teamPrimaryColor: '#006B3C',
    competitionName: 'SA Provincial Rugby League', competitionSeason: '2024', competitionStatus: 'final',
  },
  'player-tvdm-u21-2023': {
    id: 'player-tvdm-u21-2023', personId: 'person-tvdm-001', teamId: 'team-wp-u21-2023', competitionId: 'comp-u21-week-2023',
    personName: 'Tyrone van der Merwe', shirtNumber: 11, position: 'Wing', isCaptain: false,
    caps: 7, tries: 6, conversions: 0, penalties: 0, dropGoals: 0, points: 30, cards: { yellow: 0, red: 0 },
    teamDisplayName: 'WP U21', teamShortCode: 'WP', teamPrimaryColor: '#006B3C',
    competitionName: 'U21 Provincial Week', competitionSeason: '2023', competitionStatus: 'final',
  },
}

// ── Helper functions ────────────────────────────────────────────────────────

export function getCareerForPerson(personId) {
  return Object.values(players)
    .filter(p => p.personId === personId)
    .sort((a, b) => {
      const sa = String(b.competitionSeason), sb = String(a.competitionSeason)
      return sa.localeCompare(sb) || b.caps - a.caps
    })
}

export function getTeamsForCompetition(competitionId) {
  return Object.values(teams)
    .filter(t => t.competitionId === competitionId)
    .sort((a, b) => b.points - a.points
      || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
      || b.pointsFor - a.pointsFor)
}

export function getMatchesForCompetition(competitionId) {
  return Object.values(matches)
    .filter(m => m.competitionId === competitionId)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
}

export function getPlayersForTeam(teamId) {
  return Object.values(players)
    .filter(p => p.teamId === teamId)
    .sort((a, b) => (a.shirtNumber || 99) - (b.shirtNumber || 99))
}

export function getTopScorersForCompetition(competitionId, limit = 5) {
  return Object.values(players)
    .filter(p => p.competitionId === competitionId && (p.points ?? 0) > 0)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || (b.tries ?? 0) - (a.tries ?? 0))
    .slice(0, limit)
}
