import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAppPath } from '../../lib/basePath'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, Tag, EmptyState, inputCls, btnPrimary, StatCard, SkeletonTable } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { Dialog, DialogTrigger, DialogContent } from '../../components/kit/Dialog'
import { Avatar } from '../../components/kit/Avatar'
import { describeActivity, timeAgo, type ActivityEvent } from '../../lib/activity'
import { InlineLoading } from '../../components/LoadingScreen'
import { useAuth } from '../../lib/auth'
import { MILESTONE_STATUSES, RESPONSIBILITY_STATES, milestoneStatusLabel } from '../../../shared/matterWorkspace'

interface Bundle {
  account: { id: string; public_ref: string; email: string; full_name: string | null; phone: string | null; created_at: string; last_login_at: string | null }
  profile: { business_name: string | null; entity_type: string | null; ein: string | null; state: string | null; onboarding_completed: number } | null
  assigned_staff: { id: string; full_name: string | null; email: string }[]
  recent_activity: ActivityEvent[]
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
  onboarding_progress: { answered: number; total: number }
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
type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'datetime-local' | 'select'
interface FieldDef {
  key: string
  label: string
  type?: FieldType
  required?: boolean
  placeholder?: string
  options?: { value: string; label: string }[]
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
            ) : f.type === 'select' ? (
              <select className={inputCls} required={f.required} value={values[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}>
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
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
// (functions/_lib/routes/deletion.ts ARCHIVABLE map): only sections for
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
  assignEntity,
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
  assignEntity?: 'matter' | 'task' | 'ticket'
}) {
  const { user } = useAuth()
  const [adding, setAdding] = useState(false)
  const [expanded, setExpanded] = useState(false)

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

  async function assignSelf(id: string) {
    if (!assignEntity || !user) return
    try {
      await api.post(`/admin/work-assignments/${assignEntity}/${id}/assign-self`)
      toast.success('Assigned to you.')
      onCreated()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not assign this record.')
    }
  }

  return (
    <Panel className="!p-0">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <button type="button" onClick={() => setExpanded((value) => !value)} className="flex min-w-0 items-center gap-2 text-left">
          <span className="text-sm font-semibold text-white">{title}</span>
          <span className="rounded-full bg-white/[.06] px-2 py-0.5 text-[10px] tabular-nums text-slate-400">{rows.length}</span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{expanded ? 'Collapse' : 'Open'}</span>
        </button>
        {createConfig && (
          <button onClick={() => { setExpanded(true); setAdding((a) => !a) }} className="text-xs font-medium text-gold hover:underline">
            {adding ? 'Cancel' : '+ Add'}
          </button>
        )}
      </div>

      {expanded && adding && createConfig && (
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

      {expanded && (rows.length === 0 ? (
        <div className="p-5">
          <EmptyState label={emptyLabel} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                {columns.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-5 py-2 font-medium">
                    {c.label}
                  </th>
                ))}
                {statusKey && <th className="px-5 py-2 font-medium">Status</th>}
                {(archiveEntity || assignEntity) && <th className="px-5 py-2 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id ?? i} className="border-t border-white/5">
                  {columns.map((c) => (
                    <td key={c.key} className="whitespace-nowrap px-5 py-2.5 text-slate-200">
                      {c.render ? c.render(r) : String(r[c.key] ?? 'Not provided')}
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
                  {(archiveEntity || assignEntity) && (
                    <td className="whitespace-nowrap px-5 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        {assignEntity && r.assigned_staff_user_id !== user?.id && (
                          <button onClick={() => assignSelf(r.id)} className="text-xs font-medium text-gold hover:underline">Assign to me</button>
                        )}
                        {archiveEntity && (
                          <button onClick={() => archive(r.id)} className="text-xs font-medium text-slate-500 hover:text-rose-300">Archive</button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
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
  return (
    <Panel className="mb-5 !p-0">
      <h3 className="border-b border-white/10 px-5 py-3 text-sm font-semibold text-white">Service Applications</h3>
      {services.length === 0 ? (
        <div className="p-5">
          <EmptyState label="No services enrolled yet." />
        </div>
      ) : (
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
      )}
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
      <DialogContent title="Banking details" description={`${method.account_holder_name}: this view is logged for audit`}>
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
  return (
    <Panel className="mb-5 !p-0">
      <h3 className="border-b border-white/10 px-5 py-3 text-sm font-semibold text-white">Payment Methods (ACH)</h3>
      {methods.length === 0 ? (
        <div className="p-5">
          <EmptyState label="No payment methods on file." />
        </div>
      ) : (
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
      )}
    </Panel>
  )
}

// Shared list + add-note form: used both inline (profile notes) and inside
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
      <p className="mb-3 text-xs text-slate-500">Staff-only: never visible to the client. Anyone on the team can add to this thread.</p>
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
      <DialogContent title={`Notes: ${title}`} description="Staff-only, never visible to the client.">
        {loading ? <SkeletonTable rows={3} cols={1} /> : <NoteThread notes={notes} onAdd={addNote} busy={busy} onArchive={archiveNote} />}
      </DialogContent>
    </Dialog>
  )
}

function MatterClientViewDialog({ matterId, title, onSaved }: { matterId: string; title: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [milestones, setMilestones] = useState<{ id: string; name: string; status: string; derived?: boolean }[]>([])
  const [form, setForm] = useState({
    responsibility_state: 'pinnacle',
    next_action_label: '',
    next_action_type: 'other',
    next_action_due_at: '',
    blocked_reason_client_safe: '',
    completion_summary: '',
  })

  const load = useCallback(async () => {
    const res = await api.get<{
      matter: {
        responsibility_state: string | null
        next_action_label: string | null
        next_action_type: string | null
        next_action_due_at: string | null
        blocked_reason_client_safe: string | null
        completion_summary: string | null
      }
      milestones: { id: string; name: string; status: string; derived?: boolean }[]
    }>(`/portal/matters/${matterId}`)
    setForm({
      responsibility_state: res.matter.responsibility_state || 'pinnacle',
      next_action_label: res.matter.next_action_label || '',
      next_action_type: res.matter.next_action_type || 'other',
      next_action_due_at: (res.matter.next_action_due_at || '').slice(0, 10),
      blocked_reason_client_safe: res.matter.blocked_reason_client_safe || '',
      completion_summary: res.matter.completion_summary || '',
    })
    setMilestones(res.milestones || [])
  }, [matterId])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.patch(`/portal/matters/${matterId}`, form)
      toast.success('Client view saved.')
      onSaved()
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the client view.')
    } finally {
      setBusy(false)
    }
  }

  async function setMilestone(id: string, status: string) {
    if (id.startsWith('derived-')) {
      toast.error('Open this work once from the portal or recreate it so milestones are stored.')
      return
    }
    try {
      await api.patch(`/portal/matters/${matterId}/milestones/${id}`, { status })
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update that milestone.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) void load() }}>
      <DialogTrigger asChild>
        <button className="text-xs font-medium text-gold hover:underline">Client view</button>
      </DialogTrigger>
      <DialogContent title={`Client view: ${title}`} description="What the client sees: who is waiting, the next action, and milestones.">
        <form onSubmit={save} className="space-y-3">
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Waiting on</span>
            <select className={inputCls} value={form.responsibility_state} onChange={(e) => setForm((f) => ({ ...f, responsibility_state: e.target.value }))}>
              {RESPONSIBILITY_STATES.map((state) => <option key={state} value={state}>{state.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          {(form.responsibility_state === 'third_party') && (
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Client-safe explanation</span>
              <textarea className={`${inputCls} min-h-[70px]`} required value={form.blocked_reason_client_safe} onChange={(e) => setForm((f) => ({ ...f, blocked_reason_client_safe: e.target.value }))} placeholder="We are waiting on the county clerk to record the package." />
            </label>
          )}
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Next action</span>
            <input className={inputCls} value={form.next_action_label} onChange={(e) => setForm((f) => ({ ...f, next_action_label: e.target.value }))} placeholder="Upload the signed HOA packet" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Action type</span>
              <select className={inputCls} value={form.next_action_type} onChange={(e) => setForm((f) => ({ ...f, next_action_type: e.target.value }))}>
                {['upload', 'sign', 'pay', 'approve', 'schedule', 'message', 'acknowledge', 'other'].map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Due</span>
              <input className={inputCls} type="date" value={form.next_action_due_at} onChange={(e) => setForm((f) => ({ ...f, next_action_due_at: e.target.value }))} />
            </label>
          </div>
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Completion summary</span>
            <textarea className={`${inputCls} min-h-[70px]`} value={form.completion_summary} onChange={(e) => setForm((f) => ({ ...f, completion_summary: e.target.value }))} />
          </label>
          {milestones.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Milestones</p>
              <ul className="space-y-2">
                {milestones.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-200">{item.name}</span>
                    <select className="rounded-md border border-white/10 bg-navy-900 px-2 py-1 text-xs text-white" value={item.status} onChange={(e) => void setMilestone(item.id, e.target.value)}>
                      {MILESTONE_STATUSES.map((status) => <option key={status} value={status}>{milestoneStatusLabel(status)}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Saving…' : 'Save client view'}</button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface StaffMember {
  id: string
  full_name: string | null
  email: string
}

// ---------- Profile tab ----------

function ProfileEditForm({
  account,
  profile,
  clientId,
  onSaved,
}: {
  account: Bundle['account']
  profile: Bundle['profile']
  clientId: string
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    full_name: account.full_name ?? '',
    phone: account.phone ?? '',
    business_name: profile?.business_name ?? '',
    entity_type: profile?.entity_type ?? '',
    ein: profile?.ein ?? '',
    state: profile?.state ?? '',
  })
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.patch(`/admin/clients/${clientId}/profile`, form)
      toast.success('Profile saved.')
      onSaved()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save profile.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <label>
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Full name</span>
        <input className={inputCls} value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
      </label>
      <label>
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Phone</span>
        <input className={inputCls} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
      </label>
      <label>
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Business name</span>
        <input className={inputCls} value={form.business_name} onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))} />
      </label>
      <label>
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Entity type</span>
        <input className={inputCls} value={form.entity_type} onChange={(e) => setForm((f) => ({ ...f, entity_type: e.target.value }))} />
      </label>
      <label>
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">EIN</span>
        <input className={inputCls} value={form.ein} onChange={(e) => setForm((f) => ({ ...f, ein: e.target.value }))} />
      </label>
      <label>
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">State</span>
        <input className={inputCls} value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
      </label>
      <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

function AssignedStaffPanel({ staff }: { staff: Bundle['assigned_staff'] }) {
  const p = useAppPath()
  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Assigned Staff</h3>
        <Link to={p('assignments')} className="text-xs font-medium text-gold hover:underline">
          Manage assignments →
        </Link>
      </div>
      {staff.length === 0 ? (
        <EmptyState label="No staff assigned yet." />
      ) : (
        <ul className="space-y-2">
          {staff.map((s) => (
            <li key={s.id} className="text-sm text-slate-200">
              {s.full_name || s.email}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function ProfileTab({
  data,
  clientId,
  onChanged,
  onServiceStatusChange,
}: {
  data: Bundle
  clientId: string
  onChanged: () => void
  onServiceStatusChange: (csId: string, status: string) => void
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-5">
        <Panel>
          <h3 className="mb-4 text-sm font-semibold text-white">Contact &amp; Business Info</h3>
          <ProfileEditForm account={data.account} profile={data.profile} clientId={clientId} onSaved={onChanged} />
        </Panel>
        <ServiceApplications services={data.services} answers={data.application_answers} onStatusChange={onServiceStatusChange} />
        <ProfileNotes clientId={clientId} notes={data.notes} onChanged={onChanged} />
      </div>
      <div className="space-y-5">
        <Panel>
          <h3 className="mb-3 text-sm font-semibold text-white">Onboarding</h3>
          <Tag tone={data.profile?.onboarding_completed ? 'green' : 'gold'}>
            {data.profile?.onboarding_completed ? 'Complete' : 'Pending'}
          </Tag>
          {!data.profile?.onboarding_completed && data.onboarding_progress.total > 0 && (
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gold"
                  style={{ width: `${Math.round((data.onboarding_progress.answered / data.onboarding_progress.total) * 100)}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                {data.onboarding_progress.answered} of {data.onboarding_progress.total} required questions answered
              </p>
            </div>
          )}
        </Panel>
        <AssignedStaffPanel staff={data.assigned_staff} />
        <Panel>
          <h3 className="mb-3 text-sm font-semibold text-white">Account</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Client since</dt>
              <dd className="text-slate-200">{new Date(data.account.created_at).toLocaleDateString()}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Last login</dt>
              <dd className="text-slate-200">{data.account.last_login_at ? timeAgo(data.account.last_login_at) : 'never'}</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </div>
  )
}

// ---------- Dashboard tab ----------

function DashboardTab({
  data,
  clientId,
  onGoToRecords,
  onChanged,
}: {
  data: Bundle
  clientId: string
  onGoToRecords: () => void
  onChanged: () => void
}) {
  const openMatters = data.matters.filter((m) => m.status !== 'closed').length
  const openTasks = data.tasks.filter((t) => t.status !== 'done').length
  const openTickets = data.tickets.filter((t) => t.status !== 'closed').length
  const openInvoices = data.invoices.filter((i) => i.status === 'open')
  const balanceOwedCents = openInvoices.reduce((sum, i) => sum + (i.amount_cents ?? 0), 0)
  const upcoming = [...data.appointments]
    .filter((a) => new Date(a.starts_at).getTime() >= Date.now())
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
  const openFunding = data.funding.filter((f) => !['approved', 'declined'].includes(f.status)).length

  return (
    <div className="space-y-5">
      <button onClick={onGoToRecords} className="grid w-full grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 text-left">
        <StatCard label="Open Matters" value={openMatters} accent="sea" />
        <StatCard label="Open Tasks" value={openTasks} accent="sea" />
        <StatCard label="Open Tickets" value={openTickets} accent="coral" />
        <StatCard label="Upcoming Appts." value={upcoming.length} accent="gold" />
        <StatCard label="Open Funding" value={openFunding} accent="green" />
        <StatCard label="Balance Owed" value={`$${(balanceOwedCents / 100).toLocaleString()}`} accent="coral" />
      </button>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Upcoming Appointments</h3>
            <button onClick={onGoToRecords} className="text-xs font-medium text-gold hover:underline">
              View all →
            </button>
          </div>
          {upcoming.length === 0 ? (
            <EmptyState label="Nothing scheduled." />
          ) : (
            <ul className="space-y-2">
              {upcoming.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-200">{a.title}</span>
                  <span className="text-slate-500">{new Date(a.starts_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <h3 className="mb-3 text-sm font-semibold text-white">Recent Activity</h3>
          {data.recent_activity.length === 0 ? (
            <EmptyState label="No activity yet." />
          ) : (
            <ul className="space-y-3">
              {data.recent_activity.map((e) => (
                <li key={e.id} className="text-sm">
                  <p className="text-slate-200">{describeActivity(e)}</p>
                  <p className="text-xs text-slate-500">{timeAgo(e.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <PaymentMethods clientId={clientId} methods={data.payment_methods} onRevealed={onChanged} />
    </div>
  )
}

type ClientTab = 'dashboard' | 'profile' | 'records'
const TABS: { key: ClientTab; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'profile', label: 'Profile' },
  { key: 'records', label: 'Operations' },
]

export default function ClientDetail() {
  const p = useAppPath()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Bundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [tab, setTab] = useState<ClientTab>('dashboard')
  // Bumped whenever `id` changes so a slow response for a previously-viewed
  // client can't land after a newer one and overwrite the screen.
  const requestId = useRef(0)

  useEffect(() => {
    api.get<{ staff: StaffMember[] }>('/admin/staff-directory').then((r) => setStaff(r.staff)).catch(() => {})
  }, [])

  const staffOptions = [{ value: '', label: 'Unassigned' }, ...staff.map((s) => ({ value: s.id, label: s.full_name || s.email }))]
  const staffName = (staffId: string | null | undefined) => staff.find((s) => s.id === staffId)?.full_name || staff.find((s) => s.id === staffId)?.email || 'Not provided'

  const load = useCallback(async () => {
    if (!id) return
    const thisRequest = ++requestId.current
    try {
      const res = await api.get<Bundle>(`/admin/clients/${id}`)
      if (requestId.current === thisRequest) {
        setData(res)
        setLoadError('')
      }
    } catch (err) {
      if (requestId.current === thisRequest) {
        setData(null)
        setLoadError(err instanceof ApiError && err.status === 404 ? 'This client workspace was not found.' : 'This client workspace could not be loaded.')
      }
    } finally {
      if (requestId.current === thisRequest) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    setLoading(true)
    setTab('dashboard')
    load()
  }, [load])

  useEffect(() => {
    const publicRef = data?.account.public_ref
    if (publicRef && id && id !== publicRef) navigate(p(`clients/${publicRef}/manage`), { replace: true })
  }, [data?.account.public_ref, id, navigate, p])

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

  if (loading) return <InlineLoading />
  if (!data) return <Panel><EmptyState label={loadError || 'This client workspace was not found.'} /></Panel>

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
            uploadPath={`/admin/clients/${data.account.public_ref}/avatar`}
          />
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {data.services.map((s) => (
              <Tag key={s.service_key} tone="gold">
                {s.name}
              </Tag>
            ))}
            <Link to={`${p('messages')}?client=${clientId}`} className={btnPrimary}>
              ✉ Message
            </Link>
          </div>
        }
      />

      <div className="mb-5 flex gap-1 border-b border-white/10">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === t.key ? 'border-gold text-gold' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <DashboardTab data={data} clientId={clientId} onGoToRecords={() => setTab('records')} onChanged={load} />
      )}

      {tab === 'profile' && (
        <ProfileTab data={data} clientId={clientId} onChanged={load} onServiceStatusChange={setServiceStatus} />
      )}

      {tab === 'records' && (
      <div>
        <div className="mb-5 border-y border-white/10 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-gold/80">Operational workspace</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Open only the record set you need</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">Create, assign, update, or archive without loading eleven expanded tables at once. Each section keeps its count visible and opens in place.</p>
        </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Section
          title="Matters"
          statusOptionsKey="matters"
          rows={data.matters}
          columns={[
            { key: 'title', label: 'Title' },
            { key: 'type', label: 'Type' },
            { key: 'assigned_staff_user_id', label: 'Assigned to', render: (r) => staffName(r.assigned_staff_user_id) },
            { key: 'notes', label: '', render: (r) => (
              <span className="flex items-center gap-3">
                <MatterNotesDialog clientId={clientId} matterId={r.id} title={r.title} />
                <MatterClientViewDialog matterId={r.id} title={r.title} onSaved={load} />
              </span>
            ) },
          ]}
          statusKey="status"
          onStatusChange={async (itemId, status) => {
            if (status === 'blocked') {
              const reason = window.prompt('Client-safe explanation for the wait (required).')
              if (!reason?.trim()) {
                toast.error('A client-safe explanation is required when a matter is waiting on a third party.')
                return
              }
              try {
                await api.patch(`/portal/matters/${itemId}`, { status, blocked_reason_client_safe: reason.trim(), responsibility_state: 'third_party' })
                await load()
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : 'Could not update status. Try again.')
              }
              return
            }
            setStatus('matters', itemId, status)
          }}
          emptyLabel="No matters."
          clientId={clientId}
          onCreated={load}
          archiveEntity="matters"
          assignEntity="matter"
          createConfig={{
            postPath: 'matters',
            fields: [
              { key: 'title', label: 'Title', required: true },
              { key: 'type', label: 'Type', placeholder: 'tax_resolution, document_prep…' },
              { key: 'due_date', label: 'Due date', type: 'date' },
              { key: 'next_action_label', label: 'Client next action' },
              { key: 'assigned_staff_user_id', label: 'Assigned to', type: 'select', options: staffOptions },
            ],
          }}
        />
        <Section
          title="Tasks"
          statusOptionsKey="tasks"
          rows={data.tasks}
          columns={[
            { key: 'title', label: 'Title' },
            { key: 'assigned_staff_user_id', label: 'Assigned to', render: (r) => staffName(r.assigned_staff_user_id) },
          ]}
          statusKey="status"
          onStatusChange={(itemId, status) => setStatus('tasks', itemId, status)}
          emptyLabel="No tasks."
          clientId={clientId}
          onCreated={load}
          archiveEntity="tasks"
          assignEntity="task"
          createConfig={{
            postPath: 'tasks',
            fields: [
              { key: 'title', label: 'Title', required: true },
              { key: 'due_date', label: 'Due date', type: 'date' },
              { key: 'assigned_staff_user_id', label: 'Assigned to', type: 'select', options: staffOptions },
            ],
          }}
        />
        <Section
          title="Tickets"
          statusOptionsKey="tickets"
          rows={data.tickets}
          columns={[
            { key: 'subject', label: 'Subject' },
            { key: 'priority', label: 'Priority' },
            { key: 'assigned_staff_user_id', label: 'Assigned to', render: (r) => staffName(r.assigned_staff_user_id) },
          ]}
          statusKey="status"
          onStatusChange={(itemId, status) => setStatus('tickets', itemId, status)}
          emptyLabel="No support tickets."
          clientId={clientId}
          onCreated={load}
          archiveEntity="tickets"
          assignEntity="ticket"
          createConfig={{
            postPath: 'support',
            fields: [
              { key: 'subject', label: 'Subject', required: true },
              { key: 'category', label: 'Category' },
              { key: 'assigned_staff_user_id', label: 'Assigned to', type: 'select', options: staffOptions },
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
            { key: 'amount_requested_cents', label: 'Amount', render: (r) => (r.amount_requested_cents ? `$${(r.amount_requested_cents / 100).toLocaleString()}` : 'Not provided') },
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
              { key: 'name', label: 'Property name' },
              { key: 'address', label: 'Address', required: true },
              { key: 'city', label: 'City' },
              { key: 'state', label: 'State' },
              { key: 'postal_code', label: 'ZIP' },
              { key: 'property_type', label: 'Property type' },
              { key: 'occupancy', label: 'Occupancy' },
              { key: 'notes', label: 'Notes', type: 'textarea' },
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
      )}
    </div>
  )
}
