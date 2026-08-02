import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { Card, PageHeader, StatusBadge, EmptyState } from '../../components/ui'

interface Bundle {
  account: { id: string; email: string; full_name: string | null; phone: string | null; created_at: string; last_login_at: string | null }
  profile: { business_name: string | null; entity_type: string | null; state: string | null } | null
  services: { service_key: string; name: string; status: string }[]
  matters: any[]
  tasks: any[]
  documents: any[]
  invoices: any[]
  funding: any[]
  properties: any[]
  tax_filings: any[]
  tickets: any[]
  calls: any[]
  appointments: any[]
}

const statusOptions: Record<string, string[]> = {
  matters: ['open', 'in_progress', 'blocked', 'closed'],
  tasks: ['pending', 'in_progress', 'done'],
  funding: ['draft', 'submitted', 'under_review', 'approved', 'declined'],
  properties: ['active', 'under_contract', 'sold', 'inactive'],
  tax_filings: ['not_started', 'in_progress', 'filed', 'extended'],
  tickets: ['open', 'in_progress', 'closed'],
  calls: ['requested', 'scheduled', 'completed', 'cancelled'],
  invoices: ['open', 'paid', 'void'],
}

const patchPath: Record<string, string> = {
  matters: 'matters',
  tasks: 'tasks',
  funding: 'funding',
  properties: 'property',
  tax_filings: 'tax',
  tickets: 'support',
  calls: 'calls',
  invoices: 'billing',
}

function Section({
  title,
  rows,
  columns,
  statusKey,
  statusOptionsKey,
  onStatusChange,
  emptyLabel,
}: {
  title: string
  rows: any[]
  columns: { key: string; label: string; render?: (r: any) => React.ReactNode }[]
  statusKey?: string
  statusOptionsKey?: string
  onStatusChange?: (id: string, status: string) => void
  emptyLabel: string
}) {
  return (
    <Card className="!p-0">
      <h3 className="border-b border-white/10 px-5 py-3 text-sm font-semibold text-white">{title}</h3>
      {rows.length === 0 ? (
        <div className="p-5">
          <EmptyState label={emptyLabel} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                {columns.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-5 py-2 font-medium">
                    {c.label}
                  </th>
                ))}
                {statusKey && <th className="px-5 py-2 font-medium">Status</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id ?? i} className="border-t border-white/5">
                  {columns.map((c) => (
                    <td key={c.key} className="whitespace-nowrap px-5 py-2.5 text-slate-200">
                      {c.render ? c.render(r) : String(r[c.key] ?? '—')}
                    </td>
                  ))}
                  {statusKey && onStatusChange && (
                    <td className="px-5 py-2.5">
                      <select
                        className="rounded-lg border border-white/10 bg-navy-900 px-2 py-1 text-xs text-white"
                        value={r[statusKey]}
                        onChange={(e) => onStatusChange(r.id, e.target.value)}
                      >
                        {(statusOptions[statusOptionsKey ?? ''] ?? []).map((s) => (
                          <option key={s} value={s}>
                            {s.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Bundle | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await api.get<Bundle>(`/admin/clients/${id}`)
      setData(res)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function setStatus(module: string, itemId: string, status: string) {
    await api.patch(`/portal/${patchPath[module]}/${itemId}`, { status })
    await load()
  }

  if (loading || !data) {
    return <p className="text-sm text-slate-400">Loading…</p>
  }

  return (
    <div>
      <Link to=".." relative="path" className="mb-4 inline-block text-sm text-slate-400 hover:text-gold">
        ← Back to clients
      </Link>
      <PageHeader
        eyebrow={data.profile?.business_name ?? 'Client'}
        title={data.account.full_name || data.account.email}
        subtitle={`${data.account.email}${data.account.phone ? ` · ${data.account.phone}` : ''}`}
        action={
          <div className="flex flex-wrap gap-2">
            {data.services.map((s) => (
              <StatusBadge key={s.service_key} tone="gold">
                {s.name}
              </StatusBadge>
            ))}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="Matters"
          statusOptionsKey="matters"
          rows={data.matters}
          columns={[{ key: 'title', label: 'Title' }, { key: 'type', label: 'Type' }]}
          statusKey="status"
          onStatusChange={(itemId, status) => setStatus('matters', itemId, status)}
          emptyLabel="No matters."
        />
        <Section
          title="Tasks"
          statusOptionsKey="tasks"
          rows={data.tasks}
          columns={[{ key: 'title', label: 'Title' }]}
          statusKey="status"
          onStatusChange={(itemId, status) => setStatus('tasks', itemId, status)}
          emptyLabel="No tasks."
        />
        <Section
          title="Tickets"
          statusOptionsKey="tickets"
          rows={data.tickets}
          columns={[{ key: 'subject', label: 'Subject' }, { key: 'priority', label: 'Priority' }]}
          statusKey="status"
          onStatusChange={(itemId, status) => setStatus('tickets', itemId, status)}
          emptyLabel="No support tickets."
        />
        <Section
          title="Calls"
          statusOptionsKey="calls"
          rows={data.calls}
          columns={[{ key: 'topic', label: 'Topic' }]}
          statusKey="status"
          onStatusChange={(itemId, status) => setStatus('calls', itemId, status)}
          emptyLabel="No planned calls."
        />
        <Section
          title="Funding"
          statusOptionsKey="funding"
          rows={data.funding}
          columns={[
            { key: 'amount_requested_cents', label: 'Amount', render: (r) => (r.amount_requested_cents ? `$${(r.amount_requested_cents / 100).toLocaleString()}` : '—') },
          ]}
          statusKey="status"
          onStatusChange={(itemId, status) => setStatus('funding', itemId, status)}
          emptyLabel="No funding applications."
        />
        <Section
          title="Properties"
          statusOptionsKey="properties"
          rows={data.properties}
          columns={[{ key: 'address', label: 'Address' }]}
          statusKey="status"
          onStatusChange={(itemId, status) => setStatus('properties', itemId, status)}
          emptyLabel="No properties."
        />
        <Section
          title="Tax filings"
          statusOptionsKey="tax_filings"
          rows={data.tax_filings}
          columns={[{ key: 'tax_year', label: 'Year' }, { key: 'filing_type', label: 'Type' }]}
          statusKey="status"
          onStatusChange={(itemId, status) => setStatus('tax_filings', itemId, status)}
          emptyLabel="No tax filings."
        />
        <Section
          title="Invoices"
          statusOptionsKey="invoices"
          rows={data.invoices}
          columns={[{ key: 'amount_cents', label: 'Amount', render: (r) => `$${(r.amount_cents / 100).toLocaleString()}` }]}
          statusKey="status"
          onStatusChange={(itemId, status) => setStatus('invoices', itemId, status)}
          emptyLabel="No invoices."
        />
        <Section
          title="Documents"
          rows={data.documents}
          columns={[{ key: 'file_name', label: 'File' }, { key: 'review_status', label: 'Review' }]}
          emptyLabel="No documents."
        />
        <Section
          title="Appointments"
          rows={data.appointments}
          columns={[{ key: 'title', label: 'Title' }, { key: 'starts_at', label: 'When', render: (r) => new Date(r.starts_at).toLocaleString() }]}
          emptyLabel="No appointments."
        />
      </div>
    </div>
  )
}
