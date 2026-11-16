// ============================================================
// TrackPage — Incident number entry for citizens
// ============================================================
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Shield, AlertCircle } from 'lucide-react'

export default function TrackPage() {
  const navigate = useNavigate()
  const [caseNumber, setCaseNumber] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const pattern = /^(INC|VRD)-\d{4}-\d{6}$/
    if (!pattern.test(caseNumber.trim())) {
      setError('Please enter a valid incident number (e.g. INC-2025-000042)')
      return
    }
    navigate(`/track/${caseNumber.trim()}`)
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-20 text-center">
      <div className="mb-8">
        <div className="w-14 h-14 rounded-2xl bg-accent-subtle border border-accent-primary/30 flex items-center justify-center mx-auto mb-5">
          <Shield className="w-7 h-7 text-accent-primary" />
        </div>
        <h1 className="text-h1 font-bold text-text-primary mb-3">Track Your Incident</h1>
        <p className="text-body text-text-muted">
          Enter the incident number from your submission receipt to check the current status and response actions.
        </p>
      </div>

      <form id="track-form" onSubmit={handleSubmit} className="card-base p-6 text-left">
        <label htmlFor="track-case-number" className="block text-body-sm font-medium text-text-secondary mb-2">
          Incident Number
        </label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              id="track-case-number"
              type="text"
              value={caseNumber}
              onChange={e => { setCaseNumber(e.target.value.toUpperCase()); setError('') }}
              className="input-base pl-10 font-mono-data uppercase"
              placeholder="INC-2025-000042"
              maxLength={18}
            />
          </div>
          <button id="track-submit" type="submit" className="btn-primary px-5 shrink-0">
            Track
          </button>
        </div>
        {error && (
          <div className="flex items-center gap-2 mt-3">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-body-sm text-red-400">{error}</p>
          </div>
        )}
        <p className="text-caption text-text-muted mt-4">
          Your incident number was provided on the submission confirmation screen.
        </p>
      </form>

      {/* Demo links */}
      <div className="mt-6">
        <p className="text-caption text-text-disabled mb-2">Try a demo:</p>
        {['INC-2025-000001', 'INC-2025-000002'].map(num => (
          <button
            key={num}
            onClick={() => navigate(`/track/${num}`)}
            className="mx-2 text-body-sm text-accent-primary hover:text-accent-hover font-mono-data"
          >
            {num}
          </button>
        ))}
      </div>
    </div>
  )
}
