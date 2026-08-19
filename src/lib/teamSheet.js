// Bulk team-sheet parsing — rugby rules (platform brief §5).
//
// Rugby is the one code where the shirt number IS the position: a sheet listed
// 1–15 in order is a real numbered team sheet, not an auto-numbered list, so
// rugby takes the OPPOSITE parsing default to every other sport: numbers are
// shirt numbers unless they look like a plain ordinal list.
//
// Pure functions only — no Firestore, no React. The review grid and the
// fixture-screen paste box both run through here so one parser serves both.

// ── Position map ─────────────────────────────────────────────────────────────
// Position derives from the shirt number. Both shirtNumber AND the resolved
// position string are STORED on the squad entry (never resolve at render time:
// the map may change for age-group variants later and historical sheets must
// not shift).

export const POSITION_BY_NUMBER = {
  1: 'Loosehead Prop',
  2: 'Hooker',
  3: 'Tighthead Prop',
  4: 'Lock',
  5: 'Lock',
  6: 'Blindside Flank',
  7: 'Openside Flank',
  8: 'Eighthman',
  9: 'Scrumhalf',
  10: 'Flyhalf',
  11: 'Left Wing',
  12: 'Inside Centre',
  13: 'Outside Centre',
  14: 'Right Wing',
  15: 'Fullback',
}

export const REPLACEMENT = 'Replacement'

// The fifteen position names (deduped — Lock appears once) plus Replacement,
// for the unlocked-position dropdown.
export const POSITION_OPTIONS = [
  ...new Set(Object.values(POSITION_BY_NUMBER)),
  REPLACEMENT,
]

// Numbers above 23 are valid and resolve to Replacement.
export function positionForNumber(n) {
  if (n == null || isNaN(n) || n < 1) return null
  return POSITION_BY_NUMBER[n] ?? REPLACEMENT
}

// Reverse of the map: a written position → its shirt number. Rugby's number IS
// the position, so a sheet may give either; where a number is missing we infer
// it from the position ("what number you could be"). Ambiguous words resolve to
// the conventional number — Lock → 4 (first in the map), and the aliases below
// pin Flanker → 7, Wing → 14, Centre → 13, Prop → 1.
const POSITION_TO_NUMBER = (() => {
  const m = {}
  for (const [num, name] of Object.entries(POSITION_BY_NUMBER)) {
    const key = name.toLowerCase()
    if (!(key in m)) m[key] = Number(num)     // first wins → Lock = 4
  }
  return m
})()

const POSITION_ALIASES = {
  'loosehead': 1, 'loose head': 1, 'lhp': 1, 'prop': 1,
  'hooker': 2, 'hook': 2, 'rake': 2,
  'tighthead': 3, 'tight head': 3, 'thp': 3,
  'lock': 4, 'second row': 4, 'secondrow': 4, 'second-row': 4,
  'blindside': 6, 'blindside flanker': 6, 'blind side flank': 6, 'blindside flank': 6,
  'openside': 7, 'openside flanker': 7, 'openside flank': 7, 'flanker': 7, 'flank': 7,
  'eighthman': 8, 'eighth man': 8, 'eight man': 8, 'number 8': 8, 'number eight': 8,
  'no 8': 8, 'no8': 8, '8th man': 8, 'no. 8': 8,
  'scrumhalf': 9, 'scrum half': 9, 'scrum-half': 9, 'halfback': 9, 'half back': 9, 'sh': 9,
  'flyhalf': 10, 'fly half': 10, 'fly-half': 10, 'first five': 10, 'firstfive': 10,
  'pivot': 10, 'outhalf': 10, 'out half': 10, 'out-half': 10, 'fh': 10, 'no 10': 10,
  'left wing': 11, 'left winger': 11, 'leftwing': 11,
  'inside centre': 12, 'inside center': 12, 'second five': 12, 'inside': 12,
  'outside centre': 13, 'outside center': 13, 'centre': 13, 'center': 13, 'outside': 13,
  'right wing': 14, 'right winger': 14, 'rightwing': 14, 'wing': 14, 'winger': 14,
  'fullback': 15, 'full back': 15, 'full-back': 15, 'fb': 15,
}

export function numberForPosition(phrase) {
  if (!phrase) return null
  const key = phrase.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ')
  if (key in POSITION_TO_NUMBER) return POSITION_TO_NUMBER[key]
  if (key in POSITION_ALIASES) return POSITION_ALIASES[key]
  return null
}

// ── Name handling ────────────────────────────────────────────────────────────

// Surname particles common on South African sheets. Lowercase in normalised
// output and absorbed into the surname when splitting, so "Jan van der Merwe"
// yields surname "van der Merwe", not "Merwe". (The brief's plain last-space
// split would mangle these; flagged as a deliberate rugby refinement.)
const SURNAME_PARTICLES = new Set([
  'van', 'von', 'der', 'den', 'de', 'du', 'da', 'ter', 'ten', 'le', 'la', 'el',
])

