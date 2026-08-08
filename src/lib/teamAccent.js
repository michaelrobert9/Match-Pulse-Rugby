// teamAccent(color) — resolves a raw team colour to a SAFE accent for the
// captain marker and POM tints (line-up display brief §3).
//
// ⚠️ PLACEHOLDER. The canonical teamAccent is authored by netball and, once it
// lands, is copied here BYTE-IDENTICAL (resolution round Part 1.4) — like
// pom.js. Do not treat this as the permanent implementation; it exists only so
// the captain/POM colour call sites are already routed through one function,
// making the swap a single-file replace. Netball owns the real thresholds.
//
// Two hazards it guards against, both raised in §3:
//   1. A team colour near the live token #E5484D reads as the live-match
//      indicator. Red means live and nothing else — so colours too close to
//      that hue fall back to slate.
//   2. A pale colour at 14px bold on white fails contrast; low-luminance
//      guard also falls back to slate.
// The slate fallback #64748b is the escape hatch in both cases.

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

// Relative luminance (WCAG). Used for the contrast-against-white guard.
function luminance({ r, g, b }) {
  const f = c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export function teamAccent(color) {
  const c = parseHex(color)
  if (!c) return SLATE
  // Too pale on white → slate.
  if (luminance(c) > 0.6) return SLATE
  // Too close to the live token → slate. Simple RGB distance; the canonical
  // netball version may use a proper hue check.
  const dist = Math.sqrt((c.r - LIVE.r) ** 2 + (c.g - LIVE.g) ** 2 + (c.b - LIVE.b) ** 2)
  if (dist < 60) return SLATE
  return color
}
