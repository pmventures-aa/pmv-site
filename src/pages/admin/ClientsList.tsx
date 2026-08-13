import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageIntro, Panel, Tag, EmptyState, inputCls, btnOutline } from '../../components/admin/ui'
import { Avatar } from '../../components/kit/Avatar'
import { useAppPath } from '../../lib/basePath'
import { clientEmailHref, clientInboxHref } from '../../lib/engagements'
import { useLiveRefresh } from '../../lib/liveRefresh'
import { RecentListShell, RecentWindowBar, useRecentWindow } from '../../components/admin/RecentWindow'

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
  const p = useAppPath()
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [onboarding, setOnboarding] = useState('all')

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ clients: ClientRow[] }>('/admin/clients')
      setClients(r.clients)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useLiveRefresh(load)

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

  const windowed = useRecentWindow(filtered)

  return (
    <div>
      <PageIntro kicker="Client accounts" title="Clients" subtitle={loading ? 'Everyone you have access to.' : `${filtered.length} of ${clients.length} client${clients.length === 1 ? '' : 's'}, most recent first.`} action={<Link to={p('service-assignments')} className={btnOutline}>Assign a service</Link>} />
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
      {loading ? (
        <Panel className="overflow-x-auto !p-0"><div className="p-6 text-sm text-slate-400">Loading…</div></Panel>
      ) : filtered.length === 0 ? (
        <Panel className="overflow-x-auto !p-0"><div className="p-6"><EmptyState label={clients.length === 0 ? 'No clients yet.' : 'No clients match your search.'} /></div></Panel>
      ) : (
        <RecentListShell footer={<RecentWindowBar extra={windowed.extra} expanded={windowed.expanded} onToggle={() => windowed.setExpanded((v) => !v)} showing={windowed.showing} total={windowed.total} noun="clients" />}>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Business</th>
                <th className="px-5 py-3 font-medium">Onboarding</th>
                <th className="px-5 py-3 font-medium">Joined</th>
                <th className="px-5 py-3 font-medium">Engage</th>
              </tr>
            </thead>
            <tbody>
              {windowed.visible.map((c) => (
                <tr key={c.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar userId={c.id} name={c.full_name || c.email} size={36} />
                      <div>
                        <Link to={p(`clients/${c.id}/overview`)} className="font-medium text-white hover:text-gold">
                          {c.full_name || c.email}
                        </Link>
                        <p className="text-xs text-slate-500">{c.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-200">{c.business_name ?? 'Not provided'}</td>
                  <td className="px-5 py-3">
                    <Tag tone={c.onboarding_completed ? 'green' : 'gold'}>
                      {c.onboarding_completed ? 'Complete' : 'Pending'}
                    </Tag>
                  </td>
                  <td className="px-5 py-3 text-slate-400">{new Date(c.created_at.replace(' ', 'T') + 'Z').toLocaleDateString()}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link to={clientEmailHref(p, { id: c.id, email: c.email, name: c.full_name })} className="text-xs font-semibold text-gold hover:underline">Email</Link>
                      <Link to={clientInboxHref(p, c.id)} className="text-xs font-semibold text-slate-400 hover:text-gold hover:underline">Message</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </RecentListShell>
      )}
    </div>
  )
}
