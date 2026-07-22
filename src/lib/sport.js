// Sport skin — the single source of truth for sport-specific terminology.
// See DESIGN_SYSTEM.md §10. The Hockey repo carries this same file with hockey
// values; anything that differs between the two apps purely by *wording* should
// read from here rather than hardcoding a sport term.
//
// Currently consumed by lib/seoSettings.js (SEO defaults). Next migration
// target: lib/seo.js, which still hardcodes per-page sport copy and the
// schema.org sport value (SPORT.schemaSport) — move those to reference SPORT so
// seo.js can converge across the two repos too.

export const SPORT = {
  key:            'rugby',
  name:           'Rugby',
  nameLower:      'rugby',

  // Scoring vocabulary
  scoreUnit:      'points',          // a match score is a point total
  scoreUnitShort: 'pts',
  scoreEvents:    ['try', 'conversion', 'penalty', 'drop goal'],

  // schema.org sport value used by JSON-LD builders
  schemaSport:    'Rugby union',

  // Brand copy (consumed by SEO defaults)
  tagline:        'School & Club Rugby',
  description:    'Live scores, fixtures, results and player records for school and club rugby in South Africa.',
  keywords:       'rugby, school rugby, club rugby, live scores, fixtures, results, players, South Africa',
  longTagline:    'The easiest way to create, score and publish school and club rugby fixtures.',
}
