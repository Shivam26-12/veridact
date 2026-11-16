// ============================================================
// LandingPage — Cybersecurity Incident Management landing page
// ============================================================
import { Link } from 'react-router-dom'
import { Shield, ArrowRight, AlertTriangle, FileSearch, Lock, CheckCircle, Activity, Users } from 'lucide-react'

const STATS = [
  { label: 'Incidents Reported', value: '1,284' },
  { label: 'Avg. Response Time', value: '2.4h' },
  { label: 'Incidents Resolved', value: '94%' },
  { label: 'Organizations Served', value: '37' },
]

const FEATURES = [
  {
    icon: AlertTriangle,
    title: 'Incident Reporting',
    description: 'Quickly report cybersecurity incidents — phishing, ransomware, data breaches, DDoS attacks, and more through a guided submission wizard.',
  },
  {
    icon: Activity,
    title: 'Severity Assessment',
    description: 'Automatic severity classification (Low → Critical) with structured triage to prioritize resources and escalate high-impact incidents.',
  },
  {
    icon: FileSearch,
    title: 'Investigation Tracking',
    description: 'Assign incidents to investigators, track evidence, add investigation notes, and maintain a full chain-of-custody audit log.',
  },
  {
    icon: Lock,
    title: 'Response Workflows',
    description: 'Structured response stages: Contain → Eradicate → Recover → Notify. Each action is logged with timestamps for accountability.',
  },
  {
    icon: CheckCircle,
    title: 'Audit Logs',
    description: 'Every action is immutably logged — who did what, when, and why. Full chain of custody for compliance and post-incident review.',
  },
  {
    icon: Users,
    title: 'Role-Based Access',
    description: 'Investigators, supervisors, and admins each operate within their permission boundary. Citizens can report and track their own incidents.',
  },
]

const HOW_IT_WORKS = [
  { step: '01', title: 'Report Incident', desc: 'Citizens or staff report a cybersecurity incident through our secure guided wizard. No login required.' },
  { step: '02', title: 'Severity Triage', desc: 'The system assigns a severity level. Supervisors assign the incident to an investigator for immediate action.' },
  { step: '03', title: 'Investigate & Respond', desc: 'Investigators collect evidence, log response actions, and progress through contain → eradicate → recover stages.' },
  { step: '04', title: 'Resolve & Report', desc: 'Generate a comprehensive incident report with full timeline, evidence chain, and post-incident recommendations.' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-forensic-grid bg-surface-base py-24 px-6">
        {/* Glow effect */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[600px] rounded-full bg-accent-primary/5 blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-accent-primary/30 bg-accent-subtle text-caption text-accent-primary font-semibold uppercase tracking-widest mb-8">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse" />
            Cybersecurity Incident Management
          </div>

          {/* Headline */}
          <h1 className="text-display font-bold text-text-primary mb-6 leading-tight">
            Report. Investigate.{' '}
            <span className="text-gradient-emerald">Resolve.</span>
          </h1>

          {/* Subheadline */}
          <p className="text-body-lg text-text-muted max-w-2xl mx-auto mb-10 leading-relaxed">
            VERIDACT is a comprehensive cybersecurity incident reporting and management platform.
            From phishing to ransomware — report, track, investigate, and respond with full audit trails.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/submit"
              id="hero-report-incident"
              className="btn-primary px-6 py-3 text-body-sm gap-2"
            >
              Report an Incident
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/track"
              id="hero-track-case"
              className="btn-secondary px-6 py-3 text-body-sm"
            >
              Track Your Incident
            </Link>
          </div>

          {/* Trust line */}
          <p className="mt-8 text-caption text-text-disabled flex items-center justify-center gap-2">
            <Shield className="w-3.5 h-3.5 text-accent-primary" />
            End-to-end encrypted · Full audit log · Chain of custody
          </p>
        </div>
      </section>

      {/* ── Stats Banner ─────────────────────────────────── */}
      <section className="border-y border-surface-border bg-slate-950/60">
        <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-h2 font-bold text-accent-primary font-mono-data">{stat.value}</div>
              <div className="text-caption text-text-muted mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────── */}
      <section className="py-20 px-6 bg-surface-base">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-h2 font-bold text-text-primary mb-3">Platform Capabilities</h2>
            <p className="text-body text-text-muted">Built for security teams. Trusted by organizations.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="card-base card-hover p-6"
              >
                <div className="w-10 h-10 rounded-lg bg-accent-subtle border border-accent-primary/20 flex items-center justify-center mb-4">
                  <feature.icon className="w-5 h-5 text-accent-primary" />
                </div>
                <h3 className="text-h4 text-text-primary mb-2">{feature.title}</h3>
                <p className="text-body-sm text-text-muted leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────── */}
      <section className="py-20 px-6 bg-slate-950/40 border-y border-surface-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-h2 font-bold text-text-primary mb-3">How It Works</h2>
            <p className="text-body text-text-muted">From incident report to full resolution — structured and auditable.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.step} className="relative">
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden md:block absolute top-5 left-full w-full h-px bg-surface-border -translate-y-1/2 z-0" />
                )}
                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-full bg-accent-subtle border-2 border-accent-primary/40 flex items-center justify-center mb-4">
                    <span className="font-mono-data text-caption font-bold text-accent-primary">{step.step}</span>
                  </div>
                  <h3 className="text-body font-semibold text-text-primary mb-2">{step.title}</h3>
                  <p className="text-body-sm text-text-muted leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-surface-base">
        <div className="max-w-2xl mx-auto text-center">
          <div className="card-base card-accent p-10">
            <Shield className="w-10 h-10 text-accent-primary mx-auto mb-4" />
            <h2 className="text-h2 font-bold text-text-primary mb-4">
              Experiencing a security incident?
            </h2>
            <p className="text-body text-text-muted mb-8">
              Report it immediately. No login required. Our team will assess the severity,
              assign an investigator, and guide you through the response process.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/submit" id="cta-report" className="btn-primary px-8 py-3">
                Report Incident Now
              </Link>
              <Link to="/login" id="cta-login" className="btn-ghost px-8 py-3">
                Investigator Login →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
