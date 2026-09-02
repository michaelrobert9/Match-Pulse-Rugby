#!/usr/bin/env node
//
// Brief 2B Part 4 — convert FINAL_matches_to_add.json into the schema the
// standalone importer (import-standalone-matches.mjs) consumes, applying the
// agreed Parts 2-3 fallbacks:
//   • time    -> 15:00 (time_defaulted true) — no kick-off in source
//   • venue   -> the home team's own venue (team_a), per Michael's fallback rule
//   • no competition tag (Noordvaal stays untagged for now)
//
// Rows without a usable YYYY-MM-DD date (the 4 dateless Noordvaal league rows +
// 1 month-only 2023 row) CANNOT be a standalone match (a dated URL needs a day),
// so they are written to a separate _held file for a date decision, never guessed.
//
// Offline only — reads/writes local JSON, no Firestore. Run from scripts/ dir's
// parent (repo root) or anywhere; paths are relative to this file.
//
//   node scripts/convert-final-add.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = process.env.SRC || join(__dirname, 'data', 'FINAL_matches_to_add.json')
const OUT_OK   = join(__dirname, 'data', 'brief2b_part4_add_normalized.json')
const OUT_HELD = join(__dirname, 'data', 'brief2b_part4_add_held_no_date.json')

const rows = JSON.parse(readFileSync(SRC, 'utf8'))

const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))
const VENUE_NOTE = "venue not recorded in source - set to the home team's own venue per Michael's fallback rule"

const ok = [], held = []
for (const r of rows) {
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(String(r.score || '').trim())
  if (!m) { held.push({ ...r, _reason: `unparseable score "${r.score}"` }); continue }
  if (!isDate(r.date)) { held.push({ ...r, _reason: `no usable date "${r.date}"` }); continue }
  ok.push({
    competition_name: '',
    date: r.date,
    time: '15:00',
    time_defaulted: true,
    home_team: r.team_a,
    away_team: r.team_b,
    home_points: Number(m[1]),
    away_points: Number(m[2]),
    venue: r.team_a,                 // home team's own venue (fallback)
    venue_note: VENUE_NOTE,
    source: 'schoolboyrugby.co.za',
  })
}

writeFileSync(OUT_OK, JSON.stringify(ok, null, 2) + '\n')
writeFileSync(OUT_HELD, JSON.stringify(held, null, 2) + '\n')

console.log(`source rows:      ${rows.length}`)
console.log(`normalized (ok):  ${ok.length}  -> ${OUT_OK.replace(__dirname + '/', '')}`)
console.log(`held (no date):   ${held.length}  -> ${OUT_HELD.replace(__dirname + '/', '')}`)
for (const h of held) console.log(`  HELD: ${h.team_a} v ${h.team_b} (${h.season}) — ${h._reason}`)
