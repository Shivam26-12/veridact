// ============================================================
// SubmitPage — Citizen Incident Submission Wizard (4 steps)
// ============================================================
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Mail, Lock, Database, Zap, Bug, UserX, UserCheck, Globe, Network, Users, HelpCircle,
  Shield, CheckCircle, Upload, Loader2, Copy, Check,
  ArrowRight, ArrowLeft, AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { IncidentType } from '@/types/constants'
import { caseService } from '@/services/caseService'
import { evidenceService } from '@/services/evidenceService'

const INCIDENT_OPTIONS: { type: IncidentType; label: string; desc: string; icon: React.ComponentType<{className?: string}> }[] = [
  { type: 'phishing', label: 'Phishing Attack', desc: 'Fraudulent emails, SMS, or websites stealing credentials', icon: Mail },
  { type: 'ransomware', label: 'Ransomware', desc: 'Files encrypted, ransom demanded', icon: Lock },
  { type: 'data_breach', label: 'Data Breach', desc: 'Unauthorized access or exfiltration of sensitive data', icon: Database },
  { type: 'ddos', label: 'DDoS Attack', desc: 'Service disruption from volumetric attack', icon: Zap },
  { type: 'malware', label: 'Malware Infection', desc: 'Virus, trojan, spyware, or keylogger detected', icon: Bug },
  { type: 'unauthorized_access', label: 'Unauthorized Access', desc: 'Intrusion into systems or accounts without permission', icon: UserX },
  { type: 'insider_threat', label: 'Insider Threat', desc: 'Malicious or accidental action by internal user', icon: UserCheck },
  { type: 'web_application_attack', label: 'Web App Attack', desc: 'SQL injection, XSS, CSRF, or API abuse', icon: Globe },
  { type: 'network_intrusion', label: 'Network Intrusion', desc: 'Unauthorized lateral movement in network', icon: Network },
  { type: 'social_engineering', label: 'Social Engineering', desc: 'Manipulation tactics to gain access or information', icon: Users },
  { type: 'other', label: 'Other', desc: 'Other cybersecurity incident type', icon: HelpCircle },
]

const STEPS = ['Incident Type', 'Description', 'Upload File', 'Review & Submit']

interface FormData {
  incident_type: IncidentType | ''
  title: string
  description: string
  affected_systems: string
  contact_email: string
  contact_phone: string
  location: string
  file: File | null
}

