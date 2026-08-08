import { useState } from 'react'
import { Plus } from 'lucide-react'
import { isAbsent, overrideFor } from '../lib/lineupResolve'
import { positionForNumber } from '../lib/teamSheet'

// Fixture line-up screen for an inherited (tournament/festival) side — brief §9.
//
// Opens with EVERYONE already selected: that is the default state, not a
// button. Tap a player to mark them absent — they grey out and move below the
// "Not playing" divider. The per-fixture shirt-number override is a
// first-class control (numbers change between matches in rugby and the
// position changes with them); an override updates this fixture's position
// too and never touches the competition squad.
export default function FixtureSquadPanel({
  t, bright, match, side, member,
  teamColor = null,      // side's team colour — the © renders in it (slate fallback)
  onToggleAbsent,        // (side, playerId)
  onOverride,            // (side, playerId, shirtNumber|null)
  onOpenPaste,           // (side)
  onClearAll,            // (side)
  saving = false,
}) {
  const [numEdit, setNumEdit] = useState(null)   // { playerId, value }

  const squad = member?.squad ?? []
  const exceptions = match?.exceptions ?? []
  const byNumber = (a, b) => (a.shirtNumber ?? 999) - (b.shirtNumber ?? 999)

  const rowsFor = (absent) => squad
    .filter(sq => isAbsent(exceptions, side, sq.playerId) === absent)
    .map(sq => {
      const ov = overrideFor(exceptions, side, sq.playerId)
      return {
        ...sq,
        shirtNumber: ov?.shirtNumber ?? sq.shirtNumber,
        position: ov ? (ov.position ?? positionForNumber(ov.shirtNumber)) : (sq.position ?? positionForNumber(sq.shirtNumber)),
        hasOverride: !!ov,
      }
    })
    .sort(byNumber)

  const playing = rowsFor(false)
  const out = rowsFor(true)

  function commitNumEdit(playerId) {
    if (!numEdit || numEdit.playerId !== playerId) return
    const n = numEdit.value === '' ? null : parseInt(numEdit.value, 10)
    const sq = squad.find(s => s.playerId === playerId)
    // Same number as the squad entry = clear the override.
    onOverride(side, playerId, (Number.isFinite(n) && n !== sq?.shirtNumber) ? n : null)
    setNumEdit(null)
  }

  const row = (p, absent) => (
    <li key={p.playerId}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border min-h-[48px] transition-colors ${t.neutralBtn} ${absent ? 'opacity-45' : ''}`}>
      {/* Shirt number — tap to override for THIS fixture only. */}
      {numEdit?.playerId === p.playerId ? (
        <input autoFocus inputMode="numeric" value={numEdit.value}
          onChange={e => setNumEdit({ playerId: p.playerId, value: e.target.value.replace(/\D/g, '') })}
          onBlur={() => commitNumEdit(p.playerId)}
          onKeyDown={e => { if (e.key === 'Enter') commitNumEdit(p.playerId) }}
          className={`w-12 text-center font-mono tabular-nums text-sm rounded-lg border px-1 py-1.5 ${bright ? 'bg-white border-emerald-400 text-slate-900' : 'bg-slate-900 border-emerald-500 text-white'} focus:outline-none`} />
      ) : (
        <button disabled={saving || absent}
          onClick={() => setNumEdit({ playerId: p.playerId, value: p.shirtNumber != null ? String(p.shirtNumber) : '' })}
          title="Change shirt number for this fixture"
          className={`w-12 min-h-[40px] font-mono tabular-nums text-sm rounded-lg border text-center ${
            p.hasOverride
              ? 'border-emerald-400 text-emerald-600 font-bold'
              : bright ? 'border-slate-200 text-slate-500' : 'border-slate-700 text-slate-400'
          }`}>
          {p.shirtNumber ?? '–'}
        </button>
      )}

      {/* Tap the player to toggle absent. */}
      <button disabled={saving} onClick={() => onToggleAbsent(side, p.playerId)}
        className="flex-1 min-w-0 min-h-[44px] flex items-center gap-2 text-left">
        {p.isCaptain && (
          <span className="text-sm font-bold leading-none shrink-0"
            style={{ color: teamColor ?? '#64748b' }}>©</span>
        )}
        <span className={`text-sm font-medium truncate ${absent ? '' : bright ? 'text-slate-900' : 'text-white'}`}>
          {p.name}
        </span>
        {p.position && (
          <span className={`text-[11px] shrink-0 ${t.muted}`}>{p.position}</span>
        )}
      </button>
    </li>
  )

  return (
    <div className="space-y-3">
      <p className={`text-[11px] ${t.muted}`}>
        Everyone from the competition squad is in. Tap a player to mark absent; tap a number to
        change it for this fixture only.
      </p>

      {playing.length > 0 ? (
        <ul className="space-y-1.5">{playing.map(p => row(p, false))}</ul>
      ) : (
        <p className={`text-sm ${t.muted} text-center py-2`}>No one selected for this fixture.</p>
      )}

      {out.length > 0 && (
        <div>
          <div className={`text-[10px] font-bold uppercase tracking-widest ${t.muted} mb-1.5 mt-3`}>
            Not playing · {out.length}
          </div>
          <ul className="space-y-1.5">{out.map(p => row(p, true))}</ul>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <button disabled={saving} onClick={() => onOpenPaste(side)}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-emerald-600 hover:text-emerald-500 min-h-[44px]">
          <Plus className="w-3.5 h-3.5" /> Paste late additions
        </button>
        {playing.length > 0 && (
          <button disabled={saving} onClick={() => onClearAll(side)}
            className={`text-[11px] font-bold uppercase tracking-widest min-h-[44px] ${t.muted} hover:text-red-500`}>
            Clear all
          </button>
        )}
      </div>
    </div>
  )
}
