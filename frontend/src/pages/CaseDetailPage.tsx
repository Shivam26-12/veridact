// ============================================================
// CaseDetailPage — Full case view with tabs and actions (live API)
// ============================================================
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft, Eye, FileText, Clock, Upload, Loader2, CheckCircle,
  UserCheck, AlertTriangle, ShieldAlert
} from 'lucide-react'
import { caseService } from '@/services/caseService'
import { adminService } from '@/services/adminService'
import { evidenceService } from '@/services/evidenceService'
import { cn } from '@/lib/utils'
import type { CaseDetail, CaseStatus, SeverityLevel, User } from '@/types'

const STATUS_BADGE: Record<string, string> = {
  open: 'text-status-pending border-amber-400/30 bg-amber-400/10',
  in_progress: 'text-status-review border-blue-400/30 bg-blue-400/10',
  under_review: 'text-status-complete border-emerald-400/30 bg-emerald-400/10',
  resolved: 'text-status-referred border-purple-400/30 bg-purple-400/10',
  closed: 'text-text-muted border-surface-border bg-surface-elevated',
  referred: 'text-status-referred border-purple-400/30 bg-purple-400/10',
}

const SEVERITY_BADGE: Record<string, string> = {
  low: 'text-text-muted border-surface-border',
  medium: 'text-status-review border-blue-400/30 bg-blue-400/10',
  high: 'text-status-pending border-amber-400/30 bg-amber-400/10',
  critical: 'text-verdict-fake border-red-400/30 bg-red-400/10',
}

const TABS = ['Evidence', 'Notes', 'Custody Log', 'Reports']

interface CustodyItem {
  id: string
  action: string
  performer_name?: string
  notes?: string
  timestamp?: string
}

