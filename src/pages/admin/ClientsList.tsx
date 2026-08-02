import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { Card, PageHeader, StatusBadge, EmptyState } from '../../components/ui'

interface ClientRow {
  id: string
  email: string
  full_name: string | null
  business_name: string | null
  onboarding_completed: number
  status: string
  created_at: string
}

export default function ClientsList() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<{ clients: ClientRow[] }>('/admin/clients')
      .then((r) => setClients(r.clients))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <PageHeader eyebrow="Client accounts" title="Clients" subtitle="Everyone you have access to." />
      <Card className="overflow-x-auto !p-0">
        {loading ? (
          <div className="p-6 text-sm text-slate-400">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="p-6">
            <EmptyState label="No clients yet." />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Business</th>
                <th className="px-5 py-3 font-medium">Onboarding</th>
                <th className="px-5 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <Link to={c.id} className="font-medium text-white hover:text-gold">
                      {c.full_name || c.email}
                    </Link>
                    <p className="text-xs text-slate-500">{c.email}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-200">{c.business_name ?? '—'}</td>
                  <td className="px-5 py-3">
                    <StatusBadge tone={c.onboarding_completed ? 'green' : 'gold'}>
                      {c.onboarding_completed ? 'Complete' : 'Pending'}
                    </StatusBadge>
                  </td>
                  <td className="px-5 py-3 text-slate-400">{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
