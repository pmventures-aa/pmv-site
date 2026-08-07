import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, Tag, EmptyState, inputCls, btnPrimary } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { Dialog, DialogTrigger, DialogContent } from '../../components/kit/Dialog'
import { Avatar } from '../../components/kit/Avatar'
import { timeAgo } from '../../lib/activity'
import { InlineLoading } from '../../components/LoadingScreen'

interface Bundle {
  account: { id: string; email: string; full_name: string | null; phone: string | null; created_at: string; last_login_at: string | null }
  profile: { business_name: string | null; entity_type: string | null; state: string | null } | null
  services: { id: string; service_key: string; name: string; status: string }[]
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
  application_answers: { service_key: string; question_key: string; value: string; label: string | null; step_label: string | null }[]
  payment_methods: {
    id: string
    service_key: string | null
    method_type: string
    account_holder_name: string
    bank_name: string | null
    account_type: string | null
    account_last4: string
    created_at: string
  }[]
  notes: NoteRow[]
}

interface NoteRow {
  id: string
  client_user_id: string
  matter_id: string | null
  author_user_id: string
  author_name: string | null
  author_email: string
  body: string
  created_at: string
}

const SERVICE_STATUS_OPTIONS = ['requested', 'submitted', 'active', 'completed', 'declined']

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
      toast.success('Created.')
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
        <button type="submit" disabled={busy} className={btnPrimary}>
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

