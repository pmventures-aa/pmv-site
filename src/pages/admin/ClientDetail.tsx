import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { Card, PageHeader, StatusBadge, EmptyState } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'

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

// ---------- generic "+ Add" form, config-driven per module ----------
type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'datetime-local'
interface FieldDef {
  key: string
  label: string
  type?: FieldType
  required?: boolean
  placeholder?: string
}
interface CreateConfig {
  postPath: string
  fields: FieldDef[]
  // transforms the raw form values into the request body (e.g. dollars -> cents)
  toBody?: (values: Record<string, string>) => Record<string, unknown>
}

function CreateForm({
  config,
  clientId,
  onCreated,
  onCancel,
}: {
  config: CreateConfig
  clientId: string
  onCreated: () => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body = config.toBody ? config.toBody(values) : values
      await api.post(`/portal/${config.postPath}`, { ...body, client_user_id: clientId })
      onCreated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create item.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="border-t border-white/10 bg-white/[0.02] p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {config.fields.map((f) => (
          <label key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">{f.label}</span>
            {f.type === 'textarea' ? (
              <textarea
                className={inputCls}
                required={f.required}
                placeholder={f.placeholder}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            ) : (
              <input
                className={inputCls}
                type={f.type ?? 'text'}
                required={f.required}
                placeholder={f.placeholder}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            )}
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={busy} className="btn-gold disabled:opacity-60">
          {busy ? 'Creating…' : 'Create'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-slate-400 hover:text-white">
          Cancel
        </button>
        {error && <span className="text-sm text-rose-300">{error}</span>}
      </div>
    </form>
  )
}

function Section({
  title,
  rows,
  columns,
  statusKey,
  statusOptionsKey,
  onStatusChange,
  emptyLabel,
  createConfig,
  clientId,
  onCreated,
}: {
  title: string
  rows: any[]
  columns: { key: string; label: string; render?: (r: any) => React.ReactNode }[]
  statusKey?: string
  statusOptionsKey?: string
  onStatusChange?: (id: string, status: string) => void
  emptyLabel: string
  createConfig?: CreateConfig
  clientId: string
  onCreated: () => void
}) {
  const [adding, setAdding] = useState(false)

  return (
    <Card className="!p-0">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {createConfig && (
          <button onClick={() => setAdding((a) => !a)} className="text-xs font-medium text-gold hover:underline">
            {adding ? 'Cancel' : '+ Add'}
          </button>
        )}
      </div>

      {adding && createConfig && (
        <CreateForm
          config={createConfig}
          clientId={clientId}
          onCreated={() => {
            setAdding(false)
            onCreated()
          }}
          onCancel={() => setAdding(false)}
        />
      )}

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

  const clientId = data.account.id

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
          clientId={clientId}
          onCreated={load}
          createConfig={{
            postPath: 'matters',
            fields: [
              { key: 'title', label: 'Title', required: true },
              { key: 'type', label: 'Type', placeholder: 'tax_resolution, document_prep…' },
              { key: 'due_date', label: 'Due date', type: 'date' },
            ],
          }}
        />
        <Section
          title="Tasks"
          statusOptionsKey="tasks"
          rows={data.tasks}
          columns={[{ key: 'title', label: 'Title' }]}
          statusKey="status"
          onStatusChange={(itemId, status) => setStatus('tasks', itemId, status)}
          emptyLabel="No tasks."
          clientId={clientId}
          onCreated={load}
          createConfig={{
            postPath: 'tasks',
            fields: [
              { key: 'title', label: 'Title', required: true },
              { key: 'due_date', label: 'Due date', type: 'date' },
            ],
          }}
        />
        <Section
          title="Tickets"
          statusOptionsKey="tickets"
          rows={data.tickets}
          columns={[{ key: 'subject', label: 'Subject' }, { key: 'priority', label: 'Priority' }]}
          statusKey="status"
          onStatusChange={(itemId, status) => setStatus('tickets', itemId, status)}
          emptyLabel="No support tickets."
          clientId={clientId}
          onCreated={load}
          createConfig={{
            postPath: 'support',
            fields: [
              { key: 'subject', label: 'Subject', required: true },
              { key: 'category', label: 'Category' },
            ],
          }}
        />
        <Section
          title="Calls"
          statusOptionsKey="calls"
          rows={data.calls}
          columns={[{ key: 'topic', label: 'Topic' }]}
          statusKey="status"
          onStatusChange={(itemId, status) => setStatus('calls', itemId, status)}
          emptyLabel="No planned calls."
          clientId={clientId}
          onCreated={load}
          createConfig={{
            postPath: 'calls',
            fields: [{ key: 'topic', label: 'Topic', required: true }],
          }}
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
          clientId={clientId}
          onCreated={load}
          createConfig={{
            postPath: 'funding',
            fields: [
              { key: 'amount_requested_dollars', label: 'Amount requested ($)', type: 'number' },
              { key: 'use_of_funds', label: 'Use of funds', type: 'textarea' },
            ],
            toBody: (v) => ({
              amount_requested_cents: v.amount_requested_dollars ? Math.round(parseFloat(v.amount_requested_dollars) * 100) : undefined,
              use_of_funds: v.use_of_funds || undefined,
            }),
          }}
        />
        <Section
          title="Properties"
          statusOptionsKey="properties"
          rows={data.properties}
          columns={[{ key: 'address', label: 'Address' }]}
          statusKey="status"
          onStatusChange={(itemId, status) => setStatus('properties', itemId, status)}
          emptyLabel="No properties."
          clientId={clientId}
          onCreated={load}
          createConfig={{
            postPath: 'property',
            fields: [
              { key: 'address', label: 'Address', required: true },
              { key: 'property_type', label: 'Property type' },
            ],
          }}
        />
        <Section
          title="Tax filings"
          statusOptionsKey="tax_filings"
          rows={data.tax_filings}
          columns={[{ key: 'tax_year', label: 'Year' }, { key: 'filing_type', label: 'Type' }]}
          statusKey="status"
          onStatusChange={(itemId, status) => setStatus('tax_filings', itemId, status)}
          emptyLabel="No tax filings."
          clientId={clientId}
          onCreated={load}
          createConfig={{
            postPath: 'tax',
            fields: [
              { key: 'tax_year', label: 'Tax year', type: 'number', required: true, placeholder: '2025' },
              { key: 'filing_type', label: 'Filing type' },
              { key: 'due_date', label: 'Due date', type: 'date' },
            ],
            toBody: (v) => ({ tax_year: parseInt(v.tax_year, 10), filing_type: v.filing_type || undefined, due_date: v.due_date || undefined }),
          }}
        />
        <Section
          title="Invoices"
          statusOptionsKey="invoices"
          rows={data.invoices}
          columns={[{ key: 'amount_cents', label: 'Amount', render: (r) => `$${(r.amount_cents / 100).toLocaleString()}` }]}
          statusKey="status"
          onStatusChange={(itemId, status) => setStatus('invoices', itemId, status)}
          emptyLabel="No invoices."
          clientId={clientId}
          onCreated={load}
          createConfig={{
            postPath: 'billing',
            fields: [
              { key: 'amount_dollars', label: 'Amount ($)', type: 'number', required: true },
              { key: 'due_date', label: 'Due date', type: 'date' },
            ],
            toBody: (v) => ({ amount_cents: Math.round(parseFloat(v.amount_dollars || '0') * 100), due_date: v.due_date || undefined }),
          }}
        />
        <Section
          title="Documents"
          rows={data.documents}
          columns={[{ key: 'file_name', label: 'File' }, { key: 'review_status', label: 'Review' }]}
          emptyLabel="No documents."
          clientId={clientId}
          onCreated={load}
        />
        <Section
          title="Appointments"
          rows={data.appointments}
          columns={[{ key: 'title', label: 'Title' }, { key: 'starts_at', label: 'When', render: (r) => new Date(r.starts_at).toLocaleString() }]}
          emptyLabel="No appointments."
          clientId={clientId}
          onCreated={load}
          createConfig={{
            postPath: 'calendar',
            fields: [
              { key: 'title', label: 'Title', required: true },
              { key: 'starts_at', label: 'Starts at', type: 'datetime-local', required: true },
            ],
            toBody: (v) => ({ title: v.title, starts_at: v.starts_at ? new Date(v.starts_at).toISOString() : undefined }),
          }}
        />
      </div>
    </div>
  )
}
