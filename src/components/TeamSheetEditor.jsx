import { Fragment, useMemo, useState } from 'react'
import { Lock, Unlock, X, Plus, AlertTriangle } from 'lucide-react'
import {
  parseTeamSheet, positionForNumber, POSITION_OPTIONS,
  duplicateNumbers, duplicateNames, isFifteenInOrder,
} from '../lib/teamSheet'
import { matchRowsToPeople } from '../lib/teamSheetQueries'

// Bulk team-sheet editor: paste box → review grid → confirm (brief §5–§8).
// Nothing writes to the database until the confirm bar's Add/Save — the grid
// is the whole safety net. Used at competition level and by the fixture
// screen's late-addition paste box, so it owns no Firestore I/O itself:
// the parent passes the people pool in and receives the confirmed rows back.
//
// Row shape: { key, firstName, lastName, shirtNumber, position,
//              positionUnlocked, isCaptain, unreadable, raw, match }

let rowKey = 0
const nextKey = () => `row-${++rowKey}`

function toEditorRows(parsedRows, people, orgId) {
  const matched = matchRowsToPeople(parsedRows, people, { orgId })
  return matched.map(r => ({
    key: nextKey(),
    firstName: r.firstName,
    lastName: r.lastName,
    shirtNumber: r.shirtNumber,
    position: r.position,
    positionUnlocked: false,
    isCaptain: r.isCaptain,
    unreadable: r.unreadable === true,
    raw: r.raw ?? '',
    match: r.match,
  }))
}

// Existing squad entries → editor rows (already linked; position stays as
// stored — it may have been unlocked and changed when first confirmed).
function fromSquad(squad) {
  return (squad ?? []).map(s => {
    const derived = positionForNumber(s.shirtNumber)
    return {
      key: nextKey(),
      firstName: s.name.split(' ').slice(0, -1).join(' '),
      lastName: s.name.split(' ').slice(-1).join(' '),
      shirtNumber: s.shirtNumber,
      position: s.position ?? derived,
      positionUnlocked: (s.position ?? derived) !== derived,
      isCaptain: s.isCaptain === true,
      unreadable: false,
      raw: '',
      match: { status: 'linked', personId: s.playerId, personName: s.name, photoUrl: s.photoUrl ?? null },
    }
  })
}

const sortRows = (rows) => [...rows].sort((a, b) => {
  const ambA = a.match?.status === 'ambiguous' ? 0 : 1
  const ambB = b.match?.status === 'ambiguous' ? 0 : 1
  if (ambA !== ambB) return ambA - ambB
  return (a.shirtNumber ?? 999) - (b.shirtNumber ?? 999)
})

const STAFF_ROLES = ['Coach', 'Assistant Coach', 'Manager']

function Chip({ tone, children }) {
  const tones = {
    warn:   'bg-amber-50 border-amber-200 text-amber-700',
    linked: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    new:    'bg-slate-100 border-slate-200 text-slate-500',
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  )
}

