// ============================================================
// AdminCustodyPage — System-wide custody audit log (live API)
// ============================================================
import { useState, useEffect } from 'react'
import {
  Clock, Eye, Upload, Play, CheckCircle, FileText, Download,
  Edit, Archive, FilePlus, Loader2
} from 'lucide-react'
import { adminService } from '@/services/adminService'
import type { CustodyLog } from '@/types'

const ACTION_ICONS: Record<string, React.ComponentType<{className?: string}>> = {
  case_created: FilePlus,
  incident_created: FilePlus,
  evidence_uploaded: Upload,
  evidence_accessed: Eye,
  status_updated: Play,
  priority_updated: Edit,
  severity_changed: Edit,
  case_assigned: CheckCircle,
  investigator_assigned: CheckCircle,
  note_added: FileText,
  report_generated: FileText,
  file_downloaded: Download,
  case_closed: Archive,
}

export default function AdminCustodyPage() {
  const [logs, setLogs] = useState<CustodyLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    adminService.getCustodyLogs({ size: 100 })
      .then(res => {
        if (!cancelled) {
          setLogs(res.items)
          setTotal(res.total)
        }
      })
      .catch(err => console.error('Failed to load custody logs:', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="space-y-5 animate-slide-up">
      <div>
        <h1 className="text-h2 font-bold text-text-primary">Custody Audit Log</h1>
        <p className="text-body-sm text-text-muted mt-1">
          {loading ? 'Retrieving audit events...' : `${total} immutable chain-of-custody event${total === 1 ? '' : 's'} recorded`}
        </p>
      </div>

      <div className="card-base overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-text-muted">
            <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
            <p className="text-body-sm">Loading chain-of-custody ledger...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-text-muted">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-body-sm">No custody events logged yet.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="table-header">
                <th className="text-left px-4 py-3">Action</th>
                <th className="text-left px-4 py-3">Incident ID</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Actor</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">IP Address</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Notes / Evidence</th>
                <th className="text-left px-4 py-3">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const ActionIcon = ACTION_ICONS[log.action] ?? Clock
                return (
                  <tr key={log.id} className="table-row">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ActionIcon className="w-3.5 h-3.5 text-accent-primary shrink-0" />
                        <span className="text-body-sm text-text-secondary capitalize">
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono-data text-caption text-accent-primary">
                        {log.case_id}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-body-sm text-text-secondary">
                        {log.performer_name ?? 'System'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="font-mono-data text-caption text-text-muted">
                        {log.ip_address ?? '127.0.0.1'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-caption text-text-muted truncate max-w-[260px] block">
                        {log.notes || (log.evidence_id ? `Evidence ID: ${log.evidence_id}` : '—')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-caption text-text-muted font-mono-data">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
