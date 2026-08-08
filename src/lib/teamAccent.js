// teamAccent(color) — resolves a raw team colour to a SAFE accent for the
// captain marker and POM tints (line-up display brief §3).
//
// ⚠️ INTERIM. The canonical teamAccent is authored by netball and, once it is
// actually published, is copied here BYTE-IDENTICAL (closing round Part 1.4) —
// like pom.js. As of this commit it is NOT present in the netball repo (grep-
// clean on main), so there is nothing to copy yet; this implementation follows
// the PUBLISHED SPEC exactly so behaviour is correct in the meantime:
//
//   • WCAG contrast ratio ≥ 3:1 against white, else neutral fallback
//   • ≥ 70 RGB distance from the live token #E5484D, else neutral fallback
//   • neutral fallback is slate #64748b
//
// Replace this whole file with netball's published version verbatim when it
// lands; do not treat these thresholds as rugby's own permanent implementation.

const SLATE = '#64748b'
const LIVE  = { r: 0xE5, g: 0x48, b: 0x4d }

function parseHex(hex) {
  if (typeof hex !== 'string') return null
  const m = hex.trim().replace('#', '')
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

// Relative luminance (WCAG 2.x).
function luminance({ r, g, b }) {
  const f = c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

// Contrast ratio against white (L = 1.0).
function contrastOnWhite(c) {
  return 1.05 / (luminance(c) + 0.05)
}

function distanceFromLive(c) {
  return Math.sqrt((c.r - LIVE.r) ** 2 + (c.g - LIVE.g) ** 2 + (c.b - LIVE.b) ** 2)
}

export function teamAccent(color) {
  const c = parseHex(color)
  if (!c) return SLATE
  if (contrastOnWhite(c) < 3) return SLATE       // too pale on white
  if (distanceFromLive(c) < 70) return SLATE     // reads as the live token
  return color
}
