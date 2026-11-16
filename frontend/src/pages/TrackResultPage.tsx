// ============================================================
// TrackResultPage — Public case status display
// Wired to real backend API in Phase 4 via publicService.trackCase().
// ============================================================
import { useParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Shield, Loader2, ArrowLeft, Clock, RefreshCw, AlertCircle, Download, CheckCircle, RotateCcw, Ban } from 'lucide-react'
import { downloadInvestigationReport, submitReporterDecision, trackCase } from '@/services/publicService'

interface PublicCase {
  case_number: string
  status: string
  status_label: string
  incident_type?: string
  complaint_type?: string
  created_at: string
  updated_at: string
  public_notes: string[]
  reporter_actions: Array<{ action: string; details: string; timestamp: string | null }>
  investigation_report_available: boolean
  reporter_actions_available: boolean
}

const STATUS_COLORS: Record<string, string> = {
  open: 'text-status-pending bg-amber-400/10 border-amber-400/30',
  in_progress: 'text-status-review bg-blue-400/10 border-blue-400/30',
  under_review: 'text-status-complete bg-emerald-400/10 border-emerald-400/30',
  resolved: 'text-status-referred bg-purple-400/10 border-purple-400/30',
  closed: 'text-status-closed bg-slate-400/10 border-slate-400/30',
  referred: 'text-status-referred bg-purple-400/10 border-purple-400/30',
  withdrawn: 'text-text-muted bg-surface-elevated border-surface-border',
}

