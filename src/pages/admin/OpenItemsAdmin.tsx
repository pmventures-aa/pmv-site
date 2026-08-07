import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageIntro, Panel, EmptyState } from '../../components/admin/ui'
import { useAppPath } from '../../lib/basePath'

type ItemType = 'tickets' | 'matters' | 'tasks' | 'calls' | 'invoices'

const TYPE_CONFIG: Record<ItemType, { title: string; titleKey: string; extra: (row: any) => string }> = {
  tickets: { title: 'Open Tickets', titleKey: 'subject', extra: (r) => `Priority: ${r.priority}` },
  matters: { title: 'Open Matters', titleKey: 'title', extra: (r) => (r.type ? `Type: ${r.type}` : 'Status: ' + r.status.replace(/_/g, ' ')) },
  tasks: { title: 'Pending Tasks', titleKey: 'title', extra: (r) => 'Status: ' + r.status.replace(/_/g, ' ') },
  calls: { title: 'Calls Pending', titleKey: 'topic', extra: () => 'Requested' },
  invoices: { title: 'Open Invoices', titleKey: '', extra: (r) => `$${(r.amount_cents / 100).toLocaleString()}` },
}

export default function OpenItemsAdmin() {
  const p = useAppPath()
  // /admin/open-items/:type is the current URL shape; ?type= (the old shape)
  // is kept as a fallback so any existing bookmarks/links still resolve.
  const { type: pathType } = useParams<{ type: string }>()
  const [params] = useSearchParams()
  const type = (pathType as ItemType) || (params.get('type') as ItemType) || 'tickets'
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.tickets

  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let stale = false
    setLoading(true)
    api
      .get<{ items: any[] }>(`/admin/open-items?type=${encodeURIComponent(type)}`)
      .then((r) => {
        if (!stale) setItems(r.items)
      })
      .finally(() => {
        if (!stale) setLoading(false)
      })
    return () => {
      stale = true
    }
  }, [type])

  return (
    <div>
      <PageIntro kicker="Dashboard drill-down" title={cfg.title} subtitle="Everything accessible to you in this queue, most recent first." />
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <Panel>
          <EmptyState label="Nothing here right now." />
        </Panel>
      ) : (
        <Panel className="overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium">{cfg.titleKey ? 'Item' : 'Amount'}</th>
                <th className="px-5 py-3 font-medium">Detail</th>
                <th className="px-5 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <Link to={p(`clients/${r.client_user_id}`)} className="font-medium text-white hover:text-gold">
                      {r.client_name || r.client_email}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-slate-200">{cfg.titleKey ? r[cfg.titleKey] : `$${(r.amount_cents / 100).toLocaleString()}`}</td>
                  <td className="px-5 py-3 text-slate-400">{cfg.extra(r)}</td>
                  <td className="px-5 py-3 text-slate-400">{new Date(r.created_at.replace(' ', 'T') + 'Z').toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  )
}