// Title-case one word, preserving internal capitals (McDonald, O'Brien) when
// the word already carries mixed case. ALL-CAPS and all-lower words are
// normalised; Mc/Mac/O' prefixes re-capitalise the letter that follows.
// Body ported from hockey's src/lib/teamSheet.js titleWord() — keep the
// casing behaviour identical across all four sports.
function titleCaseWord(w) {
  if (!w) return w
  const lower = w.toLowerCase()
  if (SURNAME_PARTICLES.has(lower)) return lower
  // Mixed case already (McDonald, O'Brien, du Plessis handled above) — keep.
  if (w !== w.toUpperCase() && w !== lower) return w
  let out = lower.charAt(0).toUpperCase() + lower.slice(1)
  out = out.replace(/^Mc(\w)/, (_, c) => 'Mc' + c.toUpperCase())
  out = out.replace(/^Mac(\w{2,})/, (m, rest) => 'Mac' + rest.charAt(0).toUpperCase() + rest.slice(1))
  out = out.replace(/^O'(\w)/, (_, c) => "O'" + c.toUpperCase())
  out = out.replace(/-(\w)/g, (_, c) => '-' + c.toUpperCase())
  return out
}

// Normalise a name to title case word by word, preserving McDonald /
// van der Merwe / O'Brien / du Plessis. A word already carrying mixed case is
// someone's deliberate spelling and is left alone; ALL-CAPS and all-lower
// words are normalised. (Exported name unchanged — rugby files import
// normaliseNameCase.)
export function normaliseNameCase(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').split(' ').map(titleCaseWord).join(' ')
}

// Split a display name into first name(s) + surname. Splits on the last space,
// then pulls surname particles back in ("Jan van der Merwe" → "Jan" +
// "van der Merwe"). Single token → surname only.
export function splitName(fullName) {
  const tokens = fullName.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
  if (tokens.length === 0) return { firstName: '', lastName: '' }
  if (tokens.length === 1) return { firstName: '', lastName: tokens[0] }
  let split = tokens.length - 1
  while (split > 1 && SURNAME_PARTICLES.has(tokens[split - 1].toLowerCase())) split--
  return {
    firstName: tokens.slice(0, split).join(' '),
    lastName:  tokens.slice(split).join(' '),
  }
}

// ── Line parsing ─────────────────────────────────────────────────────────────
// Handles (from §5): "1. John Smith", "1  John Smith", "John Smith 10",
// "10 John Smith (C)", "John Smith, 9", tab-delimited from a spreadsheet,
// "JOHN SMITH", "Smith, John", "15. J Smith".
//
// The parser NEVER refuses a line. Anything unreadable becomes a row with the
// raw text in the name field, flagged for review.

function parseLine(rawLine) {
  const raw = rawLine.replace(/ /g, ' ')  // NBSP from pasted documents
  let text = raw.trim()
  if (!text) return null

  // Strip a leading bullet / list marker so it never lands in the name and does
  // not hide a following number ("- 12 John" → name "John", number 12).
  text = text.replace(/^\s*(?:[•·▪▫◦‣⁃*]+|[-–—])\s+/, '').trim()
  if (!text) return null

  let number = null
  let isCaptain = false

  // Trailing captain marker: (C) / (c) / ©
  const capMatch = text.match(/\s*[(（]\s*[cC]\s*[)）]\s*$|\s*©\s*$/)
  if (capMatch) {
    isCaptain = true
    text = text.slice(0, capMatch.index).trim()
  }

  // Tab-delimited (Excel / Sheets) is the reliable path: numeric cell is the
  // number, the rest joins as the name.
  if (text.includes('\t')) {
    const cells = text.split('\t').map(c => c.trim()).filter(Boolean)
    const numIdx = cells.findIndex(c => /^\d{1,3}\.?$/.test(c))
    if (numIdx !== -1) {
      number = parseInt(cells[numIdx], 10)
      text = cells.filter((_, i) => i !== numIdx).join(' ').trim()
    } else {
      text = cells.join(' ').trim()
    }
  } else {
    // Leading number: "1. John Smith", "1  John Smith", "10 John Smith"
    const lead = text.match(/^(\d{1,3})[.)]?\s+(.*)$/)
    if (lead) {
      number = parseInt(lead[1], 10)
      text = lead[2].trim()
    } else {
      // Trailing number: "John Smith 10", "John Smith, 9"
      const trail = text.match(/^(.*?)[,\s]\s*(\d{1,3})$/)
      if (trail && trail[1].trim()) {
        number = parseInt(trail[2], 10)
        text = trail[1].trim().replace(/,$/, '')
      }
    }
  }

  // Re-check for a captain marker that sat before the number ("John Smith (C) 7").
  const capMatch2 = text.match(/\s*[(（]\s*[cC]\s*[)）]\s*$|\s*©\s*$/)
  if (capMatch2) {
    isCaptain = true
    text = text.slice(0, capMatch2.index).trim()
  }

  // Position instead of a number (rugby: the two are interchangeable — brief §5).
  // Only a BRACKETED position is inferred — "John Doe (Fullback)", "Sam Roe
  // (No. 8)" — so a surname like "Lock" or "Wing" is never mistaken for a
  // position. A number, if the line gave one, always wins.
  if (number == null) {
    const posMatch = text.match(/[(（]\s*([^)）]+?)\s*[)）]\s*$/)
    if (posMatch) {
      const n = numberForPosition(posMatch[1])
      if (n != null) {
        number = n
        text = text.slice(0, posMatch.index).trim()
      }
    }
  }

  // "Smith, John" reverses — but only when what follows the comma is a name,
  // not a number (the number case was consumed above).
  if (text.includes(',')) {
    const [before, ...rest] = text.split(',')
    const after = rest.join(',').trim()
    if (before.trim() && after && !/^\d+$/.test(after)) {
      text = `${after} ${before.trim()}`
    }
  }

  const name = normaliseNameCase(text)
  const hasLetters = /[A-Za-z]/.test(name)

  if (!hasLetters) {
    // Unreadable: raw text into the name field, flagged for review.
    return {
      raw, number, isCaptain,
      firstName: '', lastName: raw.trim(),
      unreadable: true,
    }
  }

  const { firstName, lastName } = splitName(name)
  return { raw, number, isCaptain, firstName, lastName, unreadable: false }
}