export default function TrackResultPage() {
  const { caseNumber } = useParams<{ caseNumber: string }>()
  const [caseData, setCaseData] = useState<PublicCase | null | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [accessToken, setAccessToken] = useState(() =>
    caseNumber ? sessionStorage.getItem(`case-access:${caseNumber}`) ?? '' : ''
  )
  const [isSignedInCitizen] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('veridact_user') ?? '{}').role === 'citizen'
    } catch {
      return false
    }
  })
  const [accessDraft, setAccessDraft] = useState(accessToken)
  const [decisionReason, setDecisionReason] = useState('')
  const [decisionMessage, setDecisionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [isActing, setIsActing] = useState(false)

  useEffect(() => {
    const fetchCase = async () => {
      setIsLoading(true)
      try {
        const data = await trackCase(caseNumber ?? '', accessToken || undefined)
        setCaseData(data)
      } catch (err: any) {
        if (err?.response?.status === 404) {
          setCaseData(null)
        } else if (err?.response?.status === 403) {
          setCaseData(null)
        } else {
          setCaseData(null) // treat any error as not found for now
        }
      } finally {
        setIsLoading(false)
      }
    }
    if (caseNumber) fetchCase()
  }, [caseNumber, accessToken])

  const handleAccessCode = (event: React.FormEvent) => {
    event.preventDefault()
    const token = accessDraft.trim()
    if (!token || !caseNumber) return
    sessionStorage.setItem(`case-access:${caseNumber}`, token)
    setAccessToken(token)
  }

  const handleReporterDecision = async (action: 'accept' | 'request_changes' | 'withdraw') => {
    if (!caseNumber || !accessToken) return
    if (action === 'withdraw' && !window.confirm('Withdraw this complaint? This will stop the active investigation.')) return
    setIsActing(true)
    setActionError('')
    setDecisionMessage('')
    try {
      const result = await submitReporterDecision(caseNumber, accessToken, action, decisionReason.trim() || undefined)
      setDecisionMessage(result.message)
      setDecisionReason('')
      const updated = await trackCase(caseNumber, accessToken)
      setCaseData(updated)
    } catch (error: any) {
      setActionError(error?.response?.data?.detail ?? 'Could not update the case. Please try again.')
    } finally {
      setIsActing(false)
    }
  }

  const handleDownloadReport = async () => {
    if (!caseNumber || !accessToken) return
    setIsActing(true)
    setActionError('')
    try {
      const report = await downloadInvestigationReport(caseNumber, accessToken)
      const url = URL.createObjectURL(report)
      const link = document.createElement('a')
      link.href = url
      link.download = `${caseNumber}-investigation-report.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error: any) {
      setActionError(error?.response?.data?.detail ?? 'Could not download the investigation report.')
    } finally {
      setIsActing(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      <Link to="/track" className="inline-flex items-center gap-2 text-body-sm text-text-muted hover:text-text-primary mb-8">
        <ArrowLeft className="w-4 h-4" /> Track another case
      </Link>

      {isLoading && (
        <div className="card-base p-12 text-center">
          <Loader2 className="w-8 h-8 text-accent-primary animate-spin mx-auto mb-3" />
          <p className="text-body text-text-muted">Looking up your case...</p>
        </div>
      )}

      {!isLoading && caseData === null && (
        <div className="card-base p-10 text-center">
          <Shield className="w-10 h-10 text-text-disabled mx-auto mb-4" />
          <h2 className="text-h3 font-bold text-text-primary mb-2">Case Not Found</h2>
          <p className="text-body text-text-muted">
            No case found with number{' '}
            <span className="font-mono-data text-accent-primary">{caseNumber}</span>.
            Please check your submission receipt.
          </p>
        </div>
      )}

      {!isLoading && caseData && (
        <div className="space-y-4">
          <div className="card-base p-6">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <p className="text-caption text-text-muted uppercase tracking-widest mb-1">Case Number</p>
                <p className="font-mono-data text-h3 font-bold text-accent-primary">{caseData.case_number}</p>
              </div>
              <span className={`badge-base border ${STATUS_COLORS[caseData.status] ?? ''}`}>
                {caseData.status_label ?? caseData.status}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex gap-4 py-3 border-b border-surface-border">
                <span className="text-body-sm text-text-muted w-32 shrink-0">Incident Type</span>
                <span className="text-body-sm text-text-primary capitalize">
                  {(caseData.incident_type || caseData.complaint_type || '').replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex gap-4 py-3 border-b border-surface-border">
                <span className="text-body-sm text-text-muted w-32 shrink-0">Submitted</span>
                <span className="text-body-sm text-text-primary flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-text-muted" />
                  {new Date(caseData.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex gap-4 py-3">
                <span className="text-body-sm text-text-muted w-32 shrink-0">Last Updated</span>
                <span className="text-body-sm text-text-primary flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-text-muted" />
                  {new Date(caseData.updated_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Public notes from investigators */}
          {caseData.public_notes && caseData.public_notes.length > 0 && (
            <div className="card-base p-5 space-y-3">
              <p className="text-caption text-text-muted uppercase tracking-widest">Status Updates</p>
              {caseData.public_notes.map((note, i) => (
                <div key={i} className="flex items-start gap-2.5 p-3 rounded-lg bg-accent-subtle/50 border border-accent-primary/20">
                  <AlertCircle className="w-4 h-4 text-accent-primary shrink-0 mt-0.5" />
                  <p className="text-body-sm text-text-secondary">{note}</p>
                </div>
              ))}
            </div>
          )}

          {caseData.reporter_actions_available && (
            <section className="card-base p-5 space-y-4">
              <div>
                <h2 className="text-h4 font-semibold text-text-primary">Your review and case decisions</h2>
                <p className="text-caption text-text-muted mt-1">Use the private reporter access code from your receipt to review the investigation report or change the case outcome.</p>
              </div>

              {!accessToken && !isSignedInCitizen ? (
                <form onSubmit={handleAccessCode} className="space-y-3">
                  <label htmlFor="reporter-access-code" className="text-caption text-text-secondary font-medium block">Reporter access code</label>
                  <div className="flex gap-2">
                    <input
                      id="reporter-access-code"
                      type="password"
                      value={accessDraft}
                      onChange={event => setAccessDraft(event.target.value)}
                      className="input-base flex-1"
                      autoComplete="off"
                      required
                    />
                    <button className="btn-primary text-body-sm" type="submit">Unlock</button>
                  </div>
                </form>
              ) : (
                <>
                  {decisionMessage && <p className="text-body-sm text-accent-primary">{decisionMessage}</p>}
                  {actionError && <p className="text-body-sm text-red-300">{actionError}</p>}

                  {caseData.investigation_report_available && (
                    <button type="button" onClick={handleDownloadReport} disabled={isActing} className="btn-secondary text-body-sm gap-2">
                      {isActing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      Download investigation report
                    </button>
                  )}

                  {caseData.status === 'resolved' && (
                    <div className="space-y-3 border-t border-surface-border pt-4">
                      <p className="text-body-sm text-text-secondary">Review the investigation report. You can accept the outcome or request more justification and transparency.</p>
                      <label htmlFor="reporter-change-reason" className="text-caption text-text-muted block">What additional explanation or transparency is needed?</label>
                      <textarea
                        id="reporter-change-reason"
                        value={decisionReason}
                        onChange={event => setDecisionReason(event.target.value)}
                        className="input-base min-h-24 resize-y"
                        maxLength={2000}
                        placeholder="Describe what remains unclear or what additional justification you need..."
                      />
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => handleReporterDecision('accept')} disabled={isActing} className="btn-primary text-body-sm gap-2">
                          <CheckCircle className="w-4 h-4" /> Accept and close case
                        </button>
                        <button type="button" onClick={() => handleReporterDecision('request_changes')} disabled={isActing || !decisionReason.trim()} className="btn-secondary text-body-sm gap-2">
                          <RotateCcw className="w-4 h-4" /> Request further explanation
                        </button>
                      </div>
                    </div>
                  )}

                  {caseData.status === 'closed' && caseData.investigation_report_available && (
                    <div className="space-y-3 border-t border-surface-border pt-4">
                      <p className="text-body-sm text-text-secondary">Still need clarification? Request further explanation and the case will return to active investigation.</p>
                      <textarea
                        aria-label="Requested additional justification or transparency"
                        value={decisionReason}
                        onChange={event => setDecisionReason(event.target.value)}
                        className="input-base min-h-24 resize-y"
                        maxLength={2000}
                        placeholder="Describe what additional justification or transparency is required..."
                      />
                      <button type="button" onClick={() => handleReporterDecision('request_changes')} disabled={isActing || !decisionReason.trim()} className="btn-secondary text-body-sm gap-2">
                        <RotateCcw className="w-4 h-4" /> Reopen and request explanation
                      </button>
                    </div>
                  )}

                  {['open', 'in_progress', 'under_review', 'referred'].includes(caseData.status) && (
                    <div className="border-t border-surface-border pt-4">
                      <button
                        type="button"
                        onClick={() => handleReporterDecision('withdraw')}
                        disabled={isActing}
                        className="text-body-sm text-red-300 hover:text-red-200 inline-flex items-center gap-2"
                      >
                        <Ban className="w-4 h-4" /> Withdraw this complaint
                      </button>
                    </div>
                  )}

                  {caseData.reporter_actions.length > 0 && (
                    <div className="border-t border-surface-border pt-4 space-y-2">
                      <h3 className="text-caption uppercase tracking-wider text-text-muted">Your previous decisions</h3>
                      {caseData.reporter_actions.map((event, index) => (
                        <p key={`${event.action}-${index}`} className="text-caption text-text-secondary">
                          {event.timestamp ? new Date(event.timestamp).toLocaleString() : ''} · {event.details}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          <div className="card-base p-5">
            <p className="text-caption text-text-muted uppercase tracking-widest mb-2">Security & Privacy Notice</p>
            <p className="text-body-sm text-text-secondary">
              Your incident report has been received and logged into the Incident Management System.
              Internal investigation details and sensitive IOCs are restricted to protect operational security.
            </p>
          </div>

          <p className="text-caption text-text-disabled text-center mt-4">
            For urgent escalations, contact the Security Operations Center at{' '}
            <span className="text-text-muted">soc@veridact.com</span>
          </p>
        </div>
      )}
    </div>
  )
}