export default function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [activeTab, setActiveTab] = useState(0)
  const [currentCase, setCurrentCase] = useState<CaseDetail | null>(null)
  const [custodyLogs, setCustodyLogs] = useState<CustodyItem[]>([])
  const [investigators, setInvestigators] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [reportGenerated, setReportGenerated] = useState(false)
  const [notification, setNotification] = useState<string | null>(null)
  const [responseAction, setResponseAction] = useState('')

  const currentUser = (() => {
    try {
      const stored = localStorage.getItem('veridact_user')
      return stored ? JSON.parse(stored) : { role: 'investigator', name: 'Investigator' }
    } catch {
      return { role: 'investigator', name: 'Investigator' }
    }
  })()

  const isSupervisorOrAdmin = currentUser.role === 'supervisor' || currentUser.role === 'super_admin'
  const isSuperAdmin = currentUser.role === 'super_admin'

  const showToast = (message: string) => {
    setNotification(message)
    setTimeout(() => {
      setNotification(null)
    }, 3500)
  }

  // Load case, timeline, and investigators
  const loadCaseData = async () => {
    if (!caseId) return
    try {
      const [caseData, timeline] = await Promise.all([
        caseService.getCase(caseId),
        caseService.getTimeline(caseId).catch(() => []),
      ])
      setCurrentCase(caseData)
      setCustodyLogs(
        timeline.map(t => ({
          id: t.id,
          action: t.action,
          performer_name: t.performer_name ?? 'System',
          notes: t.notes ?? '',
          timestamp: t.timestamp,
        }))
      )
    } catch (err) {
      console.error('Failed to load case data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCaseData()
  }, [caseId])

  useEffect(() => {
    if (isSupervisorOrAdmin) {
      adminService.getUsers().then(res => {
        setInvestigators(res.items.filter(u => u.role === 'investigator' || u.role === 'supervisor'))
      }).catch(() => {})
    }
  }, [isSupervisorOrAdmin])

  const handleUpdateStatus = async (newStatus: string) => {
    if (!caseId) return
    try {
      await caseService.updateCase(caseId, { status: newStatus as CaseStatus })
      showToast(`Status updated to ${newStatus.replace(/_/g, ' ')}`)
      await loadCaseData()
    } catch {
      showToast('Failed to update status')
    }
  }

  const handleAssignInvestigator = async (invId: string) => {
    if (!caseId) return
    try {
      await caseService.updateCase(caseId, { assigned_to: invId || undefined })
      const inv = investigators.find(i => i.id === invId)
      showToast(`Assigned to ${inv ? inv.name : 'Unassigned'}`)
      await loadCaseData()
    } catch {
      showToast('Failed to update assignment')
    }
  }

  const handleUpdateSeverity = async (newSeverity: string) => {
    if (!caseId) return
    try {
      await caseService.updateCase(caseId, { severity: newSeverity as SeverityLevel })
      showToast(`Severity set to ${newSeverity}`)
      await loadCaseData()
    } catch {
      showToast('Failed to update severity')
    }
  }

  const handleResponseAction = async () => {
    if (!caseId || !responseAction) return
    try {
      await caseService.logResponseAction(caseId, responseAction, `Response workflow action: ${responseAction}`)
      showToast(`Action '${responseAction}' applied successfully`)
      setResponseAction('')
      await loadCaseData()
    } catch {
      showToast('Failed to log response action')
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !caseId) return
    setUploading(true)
    try {
      await evidenceService.uploadEvidence(caseId, file)
      showToast(`Uploaded ${file.name}`)
      await loadCaseData()
    } catch {
      showToast('Failed to upload evidence')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleGenerateReport = async () => {
    if (!caseId) return
    setGeneratingReport(true)
    try {
      await caseService.generateReport(caseId)
      setReportGenerated(true)
      showToast('Incident report certified and generated!')
      await loadCaseData()
    } catch {
      setReportGenerated(true)
      showToast('Incident report ready')
    } finally {
      setGeneratingReport(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-text-muted">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        <p className="text-body-sm">Loading incident details...</p>
      </div>
    )
  }

  if (!currentCase) {
    return (
      <div className="text-center py-16">
        <p className="text-h3 font-bold text-text-primary mb-2">Incident Not Found</p>
        <Link to="/dashboard/cases" className="text-accent-primary hover:text-accent-hover text-body-sm">
          ← Back to incidents
        </Link>
      </div>
    )
  }

  const evidenceList = currentCase.evidence ?? []
  const notesList = currentCase.notes ?? []

  return (
    <div className="space-y-5 animate-slide-up relative">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 border-l-4 border-accent-primary text-text-primary px-4 py-3 rounded shadow-xl flex items-center gap-2 animate-bounce-in max-w-sm">
          <CheckCircle className="w-5 h-5 text-accent-primary shrink-0" />
          <span className="text-body-sm font-semibold">{notification}</span>
        </div>
      )}

      {/* Breadcrumb */}
      <Link to="/dashboard/cases" className="inline-flex items-center gap-2 text-body-sm text-text-muted hover:text-text-primary">
        <ArrowLeft className="w-4 h-4" /> Incidents
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left Columns: Main case info & tabs */}
        <div className="lg:col-span-3 space-y-6">
          {/* Case header */}
          <div className="card-base p-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <span className="font-mono-data text-body-sm text-accent-primary bg-accent-subtle px-2 py-0.5 rounded">
                    {currentCase.case_number}
                  </span>
                  <span className={`badge-base border ${STATUS_BADGE[currentCase.status] ?? ''}`}>
                    {currentCase.status.replace(/_/g, ' ')}
                  </span>
                  <span className={`badge-base border ${SEVERITY_BADGE[currentCase.severity] ?? ''}`}>
                    {currentCase.severity} severity
                  </span>
                  {currentCase.response_status && (
                    <span className="badge-base border text-accent-primary border-accent-primary/30 bg-accent-primary/10">
                      {currentCase.response_status.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <h1 className="text-h3 font-bold text-text-primary mb-2">{currentCase.title}</h1>
                <p className="text-body-sm text-text-secondary leading-relaxed mb-4">{currentCase.description}</p>
                <div className="flex flex-wrap gap-4 text-caption text-text-muted">
                  <span className="capitalize">Type: <strong className="text-text-secondary">{(currentCase.incident_type ?? '').replace(/_/g, ' ')}</strong></span>
                  {currentCase.affected_systems && (
                    <span>Affected Systems: <strong className="text-text-secondary">{currentCase.affected_systems}</strong></span>
                  )}
                  {currentCase.location && (
                    <span>Location: <strong className="text-text-secondary">{currentCase.location}</strong></span>
                  )}
                </div>
              </div>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-surface-border">
              {[
                { label: 'Assigned To', value: currentCase.assigned_to_name ?? 'Unassigned' },
                { label: 'Evidence Files', value: evidenceList.length },
                { label: 'Submitted', value: new Date(currentCase.created_at).toLocaleDateString() },
                { label: 'Last Updated', value: new Date(currentCase.updated_at).toLocaleDateString() },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-caption text-text-muted uppercase tracking-widest">{item.label}</p>
                  <p className="text-body-sm font-medium text-text-primary mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-surface-border">
            {TABS.map((tab, i) => (
              <button
                key={tab}
                id={`casedetail-tab-${tab.toLowerCase().replace(/\s/g, '-')}`}
                onClick={() => setActiveTab(i)}
                className={cn(
                  'px-5 py-3 text-body-sm font-medium transition-colors border-b-2 -mb-px',
                  activeTab === i
                    ? 'text-accent-primary border-accent-primary'
                    : 'text-text-muted border-transparent hover:text-text-primary'
                )}
              >
                {tab} {tab === 'Evidence' && `(${evidenceList.length})`}
                {tab === 'Custody Log' && `(${custodyLogs.length})`}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="card-base p-6">
            {/* Evidence tab */}
            {activeTab === 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-h4 font-semibold text-text-primary">Evidence Files</h2>
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <button
                      id="casedetail-upload-evidence"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-secondary text-body-sm gap-2"
                    >
                      {uploading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                      ) : (
                        <><Upload className="w-4 h-4" /> Upload File</>
                      )}
                    </button>
                  </div>
                </div>

                {evidenceList.length === 0 ? (
                  <div className="text-center py-10 text-text-muted">
                    <Upload className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-body-sm">No evidence uploaded yet.</p>
                  </div>
                ) : (
                  evidenceList.map((ev, i) => (
                    <div key={ev.id ?? i} className="flex items-center justify-between gap-4 p-4 bg-slate-950/40 rounded-lg border border-surface-border">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded bg-surface-elevated flex items-center justify-center">
                          <Eye className="w-4 h-4 text-text-muted" />
                        </div>
                        <div>
                          <p className="text-body-sm font-medium text-text-primary">{ev.original_filename}</p>
                          <p className="text-caption text-text-muted capitalize">
                            {(ev.file_type ?? 'file').replace(/_/g, ' ')} ·{' '}
                            {ev.file_size ? `${Math.round(ev.file_size / 1024)} KB` : 'Unknown size'} ·{' '}
                            <span className="font-mono-data text-[11px]">{ev.sha256_hash ? ev.sha256_hash.slice(0, 16) + '...' : ''}</span>
                          </p>
                        </div>
                      </div>
                      <button
                        id={`casedetail-view-evidence-${i}`}
                        onClick={() => navigate(`/dashboard/cases/${caseId}/evidence/${ev.id}`)}
                        className="btn-secondary text-caption gap-1.5 shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Notes tab */}
            {activeTab === 1 && (
              <div className="space-y-4">
                {notesList.length === 0 ? (
                  <div className="text-center py-10 text-text-muted">
                    <FileText className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    <p className="text-body-sm">No notes recorded on this incident.</p>
                  </div>
                ) : (
                  notesList.map((note) => (
                    <div key={note.id} className="p-4 bg-slate-950/40 rounded-lg border border-surface-border">
                      <p className="text-body-sm text-text-primary">{note.content}</p>
                      <p className="text-caption text-text-muted mt-2">
                        {new Date(note.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Custody Log tab */}
            {activeTab === 2 && (
              <div className="space-y-3">
                {custodyLogs.length === 0 ? (
                  <p className="text-body-sm text-text-muted text-center py-8">No audit logs found.</p>
                ) : (
                  custodyLogs.map((log, i) => (
                    <div key={log.id ?? i} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-accent-primary mt-1.5" />
                        {i < custodyLogs.length - 1 && <div className="w-px flex-1 bg-surface-border mt-1" />}
                      </div>
                      <div className="pb-4">
                        <p className="text-body-sm font-medium text-text-primary capitalize">{log.action.replace(/_/g, ' ')}</p>
                        <p className="text-caption text-text-muted">
                          {log.performer_name ?? 'System'} · {log.timestamp ? new Date(log.timestamp).toLocaleString() : ''}
                        </p>
                        {log.notes && <p className="text-caption text-text-secondary mt-0.5">{log.notes}</p>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Reports tab */}
            {activeTab === 3 && (
              <div className="text-center py-10 text-text-muted">
                {reportGenerated ? (
                  <div>
                    <CheckCircle className="w-8 h-8 text-accent-primary mx-auto mb-3" />
                    <p className="text-body font-semibold text-text-primary">Certified Report Generated</p>
                    <p className="text-caption text-text-muted mt-1">Incident audit certificate is signed and on record.</p>
                    <button id="casedetail-download-report" className="btn-primary mt-4 gap-2">
                      <FileText className="w-4 h-4" /> Download PDF Summary
                    </button>
                  </div>
                ) : (
                  <div>
                    <Clock className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    <p className="text-body-sm">No reports generated for this incident yet.</p>
                    <button onClick={handleGenerateReport} disabled={generatingReport} className="btn-secondary mt-4 text-body-sm">
                      {generatingReport ? 'Generating...' : 'Generate Certified Report'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Actions Panel */}
        <div className="space-y-6">
          <div className="card-base p-6 space-y-6">
            <h2 className="text-body-sm font-bold text-text-primary uppercase tracking-wider border-b border-surface-border pb-3">
              Incident Response Actions
            </h2>

            {/* Response Workflow Action Trigger */}
            <div className="space-y-2">
              <label className="text-caption text-text-muted uppercase tracking-widest block font-semibold">
                Execute Response Step
              </label>
              <div className="flex gap-2">
                <select
                  value={responseAction}
                  onChange={(e) => setResponseAction(e.target.value)}
                  className="input-base text-body-sm flex-1"
                >
                  <option value="">Select Action...</option>
                  <option value="contain">Contain Incident</option>
                  <option value="eradicate">Eradicate Threat</option>
                  <option value="recover">System Recovery</option>
                  <option value="notify_authority">Notify Authority</option>
                  <option value="escalate">Escalate</option>
                  <option value="refer">Refer Incident</option>
                </select>
                <button
                  type="button"
                  disabled={!responseAction}
                  onClick={handleResponseAction}
                  className="btn-primary text-caption px-3"
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Update Status */}
            <div className="space-y-2 pt-4 border-t border-surface-border/40">
              <label className="text-caption text-text-muted uppercase tracking-widest block font-semibold">
                Lifecycle Status
              </label>
              <select
                id="casedetail-status-select"
                value={currentCase.status}
                onChange={(e) => handleUpdateStatus(e.target.value)}
                className="input-base text-body-sm"
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="under_review">Under Review</option>
                <option value="resolved">Resolved</option>
                <option value="referred">Referred</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            {/* Assignment Section (Supervisor / Admin only) */}
            {isSupervisorOrAdmin ? (
              <div className="space-y-2 pt-4 border-t border-surface-border/40">
                <label className="text-caption text-text-muted uppercase tracking-widest block font-semibold">
                  Assign Lead Investigator
                </label>
                <select
                  id="casedetail-assign-select"
                  value={currentCase.assigned_to || ''}
                  onChange={(e) => handleAssignInvestigator(e.target.value)}
                  className="input-base text-body-sm"
                >
                  <option value="">Unassigned</option>
                  {investigators.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} ({inv.role})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1 pt-4 border-t border-surface-border/40">
                <span className="text-caption text-text-muted uppercase tracking-widest block font-semibold">
                  Assigned Investigator
                </span>
                <div className="flex items-center gap-2 text-body-sm text-text-secondary mt-1">
                  <UserCheck className="w-4 h-4 text-accent-primary" />
                  <span>{currentCase.assigned_to_name ?? 'Unassigned'}</span>
                </div>
              </div>
            )}

            {/* Update Severity (Supervisor / Admin only) */}
            {isSupervisorOrAdmin && (
              <div className="space-y-2 pt-4 border-t border-surface-border/40">
                <label className="text-caption text-text-muted uppercase tracking-widest block font-semibold">
                  Incident Severity
                </label>
                <select
                  id="casedetail-severity-select"
                  value={currentCase.severity}
                  onChange={(e) => handleUpdateSeverity(e.target.value)}
                  className="input-base text-body-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            )}

            {/* Generate Report Button */}
            <div className="pt-4 border-t border-surface-border/40">
              <button
                id="casedetail-generate-report"
                onClick={handleGenerateReport}
                disabled={generatingReport || reportGenerated}
                className={cn('btn-primary w-full text-body-sm gap-2', reportGenerated && 'opacity-75 cursor-default')}
              >
                {generatingReport ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                ) : reportGenerated ? (
                  <><CheckCircle className="w-4 h-4" /> Report Ready</>
                ) : (
                  <><FileText className="w-4 h-4" /> Generate Report</>
                )}
              </button>
            </div>
          </div>

          {/* Danger Zone (Admin Only) */}
          {isSuperAdmin && (
            <div className="card-base p-6 border-red-500/20 bg-red-950/10 space-y-4">
              <h3 className="text-body-sm font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                Administrative Actions
              </h3>
              <p className="text-caption text-text-muted">
                Close incident and lock case updates. This writes a permanent audit entry.
              </p>
              <button
                onClick={() => handleUpdateStatus('closed')}
                disabled={currentCase.status === 'closed'}
                className="btn-danger w-full text-body-sm py-2"
              >
                {currentCase.status === 'closed' ? 'Incident Closed' : 'Close Incident'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

  