export default function SubmitPage() {
  const [step, setStep] = useState(0)
  const [formData, setFormData] = useState<FormData>({
    incident_type: '', title: '', description: '', affected_systems: '',
    contact_email: '', contact_phone: '', location: '', file: null,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{ caseNumber: string; hash: string } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const handleNext = () => setStep(s => Math.min(s + 1, 3))
  const handleBack = () => setStep(s => Math.max(s - 1, 0))

  const handleFileSelect = (file: File) => {
    setFormData(prev => ({ ...prev, file }))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      // Step 1: Create the incident case
      const createdCase = await caseService.createCaseAnonymous({
        title: formData.title,
        description: formData.description,
        incident_type: formData.incident_type as IncidentType,
        contact_email: formData.contact_email || undefined,
        contact_phone: formData.contact_phone || undefined,
        location: formData.location || undefined,
        affected_systems: formData.affected_systems || undefined,
      })

      // Step 2: Upload the evidence file
      let sha256Hash = ''
      if (formData.file) {
        const evidence = await evidenceService.uploadEvidence(createdCase.id, formData.file)
        sha256Hash = evidence.sha256_hash
      }

      setSubmitted({
        caseNumber: createdCase.case_number,
        hash: sha256Hash,
      })
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      if (typeof detail === 'string') {
        setSubmitError(detail)
      } else {
        setSubmitError('Submission failed. Please check your connection and try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <div className="card-base p-10">
          <CheckCircle className="w-16 h-16 text-accent-primary mx-auto mb-6" />
          <h1 className="text-h2 font-bold text-text-primary mb-2">Incident Reported</h1>
          <p className="text-body text-text-muted mb-8">Your incident has been securely received, logged, and is pending triage by our security team.</p>

          <div className="bg-slate-950 rounded-lg p-6 text-left mb-6 space-y-4">
            <div>
              <p className="text-caption text-text-muted uppercase tracking-widest mb-1">Incident Number</p>
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono-data text-h3 font-bold text-accent-primary">{submitted.caseNumber}</span>
                <button onClick={() => handleCopy(submitted.caseNumber)} className="btn-ghost p-1.5">
                  {copied ? <Check className="w-4 h-4 text-accent-primary" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {submitted.hash && (
              <div>
                <p className="text-caption text-text-muted uppercase tracking-widest mb-1">SHA-256 Evidence Hash</p>
                <p className="hash-display text-[11px]">{submitted.hash}</p>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to={`/track/${submitted.caseNumber}`} id="confirmation-track" className="btn-primary">
              Track My Incident <ArrowRight className="w-4 h-4" />
            </Link>
            <button onClick={() => { setSubmitted(null); setStep(0); setSubmitError(null); setFormData({ incident_type: '', title: '', description: '', affected_systems: '', contact_email: '', contact_phone: '', location: '', file: null }) }} className="btn-secondary">
              Submit Another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      {/* Progress bar */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className="flex items-center gap-2">
                <div className={cn(
                  'w-7 h-7 rounded-full border-2 flex items-center justify-center text-caption font-bold transition-all',
                  i < step ? 'bg-accent-primary border-accent-primary text-slate-900' :
                  i === step ? 'border-accent-primary text-accent-primary bg-accent-subtle' :
                  'border-surface-border text-text-disabled'
                )}>
                  {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={cn(
                  'text-body-sm hidden sm:block whitespace-nowrap',
                  i === step ? 'text-text-primary font-medium' : 'text-text-muted'
                )}>{label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={cn('flex-1 h-px', i < step ? 'bg-accent-primary' : 'bg-surface-border')} />}
            </div>
          ))}
        </div>
      </div>

      <div className="card-base p-8">
        {/* Step 1: Incident Type */}
        {step === 0 && (
          <div className="space-y-6">
            <h2 className="text-h3 font-bold text-text-primary">What type of cybersecurity incident occurred?</h2>
            <div className="grid grid-cols-2 gap-3">
              {INCIDENT_OPTIONS.map(opt => (
                <button
                  key={opt.type}
                  id={`incident-type-${opt.type}`}
                  onClick={() => setFormData(prev => ({ ...prev, incident_type: opt.type }))}
                  className={cn(
                    'flex flex-col items-start gap-2 p-4 rounded-lg border-2 text-left transition-all duration-150',
                    formData.incident_type === opt.type
                      ? 'border-accent-primary bg-accent-subtle'
                      : 'border-surface-border hover:border-slate-500 hover:bg-surface-elevated'
                  )}
                >
                  <opt.icon className={cn('w-5 h-5', formData.incident_type === opt.type ? 'text-accent-primary' : 'text-text-muted')} />
                  <div>
                    <p className={cn('text-body-sm font-semibold', formData.incident_type === opt.type ? 'text-accent-primary' : 'text-text-primary')}>{opt.label}</p>
                    <p className="text-caption text-text-muted mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button id="step1-next" onClick={handleNext} disabled={!formData.incident_type} className="btn-primary">
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Description */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-h3 font-bold text-text-primary">Describe the incident</h2>
            <div>
              <label htmlFor="submit-title" className="block text-body-sm font-medium text-text-secondary mb-1.5">Title <span className="text-red-400">*</span></label>
              <input id="submit-title" type="text" value={formData.title} onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))} className="input-base" placeholder="Brief title for the incident" minLength={5} maxLength={200} required />
            </div>
            <div>
              <label htmlFor="submit-description" className="block text-body-sm font-medium text-text-secondary mb-1.5">Description <span className="text-red-400">*</span></label>
              <textarea id="submit-description" value={formData.description} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} className="input-base min-h-[120px] resize-none" placeholder="Describe what happened, when it occurred, and how it was discovered. (50-2000 characters)" minLength={50} maxLength={2000} required rows={5} />
              <p className="text-caption text-text-muted mt-1">{formData.description.length}/2000</p>
            </div>
            <div>
              <label htmlFor="submit-affected-systems" className="block text-body-sm font-medium text-text-secondary mb-1.5">Affected Systems (optional)</label>
              <input id="submit-affected-systems" type="text" value={formData.affected_systems} onChange={e => setFormData(prev => ({ ...prev, affected_systems: e.target.value }))} className="input-base" placeholder="e.g. Email servers, HR workstations, Customer DB" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="submit-email" className="block text-body-sm font-medium text-text-secondary mb-1.5">Contact Email (optional)</label>
                <input id="submit-email" type="email" value={formData.contact_email} onChange={e => setFormData(prev => ({ ...prev, contact_email: e.target.value }))} className="input-base" placeholder="your@email.com" />
              </div>
              <div>
                <label htmlFor="submit-phone" className="block text-body-sm font-medium text-text-secondary mb-1.5">Contact Phone (optional)</label>
                <input id="submit-phone" type="tel" value={formData.contact_phone} onChange={e => setFormData(prev => ({ ...prev, contact_phone: e.target.value }))} className="input-base" placeholder="+1-555-XXXXXXX" />
              </div>
            </div>
            <div>
              <label htmlFor="submit-location" className="block text-body-sm font-medium text-text-secondary mb-1.5">Incident Location (optional)</label>
              <input id="submit-location" type="text" value={formData.location} onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))} className="input-base" placeholder="City, office, or platform where incident occurred" />
            </div>
            <div className="flex justify-between">
              <button onClick={handleBack} className="btn-ghost"><ArrowLeft className="w-4 h-4" /> Back</button>
              <button id="step2-next" onClick={handleNext} disabled={!formData.title || formData.description.length < 50} className="btn-primary">Next <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* Step 3: Upload */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-h3 font-bold text-text-primary">Upload evidence file</h2>
            <div
              id="submit-dropzone"
              onDragOver={e => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={cn(
                'border-2 border-dashed rounded-lg p-10 text-center transition-all duration-200 cursor-pointer',
                dragActive ? 'border-accent-primary bg-accent-subtle' :
                formData.file ? 'border-accent-primary/50 bg-accent-subtle/50' :
                'border-surface-border hover:border-slate-500'
              )}
              onClick={() => document.getElementById('submit-file-input')?.click()}
            >
              <input
                id="submit-file-input"
                type="file"
                className="hidden"
                accept=".log,.txt,.csv,.jpg,.jpeg,.png,.bmp,.webp,.pcap,.pcapng,.pdf,.docx,.xlsx,.eml,.msg,.zip,.tar,.gz"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
              />
              {formData.file ? (
                <div>
                  <CheckCircle className="w-10 h-10 text-accent-primary mx-auto mb-3" />
                  <p className="text-body font-semibold text-text-primary">{formData.file.name}</p>
                  <p className="text-caption text-text-muted mt-1">{(formData.file.size / 1024 / 1024).toFixed(2)} MB</p>
                  <button type="button" onClick={e => { e.stopPropagation(); setFormData(prev => ({ ...prev, file: null })) }} className="text-caption text-red-400 hover:text-red-300 mt-2">Remove</button>
                </div>
              ) : (
                <div>
                  <Upload className="w-10 h-10 text-text-muted mx-auto mb-3" />
                  <p className="text-body font-medium text-text-primary">Drop your evidence file here, or click to browse</p>
                  <p className="text-body-sm text-text-muted mt-2">Logs, screenshots, PCAPs, documents, emails — max 100MB</p>
                </div>
              )}
            </div>
            <p className="text-caption text-text-muted flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-accent-primary" />
              Files are encrypted in transit and stored with SHA-256 integrity verification.
            </p>
            <div className="flex justify-between">
              <button onClick={handleBack} className="btn-ghost"><ArrowLeft className="w-4 h-4" /> Back</button>
              <button id="step3-next" onClick={handleNext} disabled={!formData.file} className="btn-primary">Next <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-h3 font-bold text-text-primary">Review & Submit</h2>
            <div className="space-y-3">
              {[
                { label: 'Incident Type', value: INCIDENT_OPTIONS.find(o => o.type === formData.incident_type)?.label },
                { label: 'Title', value: formData.title },
                { label: 'Description', value: formData.description },
                { label: 'Affected Systems', value: formData.affected_systems || '—' },
                { label: 'File', value: formData.file?.name },
                { label: 'Contact Email', value: formData.contact_email || '—' },
              ].map(row => (
                <div key={row.label} className="flex gap-4 py-3 border-b border-surface-border">
                  <span className="text-body-sm font-medium text-text-muted w-36 shrink-0">{row.label}</span>
                  <span className="text-body-sm text-text-primary break-words">{row.value}</span>
                </div>
              ))}
            </div>
            <p className="text-caption text-text-muted">
              By submitting, you confirm this incident information is accurate and consent to its review by our Security Operations Center (SOC).
              All submissions are securely logged with full chain of custody.
            </p>
            {submitError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-body-sm text-red-400">{submitError}</p>
              </div>
            )}
            <div className="flex justify-between">
              <button onClick={handleBack} className="btn-ghost"><ArrowLeft className="w-4 h-4" /> Back</button>
              <button id="submit-incident" onClick={handleSubmit} disabled={isSubmitting} className="btn-primary px-6">
                {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Securing submission...</> : 'Submit Incident Report'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
