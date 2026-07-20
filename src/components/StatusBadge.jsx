const STATUS = {
  live:            'bg-red-50 border border-red-200 text-red-600',
  active:          'bg-red-50 border border-red-200 text-red-600',
  scheduled:       'bg-sky-50 border border-sky-200 text-sky-600',
  upcoming:        'bg-sky-50 border border-sky-200 text-sky-600', // legacy match status
  paused:          'bg-amber-50 border border-amber-200 text-amber-600',
  awaiting_result: 'bg-amber-50 border border-amber-200 text-amber-600',
  final:           'bg-slate-100 border border-slate-200 text-slate-500',
  postponed:       'bg-violet-50 border border-violet-200 text-violet-600',
  cancelled:       'bg-slate-100 border border-slate-200 text-slate-400 line-through',
  completed:       'bg-slate-100 border border-slate-200 text-slate-500',
  draft:           'bg-slate-100 border border-slate-200 text-slate-500',
  unpublished:     'bg-slate-100 border border-slate-200 text-slate-500',
}

const LABEL = {
  live:            'Live',
  active:          'Active',
  scheduled:       'Scheduled',
  upcoming:        'Scheduled', // legacy match status renders under the new name
  paused:          'Paused',
  awaiting_result: 'Awaiting result',
  final:           'Final',
  postponed:       'Postponed',
  cancelled:       'Cancelled',
  completed:       'Completed',
  draft:           'Draft',
  unpublished:     'Unpublished',
}

export default function StatusBadge({ status, className = '' }) {
  const cls = STATUS[status] ?? STATUS.draft
  const isLive = status === 'live' || status === 'active'
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full ${cls} ${className}`}>
      {isLive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />}
      {LABEL[status] ?? status}
    </span>
  )
}
