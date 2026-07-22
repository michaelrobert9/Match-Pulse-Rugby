// FormatSelector — fifteens/sevens, halves (1 or 2 — rugby is played in
// halves), minutes per half (0-60 spinner), and per-break duration between each
// pair of consecutive halves. onChange receives
// { periods, periodMinutes, breakMinutes, sevens } where breakMinutes is an
// array of length (periods - 1).

import { periodLabels, SEVENS_PERIOD_MINUTES, SEVENS_BREAK_MINUTES, DEFAULT_PERIOD_MINUTES, DEFAULT_BREAK_MINUTES } from '../lib/matchClock'

function clampMinutes(v) { return Math.max(0, Math.min(60, Number(v) || 0)) }
function clampBreak(v)   { return Math.max(0, Math.min(60, Number(v) || 0)) }

function MinuteSpinner({ value, onChange, min = 0, max = 60, label }) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-slate-600 min-w-0 flex-1">{label}</span>}
      <div className="flex items-center gap-1 shrink-0">
        <button type="button"
          onClick={() => onChange(Math.max(min, Number(value) - 1))}
          className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-900 text-sm font-bold transition-colors flex items-center justify-center">
          −
        </button>
        <input
          type="number" min={min} max={max}
          value={value}
          onChange={e => onChange(clampMinutes(e.target.value))}
          className="w-12 text-center bg-white border border-slate-200 rounded-lg py-1 text-slate-900 text-sm font-semibold focus:outline-none focus:border-emerald-500 transition-colors"
        />
        <button type="button"
          onClick={() => onChange(Math.min(max, Number(value) + 1))}
          className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-900 text-sm font-bold transition-colors flex items-center justify-center">
          +
        </button>
        <span className="text-xs text-slate-500 w-6">min</span>
      </div>
    </div>
  )
}

export default function FormatSelector({ periods, periodMinutes, breakMinutes = [], sevens = false, onChange }) {
  const numPeriods  = Number(periods) || 2
  const numMins     = Number(periodMinutes) || 0
  const isSevens    = sevens === true

  // Ensure breakMinutes array length always matches numPeriods - 1,
  // padding with the format's default half-time break.
  const defaultBreak = isSevens ? SEVENS_BREAK_MINUTES[0] : DEFAULT_BREAK_MINUTES[0]
  const normalizedBreaks = Array.from({ length: Math.max(0, numPeriods - 1) }, (_, i) =>
    breakMinutes[i] ?? defaultBreak
  )

  function setPeriods(n) {
    const newBreaks = Array.from({ length: Math.max(0, n - 1) }, (_, i) =>
      breakMinutes[i] ?? defaultBreak
    )
    onChange({ periods: n, periodMinutes, breakMinutes: newBreaks, sevens: isSevens })
  }

  function setMins(m) {
    onChange({ periods, periodMinutes: m, breakMinutes: normalizedBreaks, sevens: isSevens })
  }

  function setBreak(idx, v) {
    const next = [...normalizedBreaks]
    next[idx] = clampBreak(v)
    onChange({ periods, periodMinutes, breakMinutes: next, sevens: isSevens })
  }

  // Switching variant re-seeds sensible half/break lengths for that variant —
  // a sevens half is 7 minutes, not 35 — while leaving the half count alone.
  function setSevens(v) {
    onChange({
      periods,
      periodMinutes: v ? SEVENS_PERIOD_MINUTES : DEFAULT_PERIOD_MINUTES,
      breakMinutes:  Array.from({ length: Math.max(0, numPeriods - 1) }, () =>
        v ? SEVENS_BREAK_MINUTES[0] : DEFAULT_BREAK_MINUTES[0]),
      sevens: v,
    })
  }

  const labels = periodLabels(numPeriods)
  const periodLabel = i => labels[i] ?? `Period ${i + 1}`

  return (
    <div className="space-y-4">
      {/* Fifteens / sevens */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Game type</p>
        <div className="flex gap-2">
          {[{ v: false, label: 'Fifteens (XV)' }, { v: true, label: 'Sevens (7s)' }].map(opt => (
            <button type="button" key={opt.label}
              onClick={() => setSevens(opt.v)}
              className={`flex-1 text-sm font-bold py-2 rounded-lg border transition-colors ${
                isSevens === opt.v
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'border-slate-200 text-slate-500 hover:border-slate-400'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Halves — rugby is played in halves (2 is a full match, 1 for a
          shortened/festival game). */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Halves</p>
        <div className="flex gap-2">
          {[1, 2].map(n => (
            <button type="button" key={n}
              onClick={() => setPeriods(n)}
              className={`flex-1 text-sm font-bold py-2 rounded-lg border transition-colors ${
                numPeriods === n
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'border-slate-200 text-slate-500 hover:border-slate-400'
              }`}>
              {n}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5">2 is a full match; 1 for a single-half or festival game.</p>
      </div>

      {/* Minutes per half */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Minutes per half</p>
        <MinuteSpinner value={numMins} onChange={setMins} />
      </div>

      {/* Break durations (one per gap between halves) */}
      {normalizedBreaks.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            Break{normalizedBreaks.length > 1 ? 's' : ''} between halves
          </p>
          <div className="space-y-2">
            {normalizedBreaks.map((brk, i) => (
              <MinuteSpinner
                key={i}
                value={brk}
                onChange={v => setBreak(i, v)}
                label={normalizedBreaks.length > 1
                  ? `${periodLabel(i)} → ${periodLabel(i + 1)}`
                  : 'Half-time break'
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {numPeriods > 0 && numMins > 0 && (
        <p className="text-[11px] text-slate-500 font-mono">
          {isSevens ? 'Sevens' : 'Fifteens'} · {numPeriods} × {numMins} min
          {normalizedBreaks.length > 0 &&
            ' · breaks: ' + normalizedBreaks.map(b => `${b}m`).join(' / ')
          }
        </p>
      )}
    </div>
  )
}