// ── Number interpretation ────────────────────────────────────────────────────
// Rugby default: SHIRT NUMBERS.
//   1–15 in order            → shirt numbers
//   1–22 / 1–23 in order     → shirt numbers, 16+ as bench
//   otherwise: contiguous from 1 with no gaps → ordinal list;
//              gapped or out of order         → shirt numbers.

export function detectNumberMode(rows) {
  const numbers = rows.map(r => r.number).filter(n => n != null)
  if (numbers.length === 0) return 'shirt'
  const inOrderFrom1 = numbers.every((n, i) => n === i + 1)
    && numbers.length === rows.filter(r => r.number != null).length
  if (inOrderFrom1) {
    const n = numbers.length
    if (n === 15 || n === 22 || n === 23) return 'shirt'
    return 'ordinal'
  }
  return 'shirt'
}

// True when the sheet reads 1–15 with no gaps — triggers the quiet
// "Numbers 1 to 15 read as positions" line above the grid.
export function isFifteenInOrder(rows) {
  const numbers = rows.map(r => r.shirtNumber ?? r.number).filter(n => n != null)
  return numbers.length >= 15
    && numbers.slice(0, 15).every((n, i) => n === i + 1)
}

// ── Entry point ──────────────────────────────────────────────────────────────
// Returns { rows, mode } where each row is
//   { raw, firstName, lastName, shirtNumber, position, isCaptain, unreadable }
// and mode is the detected interpretation ('shirt' | 'ordinal').
// In ordinal mode the pasted numbers are just a list: shirt numbers and
// positions start empty and the organiser fills them in the grid.

export function parseTeamSheet(text, { mode } = {}) {
  const parsed = String(text ?? '')
    .split(/\r?\n/)
    .map(parseLine)
    .filter(Boolean)

  const resolvedMode = mode ?? detectNumberMode(parsed)

  const rows = parsed.map(r => {
    const shirtNumber = resolvedMode === 'shirt' ? (r.number ?? null) : null
    return {
      raw: r.raw,
      firstName: r.firstName,
      lastName: r.lastName,
      shirtNumber,
      position: positionForNumber(shirtNumber),
      isCaptain: r.isCaptain,
      unreadable: r.unreadable,
    }
  })

  return { rows, mode: resolvedMode }
}

// Duplicate shirt numbers get a warning chip, not a block (schools do produce
// sheets with two number sevens). Returns the set of duplicated numbers.
export function duplicateNumbers(rows) {
  const seen = new Map()
  for (const r of rows) {
    if (r.shirtNumber == null) continue
    seen.set(r.shirtNumber, (seen.get(r.shirtNumber) ?? 0) + 1)
  }
  return new Set([...seen.entries()].filter(([, c]) => c > 1).map(([n]) => n))
}

// Duplicate names within one squad — warning chip, not a block.
export function duplicateNames(rows) {
  const seen = new Map()
  for (const r of rows) {
    const key = `${r.firstName} ${r.lastName}`.trim().toLowerCase()
    if (!key) continue
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  return new Set([...seen.entries()].filter(([, c]) => c > 1).map(([k]) => k))
}
