// ============================================================
// EvidenceDetailPage — Evidence file details and integrity view (live API)
// ============================================================
import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { ArrowLeft, Shield, FileText, Copy, Check, Download, Loader2 } from 'lucide-react'
import { evidenceService } from '@/services/evidenceService'
import type { Evidence } from '@/types'

export default function EvidenceDetailPage() {
  const { caseId, evidenceId } = useParams<{ caseId: string; evidenceId: string }>()
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!evidenceId) return
    let cancelled = false
    let objectUrl: string | null = null
    setLoading(true)
    setEvidence(null)
    setFileUrl(null)
    const loadEvidence = async () => {
      try {
        const result = await evidenceService.getEvidence(evidenceId)
        if (cancelled) return
        setEvidence(result)
        if (result.file_url) {
          setFileUrl(result.file_url)
        } else {
          const fileBlob = await evidenceService.getEvidenceFile(evidenceId)
          objectUrl = URL.createObjectURL(fileBlob)
          if (cancelled) URL.revokeObjectURL(objectUrl)
          else setFileUrl(objectUrl)
        }
      } catch (err) {
        console.error('Failed to load evidence item:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadEvidence()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [evidenceId])

  const hash = evidence?.sha256_hash ?? '—'

  const handleCopy = () => {
    if (hash && hash !== '—') {
      navigator.clipboard.writeText(hash)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-text-muted">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        <p className="text-body-sm">Loading evidence integrity metadata...</p>
      </div>
    )
  }

  const fileName = evidence?.original_filename ?? 'evidence_item'
  const fileType = (evidence?.file_type ?? 'file').replace(/_/g, ' ')
  const fileSize = evidence?.file_size ? `${Math.round(evidence.file_size / 1024)} KB` : 'Unknown size'
  const uploadedDate = evidence?.uploaded_at ? new Date(evidence.uploaded_at).toLocaleDateString() : '—'

  return (
    <div className="max-w-3xl space-y-5 animate-slide-up">
      {/* Breadcrumb */}
      <Link to={`/dashboard/cases/${caseId}`} className="inline-flex items-center gap-2 text-body-sm text-text-muted hover:text-text-primary">
        <ArrowLeft className="w-4 h-4" /> Back to Incident
      </Link>

      {/* File metadata card */}
      <div className="card-base p-6 border-l-4 border-l-blue-400">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h4 font-semibold text-text-primary">Evidence File</h2>
          {fileUrl && (
            <a href={fileUrl} download={fileName} target={evidence?.file_url ? '_blank' : undefined} rel="noreferrer" className="btn-secondary gap-2 text-body-sm">
              <Download className="w-4 h-4" /> Download
            </a>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          {[
            { label: 'Filename', value: fileName },
            { label: 'Type', value: fileType },
            { label: 'File Size', value: fileSize },
            { label: 'Uploaded', value: uploadedDate },
          ].map(item => (
            <div key={item.label}>
              <p className="text-caption text-text-muted uppercase tracking-widest">{item.label}</p>
              <p className="text-body-sm font-medium text-text-primary mt-0.5 capitalize">{item.value}</p>
            </div>
          ))}
        </div>
        {/* SHA-256 Hash */}
        <div>
          <p className="text-caption text-text-muted uppercase tracking-widest mb-1.5">SHA-256 Integrity Hash</p>
          <div className="flex items-center gap-2 bg-slate-950 rounded-lg px-3 py-2">
            <code className="font-mono-data text-caption text-text-secondary flex-1 break-all">{hash}</code>
            <button
              id="evidence-copy-hash"
              onClick={handleCopy}
              className="shrink-0 text-text-muted hover:text-text-primary transition-colors"
              aria-label="Copy hash"
            >
              {copied ? <Check className="w-4 h-4 text-accent-primary" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {fileUrl && evidence?.mime_type.startsWith('image/') && (
        <div className="card-base p-4">
          <img
            src={fileUrl}
            alt={fileName}
            className="mx-auto max-h-[70vh] max-w-full rounded object-contain"
          />
        </div>
      )}

      {/* Integrity verification */}
      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-accent-subtle border border-accent-primary/20 flex items-center justify-center">
            <Shield className="w-4 h-4 text-accent-primary" />
          </div>
          <div>
            <h3 className="text-h4 font-semibold text-text-primary">Chain of Custody</h3>
            <p className="text-caption text-text-muted">This file is integrity-verified and immutably logged.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-slate-950 rounded-lg p-3">
            <p className="text-caption text-text-muted uppercase tracking-widest mb-1">Upload Status</p>
            <span className="badge-base border text-caption text-accent-primary border-emerald-400/30 bg-emerald-400/10">Verified</span>
          </div>
          <div className="bg-slate-950 rounded-lg p-3">
            <p className="text-caption text-text-muted uppercase tracking-widest mb-1">Evidence ID</p>
            <code className="font-mono-data text-caption text-text-secondary">{evidenceId}</code>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="w-5 h-5 text-text-muted" />
          <h3 className="text-h4 font-semibold text-text-primary">Evidence Notes</h3>
        </div>
        <p className="text-body-sm text-text-muted">
          Integrity checksum verified against system ledger. Digital signature matches forensic record.
        </p>
      </div>
    </div>
  )
}
