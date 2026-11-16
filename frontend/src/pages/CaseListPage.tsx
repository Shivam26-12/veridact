// ============================================================
// CaseListPage — Filterable, paginated incident table (live API)
// ============================================================
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FolderOpen, X, Loader2, AlertCircle } from 'lucide-react'
import { useCases } from '@/hooks/useCases'
import type { CaseStatus, SeverityLevel } from '@/types/constants'

const STATUS_OPTIONS: CaseStatus[] = ['open', 'in_progress', 'under_review', 'resolved', 'closed', 'referred']
const SEVERITY_OPTIONS: SeverityLevel[] = ['low', 'medium', 'high', 'critical']

const STATUS_BADGE: Record<string, string> = {
  open: 'text-status-pending border-amber-400/30 bg-amber-400/10',
  in_progress: 'text-status-review border-blue-400/30 bg-blue-400/10',
  under_review: 'text-status-complete border-emerald-400/30 bg-emerald-400/10',
  resolved: 'text-status-referred border-purple-400/30 bg-purple-400/10',
  closed: 'text-status-closed border-slate-400/30 bg-slate-400/10',
  referred: 'text-status-referred border-purple-400/30 bg-purple-400/10',
}

const SEVERITY_BADGE: Record<string, string> = {
  low: 'text-text-muted border-surface-border',
  medium: 'text-status-review border-blue-400/30 bg-blue-400/10',
  high: 'text-status-pending border-amber-400/30 bg-amber-400/10',
  critical: 'text-verdict-fake border-red-400/30 bg-red-400/10',
}

export default function CaseListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')

  const { data, isLoading, error } = useCases({
    status: statusFilter || undefined,
    severity: severityFilter || undefined,
    search: search || undefined,
    page: 1,
    size: 50,
  })

  const incidents = data?.items ?? []
  const total = data?.total ?? 0
  const hasFilters = Boolean(search || statusFilter || severityFilter)

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-h2 font-bold text-text-primary">Incidents</h1>
        <p className="text-body-sm text-text-muted mt-1">
          {isLoading ? 'Loading incidents...' : `${total} incident${total === 1 ? '' : 's'} recorded`}
        </p>
      </div>

      {/* Filter bar */}
      <div className="card-base p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            id="caselist-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-base pl-10"
            placeholder="Search by incident number or title..."
          />
        </div>
        <select
          id="caselist-status-filter"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="input-base w-auto"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select
          id="caselist-severity-filter"
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value)}
          className="input-base w-auto"
        >
          <option value="">All Severities</option>
          {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {hasFilters && (
          <button
            id="caselist-clear-filters"
            onClick={() => { setSearch(''); setStatusFilter(''); setSeverityFilter('') }}
            className="btn-ghost text-body-sm gap-1.5"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-body-sm">{error}</span>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="card-base p-16 flex flex-col items-center justify-center gap-3 text-text-muted">
          <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
          <p className="text-body-sm">Fetching incidents from database...</p>
        </div>
      ) : incidents.length === 0 ? (
        <div className="card-base p-16 text-center">
          <FolderOpen className="w-10 h-10 text-text-disabled mx-auto mb-3" />
          <p className="text-h4 text-text-primary font-semibold">No incidents found</p>
          <p className="text-body-sm text-text-muted mt-1">
            {hasFilters ? 'Try adjusting your filters.' : 'No incidents have been submitted yet.'}
          </p>
        </div>
      ) : (
        <div className="card-base overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="table-header">
                <th className="text-left px-4 py-3">Incident</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Type</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Severity</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Assigned To</th>
                <th className="text-left px-4 py-3 hidden xl:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map(c => (
                <tr
                  key={c.id}
                  id={`caselist-row-${c.id}`}
                  className="table-row"
                  onClick={() => navigate(`/dashboard/cases/${c.id}`)}
                >
                  <td className="px-4 py-3">
                    <span className="font-mono-data text-body-sm text-accent-primary block">{c.case_number}</span>
                    <span className="text-caption text-text-muted truncate block max-w-[250px]">{c.title}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-caption text-text-secondary capitalize">{(c.incident_type ?? '').replace(/_/g, ' ')}</span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`badge-base border ${SEVERITY_BADGE[c.severity] ?? ''}`}>{c.severity}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge-base border ${STATUS_BADGE[c.status] ?? ''}`}>{c.status.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-body-sm text-text-secondary">{c.assigned_to_name ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <span className="text-caption text-text-muted">{new Date(c.updated_at).toLocaleDateString()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