// "© Captain" pill — labelled, 40px minimum target, aria-pressed. A bare ©
// button gets mis-pressed, and a mis-press silently changes how the match
// page renders later. The © glyph renders 14px bold per the line-up brief.
function CaptainPill({ on, onToggle }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={on}
      className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-colors ${
        on
          ? 'bg-amber-50 border-amber-300 text-amber-700'
          : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
      }`}>
      <span className="text-[14px] font-bold leading-none">©</span>
      Captain
    </button>
  )
}

const cellInput = 'w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 transition-colors'

export default function TeamSheetEditor({
  people = [],
  orgId = null,
  initialSquad = null,
  initialStaff = null,
  saving = false,
  error = '',
  onConfirm,          // async ({ rows, staff })
  onCancel,
}) {
  const hasExisting = (initialSquad?.length ?? 0) > 0
  const [rows, setRows] = useState(() => (hasExisting ? sortRows(fromSquad(initialSquad)) : []))
  const [staff, setStaff] = useState(() => (initialStaff?.length ? initialStaff : []))
  const [pasteText, setPasteText] = useState('')
  const [pasteOpen, setPasteOpen] = useState(!hasExisting)
  const [numberMode, setNumberMode] = useState('shirt')   // rugby default: shirt numbers
  // The most recent paste (keys + source text) so the numbers toggle above the
  // grid can RE-interpret that batch in place. Earlier batches keep their
  // confirmed interpretation; hand-added rows are never touched.
  const [lastBatch, setLastBatch] = useState(null)
  const [chooserKey, setChooserKey] = useState(null)

  const dupNums  = useMemo(() => duplicateNumbers(rows), [rows])
  const dupNames = useMemo(() => duplicateNames(rows), [rows])
  const fifteen  = useMemo(() => isFifteenInOrder(rows), [rows])
  const canConfirm = rows.length > 0 && !saving

  // Parse the paste with auto-detected interpretation (rugby default: shirt
  // numbers; a plain contiguous list reads as ordinal). The toggle above the
  // grid reflects the detection and can re-interpret this batch in place.
  function runPaste() {
    const { rows: parsed, mode: detected } = parseTeamSheet(pasteText)
    const editorRows = toEditorRows(parsed, people, orgId)
    setNumberMode(detected)
    setLastBatch({ keys: editorRows.map(r => r.key), text: pasteText })
    setRows(prev => sortRows([...prev, ...editorRows]))
    setPasteText('')
    setPasteOpen(false)
  }

  function switchNumberMode(mode) {
    setNumberMode(mode)
    if (!lastBatch) return
    // Re-read the same pasted text under the chosen interpretation and swap
    // the batch's rows in place. Rows from earlier pastes or Add row keep
    // their state.
    const { rows: reparsed } = parseTeamSheet(lastBatch.text, { mode })
    const fresh = toEditorRows(reparsed, people, orgId)
    setLastBatch({ keys: fresh.map(r => r.key), text: lastBatch.text })
    setRows(prev => sortRows([...prev.filter(r => !lastBatch.keys.includes(r.key)), ...fresh]))
  }

  const patch = (key, p) =>
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...p } : r)))

  function patchNumber(key, value) {
    const n = value === '' ? null : parseInt(value, 10)
    setRows(prev => prev.map(r => {
      if (r.key !== key) return r
      const shirtNumber = Number.isFinite(n) ? n : null
      // Changing a shirt number updates the position live — unless this row's
      // position was unlocked, which pins it against later number changes.
      return {
        ...r, shirtNumber,
        position: r.positionUnlocked ? r.position : positionForNumber(shirtNumber),
      }
    }))
  }

  // Editing a name re-matches that row against the pool on blur.
  function rematch(key) {
    setRows(prev => prev.map(r => {
      if (r.key !== key) return r
      if (r.match?.personId && r.match?.chosen) return r   // explicit choice sticks
      const [m] = matchRowsToPeople([r], people, { orgId })
      return { ...r, unreadable: false, match: m.match }
    }))
  }

  function choose(key, person) {
    patch(key, {
      match: person
        ? { status: 'linked', personId: person.id, personName: person.fullName, photoUrl: person.photoUrl, chosen: true }
        : { status: 'new', chosen: true },
    })
    setChooserKey(null)
  }

  function addRow() {
    const used = new Set(rows.map(r => r.shirtNumber).filter(n => n != null))
    let n = 1
    while (used.has(n)) n++
    setRows(prev => [...prev, {
      key: nextKey(), firstName: '', lastName: '',
      shirtNumber: n, position: positionForNumber(n),
      positionUnlocked: false, isCaptain: false, unreadable: false, raw: '',
      match: { status: 'new' },
    }])
  }

  const resort = () => setRows(prev => sortRows(prev))

  function rowChips(r) {
    const nameKey = `${r.firstName} ${r.lastName}`.trim().toLowerCase()
    return (
      <span className="inline-flex gap-1 flex-wrap">
        {r.unreadable && <Chip tone="warn"><AlertTriangle className="w-3 h-3" />Check</Chip>}
        {r.match?.status === 'linked' && <Chip tone="linked">Linked</Chip>}
        {r.match?.status === 'ambiguous' && (
          <button type="button" onClick={() => setChooserKey(chooserKey === r.key ? null : r.key)}>
            <Chip tone="warn">Choose…</Chip>
          </button>
        )}
        {r.match?.status === 'new' && <Chip tone="new">New</Chip>}
        {r.shirtNumber != null && dupNums.has(r.shirtNumber) && <Chip tone="warn">Duplicate {r.shirtNumber}</Chip>}
        {nameKey && dupNames.has(nameKey) && <Chip tone="warn">Duplicate name</Chip>}
      </span>
    )
  }

  function positionCell(r) {
    if (!r.positionUnlocked) {
      return (
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600 whitespace-nowrap">
          {r.position ?? '—'}
          <button type="button" title="Unlock position"
            aria-label={`Unlock position for ${r.firstName} ${r.lastName}`}
            onClick={() => patch(r.key, { positionUnlocked: true })}
            className="min-h-[40px] min-w-[28px] inline-flex items-center justify-center text-slate-300 hover:text-slate-500">
            <Lock className="w-3.5 h-3.5" />
          </button>
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5">
        <select value={r.position ?? ''} onChange={e => patch(r.key, { position: e.target.value || null })}
          className={cellInput + ' min-w-[9rem]'}>
          <option value="">—</option>
          {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button type="button" title="Position unlocked"
          onClick={() => patch(r.key, { positionUnlocked: false, position: positionForNumber(r.shirtNumber) })}
          className="min-h-[40px] min-w-[28px] inline-flex items-center justify-center text-amber-500">
          <Unlock className="w-3.5 h-3.5" />
        </button>
      </span>
    )
  }

  function chooser(r) {
    if (chooserKey !== r.key || r.match?.status !== 'ambiguous') return null
    return (
      <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 mt-1 space-y-1">
        <p className="text-[11px] text-slate-500 mb-1.5">Which player is this?</p>
        {(r.match.candidates ?? []).map(c => (
          <button key={c.id} type="button" onClick={() => choose(r.key, c)}
            className="w-full flex items-center gap-2 bg-white border border-slate-200 hover:border-emerald-400 rounded-lg px-3 py-2 text-left min-h-[44px]">
            <span className="text-sm text-slate-900 font-medium flex-1 truncate">{c.fullName}</span>
            {c.orgNames?.length > 0 && <span className="text-[11px] text-slate-400 truncate">{c.orgNames.join(', ')}</span>}
          </button>
        ))}
        <button type="button" onClick={() => choose(r.key, null)}
          className="w-full bg-white border border-dashed border-slate-300 hover:border-emerald-400 rounded-lg px-3 py-2 text-left text-sm text-slate-500 min-h-[44px]">
          Create new player
        </button>
      </div>
    )
  }

  const removeBtn = (r) => (
    <button type="button" onClick={() => setRows(prev => prev.filter(x => x.key !== r.key))}
      aria-label={`Remove ${r.firstName} ${r.lastName}`}
      className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors">
      <X className="w-4 h-4" />
    </button>
  )

  return (
    <div className="pb-24">
      {/* ── Paste box ─────────────────────────────────────────────────────── */}
      {pasteOpen ? (
        <div className="space-y-2 mb-5">
          {rows.length === 0 && (
            <p className="text-sm text-slate-500">
              Paste the team sheet — one player per line, straight from a message or a spreadsheet.
            </p>
          )}
          <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={8}
            placeholder={'1. John Smith\n2. Peter van der Merwe (C)'}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors" />
          <div className="flex justify-end">
            <button type="button" disabled={!pasteText.trim()} onClick={runPaste}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-bold rounded-xl px-5 py-2.5 min-h-[44px] transition-colors">
              Read sheet
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setPasteOpen(true)}
          className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-emerald-700 hover:text-emerald-600 min-h-[40px]">
          <Plus className="w-3.5 h-3.5" /> Paste more players
        </button>
      )}

      {rows.length > 0 && (
        <>
          {/* Numbers toggle — above the grid, re-interprets the last paste.
              Rugby starts on shirt numbers: 1–15 in order is a real numbered
              sheet, the number IS the position. */}
          {lastBatch && (
            <div className="flex items-center gap-1 text-[11px] mb-2">
              {[['shirt', 'These numbers are shirt numbers'], ['ordinal', 'These numbers are just a list']].map(([v, label]) => (
                <button key={v} type="button" onClick={() => switchNumberMode(v)}
                  className={`px-2.5 py-2 rounded-lg border font-bold transition-colors min-h-[40px] ${
                    numberMode === v
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Row count + quiet 1–15 line */}
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              {rows.length} player{rows.length === 1 ? '' : 's'}
            </span>
            {fifteen && (
              <span className="text-[11px] text-slate-400">Numbers 1 to 15 read as positions</span>
            )}
          </div>

          {/* ── Desktop grid (≥640px) ─────────────────────────────────────── */}
          <div className="hidden sm:block bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200">
                  {['No.', 'First name', 'Surname', 'Position', 'Captain', 'Status', ''].map((h, i) => (
                    <th key={i} className="px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 first:pl-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <Fragment key={r.key}>
                    <tr className="border-b border-slate-100 last:border-0 align-middle">
                      <td className="pl-3 pr-2 py-1.5 w-16">
                        <input inputMode="numeric" value={r.shirtNumber ?? ''} onBlur={resort}
                          onChange={e => patchNumber(r.key, e.target.value.replace(/\D/g, ''))}
                          className={cellInput + ' font-mono tabular-nums text-center'} />
                      </td>
                      <td className="px-2 py-1.5 min-w-[8rem]">
                        <input value={r.firstName} onBlur={() => rematch(r.key)}
                          onChange={e => patch(r.key, { firstName: e.target.value })}
                          className={cellInput} />
                      </td>
                      <td className="px-2 py-1.5 min-w-[8rem]">
                        <input value={r.lastName} onBlur={() => rematch(r.key)}
                          onChange={e => patch(r.key, { lastName: e.target.value })}
                          className={cellInput} />
                      </td>
                      <td className="px-2 py-1.5">{positionCell(r)}</td>
                      <td className="px-2 py-1.5">
                        <CaptainPill on={r.isCaptain} onToggle={() => patch(r.key, { isCaptain: !r.isCaptain })} />
                      </td>
                      <td className="px-2 py-1.5">{rowChips(r)}</td>
                      <td className="px-1 py-1.5 w-10">{removeBtn(r)}</td>
                    </tr>
                    {chooserKey === r.key && (
                      <tr>
                        <td colSpan={7} className="px-3 pb-2">{chooser(r)}</td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Mobile cards (<640px) ─────────────────────────────────────── */}
          <div className="sm:hidden space-y-2">
            {rows.map(r => (
              <div key={r.key} className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input inputMode="numeric" value={r.shirtNumber ?? ''} onBlur={resort}
                    onChange={e => patchNumber(r.key, e.target.value.replace(/\D/g, ''))}
                    className={cellInput + ' w-14 font-mono tabular-nums text-center min-h-[48px]'} />
                  <input value={r.firstName} placeholder="First name" onBlur={() => rematch(r.key)}
                    onChange={e => patch(r.key, { firstName: e.target.value })}
                    className={cellInput + ' min-h-[48px]'} />
                  <input value={r.lastName} placeholder="Surname" onBlur={() => rematch(r.key)}
                    onChange={e => patch(r.key, { lastName: e.target.value })}
                    className={cellInput + ' min-h-[48px]'} />
                  {removeBtn(r)}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {positionCell(r)}
                  <CaptainPill on={r.isCaptain} onToggle={() => patch(r.key, { isCaptain: !r.isCaptain })} />
                  {rowChips(r)}
                </div>
                {chooser(r)}
              </div>
            ))}
          </div>

          <button type="button" onClick={addRow}
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-emerald-700 hover:text-emerald-600 min-h-[44px]">
            <Plus className="w-3.5 h-3.5" /> Add row
          </button>
        </>
      )}

      {/* ── Team staff (optional) ─────────────────────────────────────────── */}
      <div className="mt-6">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Team staff</span>
          <span className="text-[11px] text-slate-400">optional</span>
        </div>
        <div className="space-y-2">
          {staff.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={s.role}
                onChange={e => setStaff(prev => prev.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}
                className={cellInput + ' w-40'}>
                {STAFF_ROLES.map(role => <option key={role}>{role}</option>)}
              </select>
              <input value={s.name} placeholder="Name"
                onChange={e => setStaff(prev => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                className={cellInput + ' flex-1 min-h-[44px]'} />
              <button type="button" onClick={() => setStaff(prev => prev.filter((_, j) => j !== i))}
                aria-label="Remove staff member"
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-slate-300 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setStaff(prev => [...prev, { role: 'Coach', name: '' }])}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-emerald-700 hover:text-emerald-600 min-h-[40px]">
            <Plus className="w-3.5 h-3.5" /> Add staff member
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}

      {/* ── Confirm bar — pinned; "Add" first save, "Save" thereafter. No
            count on the button: this screen collects staff as well as players,
            and the live count already sits on the row-count line. ─────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3 z-30">
        <div className="max-w-3xl mx-auto flex items-center justify-end gap-4">
          <button type="button" onClick={onCancel} disabled={saving}
            className="text-sm font-bold text-slate-500 hover:text-slate-700 min-h-[44px] px-2">
            Cancel
          </button>
          <button type="button" disabled={!canConfirm}
            onClick={() => onConfirm({
              rows: rows.filter(r => `${r.firstName}${r.lastName}`.trim()),
              staff,
            })}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-bold rounded-xl px-8 py-2.5 min-h-[44px] transition-colors">
            {saving ? 'Saving…' : hasExisting ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}
