// ============================================================
// AdminOverviewPage — Super admin system overview (live API)
// ============================================================
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Clock, Settings, FolderOpen, AlertTriangle, ShieldCheck, Loader2, ArrowUpRight } from 'lucide-react'
import { adminService } from '@/services/adminService'
import type { AnalyticsSummary } from '@/types/api.types'

export default function AdminOverviewPage() {
  const navigate = useNavigate()
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)
  const [userCount, setUserCount] = useState<number>(0)
  const [custodyCount, setCustodyCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      adminService.getAnalytics().catch(() => null),
      adminService.getUsers().catch(() => null),
      adminService.getCustodyLogs({ size: 1 }).catch(() => null),
    ]).then(([analyticsData, usersData, custodyData]) => {
      if (!cancelled) {
        if (analyticsData) setAnalytics(analyticsData)
        if (usersData) setUserCount(usersData.total)
        if (custodyData) setCustodyCount(custodyData.total)
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-text-muted">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        <p className="text-body-sm">Loading system overview...</p>
      </div>
    )
  }

  const statItems = [
    { label: 'Registered Users', value: userCount, icon: Users },
    { label: 'Total Incidents', value: analytics?.total_incidents ?? 0, icon: FolderOpen },
    { label: 'Active Triage Cases', value: analytics?.open_cases ?? 0, icon: AlertTriangle },
    { label: 'Resolved Incidents', value: analytics?.resolved_cases ?? 0, icon: ShieldCheck },
    { label: 'Custody Audit Events', value: custodyCount, icon: Clock },
    { label: 'System Status', value: 'Operational', icon: Settings },
  ]

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-h2 font-bold text-text-primary">Admin Overview</h1>
        <p className="text-body-sm text-text-muted mt-1">SOC incident management system telemetry and health</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {statItems.map(stat => (
          <div key={stat.label} className="card-base p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-accent-subtle flex items-center justify-center">
                <stat.icon className="w-4 h-4 text-accent-primary" />
              </div>
              <p className="text-body-sm text-text-muted">{stat.label}</p>
            </div>
            <p className="text-h2 font-bold font-mono-data text-text-primary">{stat.value}</p>
          </div>
        ))}
      </div>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-h4 font-semibold text-text-primary">Recent incidents</h2>
            <p className="text-caption text-text-muted mt-1">Open a case to review details or assign an investigator.</p>
          </div>
          <button onClick={() => navigate('/dashboard/cases')} className="btn-secondary text-caption gap-2">
            All incidents <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
        {(analytics?.recent_incidents.length ?? 0) === 0 ? (
          <div className="border border-surface-border px-4 py-8 text-center text-body-sm text-text-muted">
            No incidents have been submitted yet.
          </div>
        ) : (
          <div className="card-base divide-y divide-surface-border overflow-hidden">
            {analytics?.recent_incidents.map(incident => (
              <button
                key={incident.id}
                type="button"
                onClick={() => navigate(`/dashboard/cases/${incident.id}`)}
                className="w-full text-left px-4 py-3 hover:bg-surface-elevated/60 transition-colors grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-2 sm:items-center"
              >
                <span className="min-w-0">
                  <span className="font-mono-data text-caption text-accent-primary block">{incident.case_number}</span>
                  <span className="text-body-sm text-text-primary truncate block">{incident.title}</span>
                </span>
                <span className="badge-base border border-surface-border text-text-secondary capitalize justify-self-start">
                  {incident.status.replace(/_/g, ' ')}
                </span>
                <span className={`text-caption ${incident.assigned_to ? 'text-text-secondary' : 'text-status-pending'}`}>
                  {incident.assigned_to ? 'Assigned' : 'Unassigned'}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Manage Users', path: '/admin/users', icon: Users, desc: 'View, edit, and deactivate accounts' },
          { label: 'Custody Log', path: '/admin/custody', icon: Clock, desc: 'Full immutable audit trail of system events' },
          { label: 'Settings', path: '/admin/settings', icon: Settings, desc: 'Inspect platform configuration & policies' },
        ].map(item => (
          <button
            key={item.label}
            id={`admin-overview-${item.label.toLowerCase().replace(/\s/g, '-')}`}
            onClick={() => navigate(item.path)}
            className="card-base card-hover p-6 text-left"
          >
            <item.icon className="w-6 h-6 text-accent-primary mb-3" />
            <p className="text-body font-semibold text-text-primary">{item.label}</p>
            <p className="text-body-sm text-text-muted mt-1">{item.desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
