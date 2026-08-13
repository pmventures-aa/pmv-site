import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageIntro, Panel, EmptyState } from '../../components/admin/ui'
import { useAppPath } from '../../lib/basePath'
import { clientEmailHref } from '../../lib/engagements'
import { useLiveRefresh } from '../../lib/liveRefresh'
import { RecentListShell, RecentWindowBar, useRecentWindow } from '../../components/admin/RecentWindow'

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
  const { type: pathType } = useParams<{ type: string }>()
  const [params] = useSearchParams()
  const type = (pathType as ItemType) || (params.get('type') as ItemType) || 'tickets'
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.tickets
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const r = await api.get<{ items: any[] }>(`/admin/open-items?type=${encodeURIComponent(type)}`)
      setItems(r.items)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [type])

  useEffect(() => { void load() }, [load])
  const backgroundLoad = useCallback(() => load(true), [load])
  useLiveRefresh(backgroundLoad)

  return (
    <div>
      <PageIntro kicker="Dashboard drill-down" title={cfg.title} subtitle="Most recent first. Open a row for the client record." />
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <Panel><EmptyState label="Nothing here right now." /></Panel>
      ) : (
        <OpenItemsTable items={items} cfg={cfg} p={p} itemType={type} />
      )}
    </div>
  )
}

function OpenItemsTable({ items, cfg, p, itemType }: { items: any[]; cfg: (typeof TYPE_CONFIG)[ItemType]; p: (path: string) => string; itemType: ItemType }) {
  const windowed = useRecentWindow(items)
  return (
    <RecentListShell footer={<RecentWindowBar extra={windowed.extra} expanded={windowed.expanded} onToggle={() => windowed.setExpanded((v) => !v)} showing={windowed.showing} total={windowed.total} noun="items" />}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-5 py-3 font-medium">Client</th><th className="px-5 py-3 font-medium">{cfg.titleKey ? 'Item' : 'Amount'}</th><th className="px-5 py-3 font-medium">Detail</th><th className="px-5 py-3 font-medium">Created</th><th className="px-5 py-3 font-medium">Engage</th></tr></thead>
          <tbody>{windowed.visible.map((r) => <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]"><td className="px-5 py-3"><Link to={p(`clients/${r.client_user_id}`)} className="font-medium text-white hover:text-gold">{r.client_name || r.client_email}</Link></td><td className="px-5 py-3 text-slate-200">{cfg.titleKey ? r[cfg.titleKey] : `$${(r.amount_cents / 100).toLocaleString()}`}</td><td className="px-5 py-3 text-slate-400">{cfg.extra(r)}</td><td className="px-5 py-3 text-slate-400">{new Date(r.created_at.replace(' ', 'T') + 'Z').toLocaleDateString()}</td><td className="px-5 py-3"><div className="flex flex-wrap gap-3">{itemType === 'invoices' && <Link to={`${p('invoices')}?invoice=${encodeURIComponent(r.id)}`} className="text-xs font-semibold text-gold hover:underline">Open invoice</Link>}<Link to={clientEmailHref(p, { id: r.client_user_id, email: r.client_email, name: r.client_name })} className="text-xs font-semibold text-gold hover:underline">Email</Link></div></td></tr>)}</tbody>
        </table>
      </div>
    </RecentListShell>
  )
}
