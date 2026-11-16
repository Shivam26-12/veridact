// ============================================================
// DashboardPage — Role-specific overview dashboard (live API)
// ============================================================
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FolderOpen, Clock, CheckCircle, AlertTriangle, Activity,
  Plus, ArrowRight, TrendingUp, Users, FileText, Loader2
} from 'lucide-react'
import { caseService } from '@/services/caseService'
import { adminService } from '@/services/adminService'
import type { Case } from '@/types'
import type { AnalyticsSummary } from '@/types/api.types'
import type { UserRole } from '@/types/constants'

function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem('veridact_user') ?? '{}') } catch { return {} }
}

const StatCard = ({ label, value, icon: Icon, variant = 'default', trend }: {
  label: string; value: string | number; icon: React.ComponentType<{className?: string}>;
  variant?: 'default' | 'success' | 'warning' | 'danger'; trend?: string
}) => {
  const variantClasses = {
    default: 'text-text-primary',
    success: 'text-accent-primary',
    warning: 'text-status-pending',
    danger: 'text-verdict-fake',
  }
  const iconBg = {
    default: 'bg-slate-700/50',
    success: 'bg-accent-subtle',
    warning: 'bg-amber-400/10',
    danger: 'bg-red-400/10',
  }
  return (
    <div className="card-base card-hover p-6">
      <div className="flex items-start justify-between mb-4">
        <p className="text-body-sm font-medium text-text-muted">{label}</p>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconBg[variant]}`}>
          <Icon className={`w-4 h-4 ${variantClasses[variant]}`} />
        </div>
      </div>
      <p className={`text-h2 font-bold font-mono-data ${variantClasses[variant]}`}>{value}</p>
      {trend && <p className="text-caption text-text-muted mt-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" />{trend}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = getCurrentUser()
  const role: UserRole = user.role ?? 'investigator'
  const isAdminOrSupervisor = role === 'super_admin' || role === 'supervisor'

  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)
  const [recentCases, setRecentCases] = useState<Case[]>([])
  const [myCases, setMyCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        if (isAdminOrSupervisor) {
          // Load analytics summary + recent incidents from analytics endpoint
          const [analyticsData, casesData] = await Promise.all([
            adminService.getAnalytics(),
            caseService.getCases({ page: 1, size: 5 }),
          ])
          if (!cancelled) {
            setAnalytics(analyticsData)
            setRecentCases(casesData.items)
          }
        } else {
          // Investigator: load their assigned cases
          const casesData = await caseService.getCases({ page: 1, size: 5 })
          if (!cancelled) setMyCases(casesData.items)
        }
      } catch (e) {
        console.error('Dashboard load error:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [isAdminOrSupervisor])

  const displayCases = isAdminOrSupervisor ? recentCases : myCases

  const stats = isAdminOrSupervisor && analytics
    ? [
        { label: 'Total Incidents', value: analytics.total_incidents, icon: FolderOpen, variant: 'default' as const },
        { label: 'Open Incidents', value: analytics.open_cases, icon: Clock, variant: 'warning' as const },
        { label: 'Resolved', value: analytics.resolved_cases, icon: CheckCircle, variant: 'success' as const },
        { label: 'Critical', value: analytics.critical_count, icon: AlertTriangle, variant: 'danger' as const },
      ]
    : [
        { label: 'My Cases', value: myCases.length, icon: FolderOpen, variant: 'default' as const },
        { label: 'In Progress', value: myCases.filter(c => c.status === 'in_progress').length, icon: Activity, variant: 'warning' as const },
        { label: 'Resolved', value: myCases.filter(c => c.status === 'resolved').length, icon: CheckCircle, variant: 'success' as const },
        { label: 'High Severity', value: myCases.filter(c => c.severity === 'high' || c.severity === 'critical').length, icon: AlertTriangle, variant: 'danger' as const },
      ]

  const unassignedCount = isAdminOrSupervisor
    ? displayCases.filter(c => !c.assigned_to).length
    : 0

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-h2 font-bold text-text-primary">
            Welcome back, {user.name?.split(' ')[0] ?? 'Investigator'}
          </h1>
          <p className="text-body-sm text-text-muted mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          id="dashboard-new-case"
          onClick={() => navigate('/submit')}
          className="btn-secondary gap-2 hidden sm:flex"
        >
          <Plus className="w-4 h-4" />
          Report Incident
        </button>
      </div>

      {/* Stats grid */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="card-base p-6 animate-pulse">
              <div className="h-4 bg-slate-700 rounded w-2/3 mb-4" />
              <div className="h-8 bg-slate-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(stat => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
      )}

      {/* Alert: unassigned cases (supervisor/admin only) */}
      {!loading && unassignedCount > 0 && (
        <div className="card-base border-l-4 border-l-status-pending bg-amber-400/5 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-status-pending shrink-0" />
            <div>
              <p className="text-body-sm font-semibold text-text-primary">
                {unassignedCount} unassigned incident(s)
              </p>
              <p className="text-caption text-text-muted">Assign to investigators to begin processing.</p>
            </div>
          </div>
          <button onClick={() => navigate('/dashboard/cases')} className="btn-secondary text-caption gap-1 shrink-0">
            View Cases <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Recent cases */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h4 font-semibold text-text-primary">Recent Incidents</h2>
          <button onClick={() => navigate('/dashboard/cases')} className="text-body-sm text-accent-primary hover:text-accent-hover transition-colors flex items-center gap-1">
            View all <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="card-base overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-text-muted">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-body-sm">Loading incidents...</span>
            </div>
          ) : displayCases.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="w-8 h-8 text-text-disabled mx-auto mb-2" />
              <p className="text-body-sm text-text-muted">No incidents found</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="text-left px-4 py-3">Incident</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Type</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Severity</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">Updated</th>
                </tr>
              </thead>
              <tbody>
                {displayCases.map(c => (
                  <tr
                    key={c.id}
                    id={`dashboard-case-${c.id}`}
                    className="table-row"
                    onClick={() => navigate(`/dashboard/cases/${c.id}`)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono-data text-body-sm text-accent-primary">{c.case_number}</span>
                      <p className="text-caption text-text-muted truncate max-w-[200px]">{c.title}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-caption text-text-secondary capitalize">{(c.incident_type ?? '').replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`badge-base border text-caption ${
                        c.severity === 'critical' ? 'text-verdict-fake border-red-400/30 bg-red-400/10' :
                        c.severity === 'high' ? 'text-status-pending border-amber-400/30 bg-amber-400/10' :
                        'text-text-muted border-surface-border bg-surface-elevated'
                      }`}>{c.severity}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge-base border text-caption ${
                        c.status === 'open' ? 'text-status-pending border-amber-400/30 bg-amber-400/10' :
                        c.status === 'in_progress' ? 'text-status-review border-blue-400/30 bg-blue-400/10' :
                        c.status === 'under_review' ? 'text-status-complete border-emerald-400/30 bg-emerald-400/10' :
                        'text-text-muted border-surface-border'
                      }`}>{c.status.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-caption text-text-muted">{new Date(c.updated_at).toLocaleDateString()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Quick actions */}
      {role === 'super_admin' && (
        <div>
          <h2 className="text-h4 font-semibold text-text-primary mb-4">Admin Quick Access</h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Manage Users', path: '/admin/users', icon: Users },
              { label: 'Custody Log', path: '/admin/custody', icon: Clock },
              { label: 'All Reports', path: '/dashboard/reports', icon: FileText },
            ].map(item => (
              <button
                key={item.label}
                id={`dashboard-quick-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                onClick={() => navigate(item.path)}
                className="card-base card-hover p-5 flex flex-col items-center gap-3 text-center"
              >
                <div className="w-10 h-10 rounded-lg bg-accent-subtle border border-accent-primary/20 flex items-center justify-center">
                  <item.icon className="w-5 h-5 text-accent-primary" />
                </div>
                <span className="text-body-sm font-medium text-text-secondary">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
