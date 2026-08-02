import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { PageHeader, StatCard } from '../../components/ui'

interface Stats {
  clients: number
  open_tickets: number
  open_matters: number
  pending_tasks: number
  pending_calls: number
  open_invoices: number
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    api.get<{ stats: Stats }>('/admin/dashboard').then((r) => setStats(r.stats)).catch(() => setStats(null))
  }, [])

  return (
    <div>
      <PageHeader
        eyebrow="Staff console"
        title={`Welcome, ${user?.first_name || user?.full_name || 'team'}`}
        subtitle={user?.role === 'admin' ? 'Full access across all clients.' : 'Showing clients assigned to you.'}
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Clients" value={stats?.clients ?? '—'} />
        <StatCard label="Open Tickets" value={stats?.open_tickets ?? '—'} />
        <StatCard label="Open Matters" value={stats?.open_matters ?? '—'} />
        <StatCard label="Pending Tasks" value={stats?.pending_tasks ?? '—'} />
        <StatCard label="Calls Pending" value={stats?.pending_calls ?? '—'} />
        <StatCard label="Open Invoices" value={stats?.open_invoices ?? '—'} />
      </div>
    </div>
  )
}
