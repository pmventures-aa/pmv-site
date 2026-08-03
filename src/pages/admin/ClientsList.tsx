import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageIntro, Panel, Tag, EmptyState, inputCls } from '../../components/admin/ui'

interface ClientRow {
  id: string
  email: string
  full_name: string | null
  business_name: string | null
  onboarding_completed: number
  status: string
  created_at: string
}

const ONBOARDING_OPTIONS = [
  { value: 'all', label: 'All onboarding' },
  { value: 'complete', label: 'Complete' },
  { value: 'pending', label: 'Pending' },
]

export default function ClientsList() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [onboarding, setOnboarding] = useState('all')

  useEffect(() => {
    api
      .get<{ clients: ClientRow[] }>('/admin/clients')
      .then((r) => setClients(r.clients))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return clients.filter((c) => {
      if (onboarding === 'complete' && !c.onboarding_completed) return false
      if (onboarding === 'pending' && c.onboarding_completed) return false
      if (!needle) return true
      return (
        (c.full_name ?? '').toLowerCase().includes(needle) ||
        c.email.toLowerCase().includes(needle) ||
        (c.business_name ?? '').toLowerCase().includes(needle)
      )
    })
  }, [clients, q, onboarding])

  return (
    <div>
      <PageIntro kicker="Client accounts" title="Clients" subtitle="Everyone you have access to." />
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder="Search name, email, business…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className={`${inputCls} max-w-[180px]`} value={onboarding} onChange={(e) => setOnboarding(e.target.value)}>
          {ONBOARDING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <Panel className="overflow-x-auto !p-0">
        {loading ? (
          <div className="p-6 text-sm text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState label={clients.length === 0 ? 'No clients yet.' : 'No clients match your search.'} />
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
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <Link to={c.id} className="font-medium text-white hover:text-gold">
                      {c.full_name || c.email}
                    </Link>
                    <p className="text-xs text-slate-500">{c.email}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-200">{c.business_name ?? '—'}</td>
                  <td className="px-5 py-3">
                    <Tag tone={c.onboarding_completed ? 'green' : 'gold'}>
                      {c.onboarding_completed ? 'Complete' : 'Pending'}
                    </Tag>
                  </td>
                  <td className="px-5 py-3 text-slate-400">{new Date(c.created_at.replace(' ', 'T') + 'Z').toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