// Entity keys the backend's generic archive routes recognize
// (functions/_lib/routes/deletion.ts ARCHIVABLE map) — only sections for
// one of these get an Archive action.
type ArchiveEntity = 'matters' | 'tasks' | 'invoices' | 'documents' | 'tickets'

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
  archiveEntity,
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
  archiveEntity?: ArchiveEntity
}) {
  const [adding, setAdding] = useState(false)

  async function archive(id: string) {
    if (!archiveEntity) return
    try {
      await api.patch(`/admin/records/${archiveEntity}/${id}/archive`)
      toast.success('Archived.')
      onCreated()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not archive this record.')
    }
  }

  return (
    <Panel className="!p-0">
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
                {archiveEntity && <th className="px-5 py-2 font-medium"></th>}
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
                        className="rounded-md border border-white/10 bg-navy-900 px-2 py-1 text-xs text-white"
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
                  {archiveEntity && (
                    <td className="whitespace-nowrap px-5 py-2.5">
                      <button onClick={() => archive(r.id)} className="text-xs font-medium text-slate-500 hover:text-rose-300">
                        Archive
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

function ServiceApplications({
  services,
  answers,
  onStatusChange,
}: {
  services: Bundle['services']
  answers: Bundle['application_answers']
  onStatusChange: (csId: string, status: string) => void
}) {
  if (services.length === 0) return null
  return (
    <Panel className="mb-5 !p-0">
      <h3 className="border-b border-white/10 px-5 py-3 text-sm font-semibold text-white">Service Applications</h3>
      <div className="divide-y divide-white/5">
        {services.map((s) => {
          const svcAnswers = answers.filter((a) => a.service_key === s.service_key)
          const bySteps = new Map<string, typeof svcAnswers>()
          for (const a of svcAnswers) {
            const step = a.step_label ?? 'Details'
            if (!bySteps.has(step)) bySteps.set(step, [])
            bySteps.get(step)!.push(a)
          }
          return (
            <div key={s.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">{s.name}</p>
                <select
                  className="rounded-md border border-white/10 bg-navy-900 px-2 py-1 text-xs text-white"
                  value={s.status}
                  onChange={(e) => onStatusChange(s.id, e.target.value)}
                >
                  {SERVICE_STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              {svcAnswers.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No application details submitted yet.</p>
              ) : (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {Array.from(bySteps.entries()).map(([step, items]) => (
                    <div key={step}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gold/80">{step}</p>
                      <dl className="mt-2 space-y-1.5">
                        {items.map((a) => (
                          <div key={a.question_key} className="text-xs">
                            <dt className="text-slate-500">{a.label ?? a.question_key}</dt>
                            <dd className="text-slate-200">{a.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function RevealPaymentMethodDialog({
  clientId,
  method,
  onRevealed,
}: {
  clientId: string
  method: Bundle['payment_methods'][number]
  onRevealed: () => void
}) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ routing_number: string; account_number: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next && !data) {
      setBusy(true)
      try {
        const res = await api.post<{ routing_number: string; account_number: string }>(
          `/admin/clients/${clientId}/payment-methods/${method.id}/reveal`,
        )
        setData(res)
        onRevealed()
      } catch {
        toast.error('Could not reveal payment details.')
        setOpen(false)
      } finally {
        setBusy(false)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button className="text-xs font-medium text-gold hover:underline">Reveal (admin only)</button>
      </DialogTrigger>
      <DialogContent title="Banking details" description={`${method.account_holder_name} — this view is logged for audit`}>
        {busy ? (
          <p className="text-sm text-slate-400">Decrypting…</p>
        ) : data ? (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Routing number</dt>
              <dd className="mt-0.5 font-mono text-base text-white">{data.routing_number}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Account number</dt>
              <dd className="mt-0.5 font-mono text-base text-white">{data.account_number}</dd>
            </div>
          </dl>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function PaymentMethods({ clientId, methods, onRevealed }: { clientId: string; methods: Bundle['payment_methods']; onRevealed: () => void }) {
  if (methods.length === 0) return null
  return (
    <Panel className="mb-5 !p-0">
      <h3 className="border-b border-white/10 px-5 py-3 text-sm font-semibold text-white">Payment Methods (ACH)</h3>
      <div className="divide-y divide-white/5">
        {methods.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
            <div>
              <p className="text-white">{m.account_holder_name}</p>
              <p className="text-xs text-slate-400">
                {m.bank_name ?? 'Bank on file'} · {m.account_type ?? 'account'} ending {m.account_last4}
                {m.service_key ? ` · ${m.service_key.replace(/_/g, ' ')}` : ''}
              </p>
            </div>
            <RevealPaymentMethodDialog clientId={clientId} method={m} onRevealed={onRevealed} />
          </div>
        ))}
      </div>
    </Panel>
  )
}

// Shared list + add-note form — used both inline (profile notes) and inside
// a Dialog (matter notes). Staff-only, never exposed to the client API.
function NoteThread({
  notes,
  onAdd,
  busy,
  onArchive,
}: {
  notes: NoteRow[]
  onAdd: (body: string) => Promise<void>
  busy: boolean
  onArchive?: (id: string) => void
}) {
  const [draft, setDraft] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    await onAdd(draft.trim())
    setDraft('')
  }

  return (
    <div>
      {notes.length === 0 ? (
        <p className="text-sm text-slate-500">No notes yet.</p>
      ) : (
        <ul className="mb-4 max-h-72 space-y-3 overflow-y-auto">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border border-white/10 bg-navy-950 p-3">
              <p className="whitespace-pre-wrap text-sm text-slate-200">{n.body}</p>
              <p className="mt-1.5 flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>
                  {n.author_name || n.author_email} · {timeAgo(n.created_at)}
                </span>
                {onArchive && (
                  <button onClick={() => onArchive(n.id)} className="font-medium text-slate-500 hover:text-rose-300">
                    Archive
                  </button>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <textarea
          className={`${inputCls} min-h-[2.5rem]`}
          rows={2}
          placeholder="Add a note for the team…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={busy || !draft.trim()} className={`${btnPrimary} self-end`}>
          {busy ? '…' : 'Post'}
        </button>
      </form>
    </div>
  )
}

function ProfileNotes({ clientId, notes, onChanged }: { clientId: string; notes: NoteRow[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)

  async function addNote(body: string) {
    setBusy(true)
    try {
      await api.post(`/admin/clients/${clientId}/notes`, { body })
      onChanged()
    } catch {
      toast.error('Could not post note.')
    } finally {
      setBusy(false)
    }
  }

  async function archiveNote(id: string) {
    try {
      await api.patch(`/admin/records/notes/${id}/archive`)
      toast.success('Note archived.')
      onChanged()
    } catch {
      toast.error('Could not archive this note.')
    }
  }

  return (
    <Panel className="mb-5">
      <h3 className="mb-3 text-sm font-semibold text-white">Internal Notes</h3>
      <p className="mb-3 text-xs text-slate-500">Staff-only — never visible to the client. Anyone on the team can add to this thread.</p>
      <NoteThread notes={notes} onAdd={addNote} busy={busy} onArchive={archiveNote} />
    </Panel>
  )
}

function MatterNotesDialog({ clientId, matterId, title }: { clientId: string; matterId: string; title: string }) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ notes: NoteRow[] }>(`/admin/matters/${matterId}/notes`)
      setNotes(res.notes)
    } finally {
      setLoading(false)
    }
  }, [matterId])

  async function addNote(body: string) {
    setBusy(true)
    try {
      await api.post(`/admin/clients/${clientId}/notes`, { body, matter_id: matterId })
      await load()
    } catch {
      toast.error('Could not post note.')
    } finally {
      setBusy(false)
    }
  }

  async function archiveNote(id: string) {
    try {
      await api.patch(`/admin/records/notes/${id}/archive`)
      toast.success('Note archived.')
      await load()
    } catch {
      toast.error('Could not archive this note.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) load() }}>
      <DialogTrigger asChild>
        <button className="text-xs font-medium text-gold hover:underline">Notes</button>
      </DialogTrigger>
      <DialogContent title={`Notes — ${title}`} description="Staff-only, never visible to the client.">
        {loading ? <p className="text-sm text-slate-400">Loading…</p> : <NoteThread notes={notes} onAdd={addNote} busy={busy} onArchive={archiveNote} />}
      </DialogContent>
    </Dialog>
  )
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Bundle | null>(null)
  const [loading, setLoading] = useState(true)
  // Bumped whenever `id` changes so a slow response for a previously-viewed
  // client can't land after a newer one and overwrite the screen.
  const requestId = useRef(0)

  const load = useCallback(async () => {
    if (!id) return
    const thisRequest = ++requestId.current
    try {
      const res = await api.get<Bundle>(`/admin/clients/${id}`)
      if (requestId.current === thisRequest) setData(res)
    } finally {
      if (requestId.current === thisRequest) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  async function setStatus(module: string, itemId: string, status: string) {
    try {
      await api.patch(`/portal/${patchPath[module]}/${itemId}`, { status })
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update status. Try again.')
    }
  }

  async function setServiceStatus(csId: string, status: string) {
    try {
      await api.patch(`/portal/services/${csId}`, { status })
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update status. Try again.')
    }
  }

  if (loading || !data) {
    return <InlineLoading />
  }

  const clientId = data.account.id

  return (
    <div>
      <Link to=".." relative="path" className="mb-4 inline-block text-sm text-slate-400 hover:text-gold">
        ← Back to clients
      </Link>
      <PageIntro
        kicker={data.profile?.business_name ?? 'Client'}
        title={data.account.full_name || data.account.email}
        subtitle={`${data.account.email}${data.account.phone ? ` · ${data.account.phone}` : ''}`}
        leading={
          <Avatar
            userId={clientId}
            name={data.account.full_name}
            size={56}
            editable
            uploadPath={`/admin/clients/${clientId}/avatar`}
          />
        }
        action={
          <div className="flex flex-wrap gap-2">
            {data.services.map((s) => (
              <Tag key={s.service_key} tone="gold">
                {s.name}
              </Tag>
            ))}
          </div>
        }
      />

      <ServiceApplications services={data.services} answers={data.application_answers} onStatusChange={setServiceStatus} />
      <PaymentMethods clientId={clientId} methods={data.payment_methods} onRevealed={load} />
      <ProfileNotes clientId={clientId} notes={data.notes} onChanged={load} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="Matters"
          statusOptionsKey="matters"
          rows={data.matters}
          columns={[
            { key: 'title', label: 'Title' },
            { key: 'type', label: 'Type' },
            { key: 'notes', label: '', render: (r) => <MatterNotesDialog clientId={clientId} matterId={r.id} title={r.title} /> },
          ]}
          statusKey="status"
          onStatusChange={(itemId, status) => setStatus('matters', itemId, status)}
          emptyLabel="No matters."
          clientId={clientId}
          onCreated={load}
          archiveEntity="matters"
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
          archiveEntity="tasks"
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
          archiveEntity="tickets"
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
          archiveEntity="invoices"
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
          archiveEntity="documents"
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
