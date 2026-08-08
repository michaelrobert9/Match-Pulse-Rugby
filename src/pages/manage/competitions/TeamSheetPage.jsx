import { useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { fetchCompetition, fetchAllPeople } from '../../../lib/queries'
import { fetchCompetitionTeamSheet, saveCompetitionTeamSheet } from '../../../lib/teamSheetQueries'
import { isBulkLineupCompetition } from '../../../lib/lineupResolve'
import TeamSheetEditor from '../../../components/TeamSheetEditor'

// Competition-level bulk team sheet (brief §1): paste once per team, review
// the grid, confirm. Every fixture the team plays in the tournament inherits
// the squad. Tournaments and festivals only — leagues keep the per-fixture
// flow and never reach this page.
export default function TeamSheetPage() {
  const { id: competitionId, teamId } = useParams()
  const navigate = useNavigate()
  const { isPlatformAdmin, isOrgMember, canAdministerCompetition } = useAuth()

  const [state, setState] = useState('loading')   // loading | error | ready
  const [competition, setCompetition] = useState(null)
  const [member, setMember] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [people, setPeople] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function load() {
    setState('loading')
    try {
      const [comp, existing, pool] = await Promise.all([
        fetchCompetition(competitionId),
        fetchCompetitionTeamSheet(competitionId, teamId),
        fetchAllPeople().catch(() => []),
      ])
      if (!comp) throw new Error('Competition not found.')
      setCompetition(comp)
      setMember(existing?.member ?? null)
      setSheet(existing)
      setPeople(pool)
      setState('ready')
    } catch (e) {
      setSaveError(e.message || 'Could not load the team sheet.')
      setState('error')
    }
  }
  useEffect(() => { load() }, [competitionId, teamId]) // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => navigate(`/manage/competitions/${competitionId}`)

  async function handleConfirm({ rows, staff }) {
    setSaving(true)
    setSaveError('')
    try {
      await saveCompetitionTeamSheet(competitionId, teamId, {
        rows, staff,
        orgId: member?.organizationId ?? null,
        orgName: member?.displaySnapshot?.orgName ?? null,
      })
      back()
    } catch (e) {
      setSaveError(e.message || 'Saving the team sheet failed. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const teamName = member?.displaySnapshot?.teamName ?? 'Team'
  const authorised = isPlatformAdmin
    || (competition && canAdministerCompetition(competition))
    || (member?.organizationId && isOrgMember(member.organizationId))

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <button onClick={back}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors text-sm mb-5 min-h-[40px]">
          <ChevronLeft className="w-4 h-4" /> Back to competition
        </button>

        <h1 className="font-display font-black text-slate-900 text-2xl leading-tight">Team sheet</h1>
        <p className="text-slate-500 text-sm mt-1 mb-6">
          {teamName}{competition ? ` — ${competition.name}` : ''}
        </p>

        {state === 'loading' && (
          <div className="space-y-2" aria-hidden>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 h-12 animate-pulse" />
            ))}
          </div>
        )}

        {state === 'error' && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm text-slate-600 mb-3">{saveError || 'Loading the team sheet failed.'}</p>
            <button onClick={load}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl px-5 py-2.5 min-h-[44px]">
              Try again
            </button>
          </div>
        )}

        {state === 'ready' && !isBulkLineupCompetition(competition) && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm text-slate-600">
              Bulk team sheets are for tournaments and festivals. League squads are managed per fixture, as before.
            </p>
          </div>
        )}

        {state === 'ready' && isBulkLineupCompetition(competition) && !authorised && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm text-slate-600">You do not have access to this team's sheet.</p>
          </div>
        )}

        {state === 'ready' && isBulkLineupCompetition(competition) && authorised && (
          <TeamSheetEditor
            people={people}
            orgId={member?.organizationId ?? null}
            initialSquad={sheet?.squad ?? null}
            initialStaff={sheet?.staff ?? null}
            saving={saving}
            error={saveError}
            onConfirm={handleConfirm}
            onCancel={back}
          />
        )}
      </div>
    </div>
  )
}
