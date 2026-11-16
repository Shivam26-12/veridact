// ============================================================
// AnalyticsPage — Incident analytics & metrics (live API)
// ============================================================
import { useState, useEffect } from 'react'
import { BarChart3, TrendingUp, AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import { adminService } from '@/services/adminService'
import type { AnalyticsSummary } from '@/types/api.types'

const SEVERITY_COLORS: Record<string, string> = {
  Critical: '#F87171',
  High: '#FB923C',
  Medium: '#60A5FA',
  Low: '#34D399',
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-surface-card border border-surface-border rounded-lg p-3 shadow-card">
        <p className="text-body-sm font-medium text-text-primary capitalize">{label}</p>
        {payload.map((entry: any) => (
          <p key={entry.name} className="text-caption text-text-muted">
            {entry.name}: <span className="text-accent-primary font-mono-data">{entry.value}</span>
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    adminService.getAnalytics()
      .then(res => {
        if (!cancelled) setData(res)
      })
      .catch(err => console.error('Failed to load analytics:', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-text-muted">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        <p className="text-body-sm">Compiling SOC incident metrics...</p>
      </div>
    )
  }

  const total = data?.total_incidents ?? 0
  const resolved = data?.resolved_cases ?? 0
  const openCount = data?.open_cases ?? 0
  const critical = data?.critical_count ?? 0
  const avgHours = data?.avg_resolution_hours ?? 0

  const resolutionRate = total > 0 ? `${Math.round((resolved / total) * 100)}%` : '0%'

  // Severity chart data
  const severityBreakdown = [
    { name: 'Critical', value: data?.incidents_by_severity?.critical ?? 0, color: SEVERITY_COLORS.Critical },
    { name: 'High', value: data?.incidents_by_severity?.high ?? 0, color: SEVERITY_COLORS.High },
    { name: 'Medium', value: data?.incidents_by_severity?.medium ?? 0, color: SEVERITY_COLORS.Medium },
    { name: 'Low', value: data?.incidents_by_severity?.low ?? 0, color: SEVERITY_COLORS.Low },
  ].filter(s => s.value > 0)

  // Incident type distribution data
  const typeEntries = Object.entries(data?.incidents_by_type ?? {})
    .filter(([_, count]) => count > 0)
    .map(([kind, count]) => ({
      name: kind.replace(/_/g, ' '),
      count,
    }))

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-h2 font-bold text-text-primary">Incident Analytics</h1>
        <p className="text-body-sm text-text-muted mt-1">SOC-wide cybersecurity incident intelligence overview</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Incidents', value: total, icon: BarChart3, trend: `${openCount} active triage` },
          { label: 'Resolution Rate', value: resolutionRate, icon: ShieldCheck, trend: `${resolved} resolved` },
          { label: 'Avg Resolution Time', value: `${avgHours} hrs`, icon: TrendingUp, trend: 'Closed incidents' },
          { label: 'Critical Incidents', value: critical, icon: AlertTriangle, trend: 'Immediate SLA required' },
        ].map(stat => (
          <div key={stat.label} className="card-base p-5">
            <div className="flex items-start justify-between mb-3">
              <p className="text-caption text-text-muted">{stat.label}</p>
              <stat.icon className="w-4 h-4 text-accent-primary" />
            </div>
            <p className="text-h2 font-bold font-mono-data text-accent-primary">{stat.value}</p>
            <p className="text-caption text-text-muted mt-1">{stat.trend}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Incident Type breakdown */}
        <div className="card-base p-6">
          <h2 className="text-h4 font-semibold text-text-primary mb-4">Incidents by Threat Vector</h2>
          {typeEntries.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-text-muted text-body-sm">
              No incident data yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={typeEntries} barSize={26}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Incidents" fill="#34D399" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Severity distribution */}
        <div className="card-base p-6">
          <h2 className="text-h4 font-semibold text-text-primary mb-4">Incident Severity Breakdown</h2>
          {severityBreakdown.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-text-muted text-body-sm">
              No incidents to display.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={severityBreakdown}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                >
                  {severityBreakdown.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span style={{ color: '#94A3B8', fontSize: 12 }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
