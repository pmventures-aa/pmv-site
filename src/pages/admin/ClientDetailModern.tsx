import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { Avatar } from '../../components/kit/Avatar'
import { Tag, EmptyState, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { InlineLoading } from '../../components/LoadingScreen'
import { describeActivity, timeAgo, type ActivityEvent } from '../../lib/activity'
import { campaignAudienceHref, clientEmailHref, clientInboxHref } from '../../lib/engagements'
import ClientRelationships from './ClientRelationships'
import { humanizeLabel } from '../../../shared/displayCase'

interface NoteRow {
  id: string
  author_name: string | null
  author_email: string
  body: string
  created_at: string
}

interface Bundle {
  account: { id: string; email: string; full_name: string | null; phone: string | null; created_at: string; last_login_at: string | null }
  profile: { business_name: string | null; entity_type: string | null; ein: string | null; state: string | null; onboarding_completed: number } | null
  assigned_staff: { id: string; full_name: string | null; email: string }[]
  recent_activity: ActivityEvent[]
  services: { id: string; service_key: string; name: string; status: string }[]
  matters: any[]
  tasks: any[]
  documents: any[]
  invoices: any[]
  quotes?: { id: string; quote_number: string; title: string; status: string; total_cents: number; decided_at: string | null; decision_note: string | null; invoice_id: string | null }[]
  funding: any[]
  properties: any[]
  tax_filings: any[]
  tickets: any[]
  calls: any[]
  appointments: any[]
  application_answers: { service_key: string; question_key: string; value: string; label: string | null; step_label: string | null }[]
  payment_methods: { id: string; service_key: string | null; method_type: string; account_holder_name: string; bank_name: string | null; account_type: string | null; account_last4: string; created_at: string }[]
  notes: NoteRow[]
  onboarding_progress: { answered: number; total: number }
  service_catalog: { key: string; name: string }[]
  service_applications: {
    id: string
    service_key: string
    service_name: string
    status: string
    submission_source: string
    signed_name: string | null
    submitted_at: string | null
    created_at: string
    created_by_name: string | null
  }[]
}

type Tab = 'overview' | 'activity' | 'services' | 'work' | 'documents' | 'billing' | 'relationships' | 'details'

function money(cents: number) {
  return `$${((Number(cents) || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function displayDate(value: string | null | undefined) {
  if (!value) return 'Not provided'
  const d = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString()
}

function statusTone(status: string): 'gold' | 'green' | 'blue' | 'slate' | 'red' {
  if (['active', 'approved', 'paid', 'completed', 'filed', 'closed', 'done', 'accepted'].includes(status)) return 'green'
  if (['submitted', 'in_progress', 'under_review', 'scheduled', 'sent', 'viewed'].includes(status)) return 'blue'
  if (['requested', 'pending', 'open', 'draft'].includes(status)) return 'gold'
  if (['declined', 'blocked', 'void', 'cancelled'].includes(status)) return 'red'
  return 'slate'
}

function DetailRow({ label, value, children }: { label: string; value?: React.ReactNode; children?: React.ReactNode }) {
  return <div className="grid gap-1 border-t border-white/5 py-3 first:border-t-0 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-5"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="min-w-0 text-sm text-slate-200">{children ?? value ?? 'Not provided'}</dd></div>
}

function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return <div className="mb-4 flex items-end justify-between gap-4"><div>{eyebrow && <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">{eyebrow}</p>}<h2 className={`${eyebrow ? 'mt-1' : ''} text-lg font-semibold text-white`}>{title}</h2></div>{action}</div>
}

function SimpleTable({ columns, rows, empty }: { columns: { key: string; label: string; render?: (row: any) => React.ReactNode }[]; rows: any[]; empty: string }) {
  if (!rows.length) return <EmptyState label={empty} />
  return <div className="overflow-x-auto border-y border-white/10"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="text-[11px] uppercase tracking-wide text-slate-500">{columns.map((c) => <th key={c.key} className="px-3 py-2.5 font-medium">{c.label}</th>)}</tr></thead><tbody>{rows.map((row, idx) => <tr key={row.id ?? idx} className="border-t border-white/5"><>{columns.map((c) => <td key={c.key} className="px-3 py-3 text-slate-300">{c.render ? c.render(row) : String(row[c.key] ?? 'Not provided')}</td>)}</></tr>)}</tbody></table></div>
}

function AssignServiceForm({ clientId, catalog, taken, onAssigned }: { clientId: string; catalog: { key: string; name: string }[]; taken: Set<string>; onAssigned: () => void }) {
  const available = catalog.filter((s) => !taken.has(s.key))
  const [serviceKey, setServiceKey] = useState(available[0]?.key || '')
  const [busy, setBusy] = useState(false)

  if (available.length === 0) return <p className="text-xs text-slate-500">Every catalog service is already assigned or applied for.</p>

  async function assign() {
    if (!serviceKey) return
    setBusy(true)
    try {
      await api.post(`/admin/clients/${clientId}/services`, { service_key: serviceKey })
      toast.success('Service assigned: the client can review and sign it in their portal.')
      onAssigned()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not assign this service.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={`${inputCls} max-w-xs`} value={serviceKey} onChange={(e) => setServiceKey(e.target.value)}>
        {available.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
      </select>
      <button onClick={() => void assign()} disabled={busy} className={`${btnOutline} disabled:opacity-60`}>
        {busy ? 'Assigning…' : 'Assign service'}
      </button>
    </div>
  )
}

export default function ClientDetailModern() {
  const { id, section } = useParams<{ id: string; section?: string }>()
  const p = useAppPath()
  const navigate = useNavigate()
  const [data, setData] = useState<Bundle | null>(null)
  const tab:Tab = (['overview','activity','services','work','documents','billing','relationships','details'] as Tab[]).includes(section as Tab) ? section as Tab : 'overview'
  const [note, setNote] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [loadedTabs, setLoadedTabs] = useState<Set<Tab>>(new Set())

  const load = useCallback(async (section: Tab = tab, force = false) => {
    if (!id) return
    if (!force && loadedTabs.has(section)) return
    const result = await api.get<Partial<Bundle>>(`/admin/clients/${id}?section=${section}`)
    setData((current) => ({
      account: result.account ?? current?.account,
      profile: result.profile === undefined ? current?.profile ?? null : result.profile,
      assigned_staff: result.assigned_staff ?? current?.assigned_staff ?? [], recent_activity: result.recent_activity ?? current?.recent_activity ?? [],
      services: result.services ?? current?.services ?? [], matters: result.matters ?? current?.matters ?? [], tasks: result.tasks ?? current?.tasks ?? [], documents: result.documents ?? current?.documents ?? [], invoices: result.invoices ?? current?.invoices ?? [], quotes: result.quotes ?? current?.quotes ?? [], funding: result.funding ?? current?.funding ?? [], properties: result.properties ?? current?.properties ?? [], tax_filings: result.tax_filings ?? current?.tax_filings ?? [], tickets: result.tickets ?? current?.tickets ?? [], calls: result.calls ?? current?.calls ?? [], appointments: result.appointments ?? current?.appointments ?? [], application_answers: result.application_answers ?? current?.application_answers ?? [], payment_methods: result.payment_methods ?? current?.payment_methods ?? [], notes: result.notes ?? current?.notes ?? [], onboarding_progress: result.onboarding_progress ?? current?.onboarding_progress ?? { answered: 0, total: 0 }, service_catalog: result.service_catalog ?? current?.service_catalog ?? [], service_applications: result.service_applications ?? current?.service_applications ?? [],
    } as Bundle))
    setLoadedTabs((current) => new Set(current).add(section))
  }, [id, loadedTabs, tab])

  useEffect(() => { load(tab).catch(() => setData(null)) }, [tab])
  useEffect(() => { if(id&&!section)navigate(p(`clients/${id}/overview`),{replace:true}) },[id,section,navigate,p])

  const timeline = useMemo(() => {
    if (!data) return []
    const activity = data.recent_activity.map((item) => ({
      id: `activity-${item.id}`,
      at: item.created_at,
      kind: 'activity' as const,
      title: describeActivity(item),
      detail: '',
      meta: '',
    }))
    const notes = data.notes.map((item) => ({
      id: `note-${item.id}`,
      at: item.created_at,
      kind: 'note' as const,
      title: 'Internal note',
      detail: item.body,
      meta: item.author_name || item.author_email,
    }))
    return [...activity, ...notes].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  }, [data])

  const attention = useMemo(() => {
    if (!data) return [] as { key: string; title: string; detail: string }[]
    const now = Date.now()
    const items: { key: string; title: string; detail: string }[] = []
    for (const task of data.tasks) {
      if (task.status !== 'done' && task.due_date && new Date(task.due_date).getTime() < now) items.push({ key: `task-${task.id}`, title: task.title || 'Overdue task', detail: `Task overdue since ${new Date(task.due_date).toLocaleDateString()}` })
    }
    for (const invoice of data.invoices) {
      if (invoice.status === 'open' && invoice.due_date && new Date(invoice.due_date).getTime() < now) items.push({ key: `invoice-${invoice.id}`, title: `Invoice ${money(invoice.amount_cents)}`, detail: `Payment overdue since ${new Date(invoice.due_date).toLocaleDateString()}` })
    }
    for (const ticket of data.tickets) {
      if (ticket.status === 'open') items.push({ key: `ticket-${ticket.id}`, title: ticket.subject || 'Open support ticket', detail: `Opened ${timeAgo(ticket.created_at)}` })
    }
    return items.slice(0, 8)
  }, [data])

  async function convertQuote(quoteId: string) {
    if (convertingId) return
    setConvertingId(quoteId)
    try {
      const created = await api.post<{ id: string; invoice_number: string }>(`/admin/invoices/from-quote/${quoteId}`, { due_days: 30 })
      toast.success(`Invoice ${created.invoice_number} created from this quote.`)
      navigate(`${p('invoices')}?invoice=${encodeURIComponent(created.id)}`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not convert this quote to an invoice.')
    } finally {
      setConvertingId(null)
    }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !note.trim()) return
    setNoteBusy(true)
    try {
      await api.post(`/admin/clients/${id}/notes`, { body: note.trim() })
      setNote('')
      toast.success('Internal note added.')
      await load('activity', true)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add note.')
    } finally { setNoteBusy(false) }
  }

  if (!data) return <InlineLoading />
  const { account, profile } = data
  const clientName = account.full_name || account.email
  const activeServices = data.services.filter((s) => ['active', 'submitted', 'requested'].includes(s.status))
  const openWork = data.tasks.filter((x) => x.status !== 'done').length + data.matters.filter((x) => x.status !== 'closed').length + data.tickets.filter((x) => x.status !== 'closed').length
  const openInvoices = data.invoices.filter((x) => x.status === 'open')
  const clientQuotes = data.quotes || []
  const liveQuotes = clientQuotes.filter((x) => ['draft', 'sent', 'viewed', 'accepted'].includes(x.status))
  const openBalance = openInvoices.reduce((sum, row) => sum + (Number(row.amount_cents) || 0), 0)
  const nextAppointment = [...data.appointments].filter((a) => new Date(a.starts_at).getTime() >= Date.now()).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0]

  return <div className="mx-auto max-w-[1480px]">
    <Link to={p('clients')} className="mb-5 inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-white">← Clients</Link>

    <header className="border-b border-white/10 pb-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar userId={account.id} name={account.full_name} size={60} editable uploadPath={`/admin/clients/${account.id}/avatar`} />
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className="uppercase tracking-[0.16em]">Client</span>{profile?.business_name && <><span>·</span><span>{profile.business_name}</span></>}</div>
            <h1 className="truncate font-display text-3xl font-medium text-white sm:text-4xl">{clientName}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400"><a href={`mailto:${account.email}`} className="hover:text-gold">{account.email}</a>{account.phone && <a href={`tel:${account.phone}`} className="hover:text-gold">{account.phone}</a>}{profile?.state && <span>{profile.state}</span>}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={clientEmailHref(p, { id: account.id, email: account.email, name: account.full_name })} className={btnPrimary}>Email client</Link>
          <Link to={clientInboxHref(p, account.id)} className={btnOutline}>Messages</Link>
          <Link to={p(`clients/${account.id}/activity`)} className={btnOutline}>Add note</Link>
          <Link to={p(`clients/${account.id}/manage`)} className={btnOutline}>Manage records</Link>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
        <span><strong className="font-medium text-slate-300">{activeServices.length}</strong> active/current services</span>
        <span><strong className="font-medium text-slate-300">{openWork}</strong> open work items</span>
        <span><strong className="font-medium text-slate-300">{openInvoices.length}</strong> open invoices</span>
        {liveQuotes.length > 0 && <span><strong className="font-medium text-slate-300">{liveQuotes.length}</strong> live quote{liveQuotes.length === 1 ? '' : 's'}</span>}
        <span>Client since {new Date(account.created_at).toLocaleDateString()}</span>
      </div>
    </header>

    <nav className="mt-5 flex gap-6 overflow-x-auto border-b border-white/10" aria-label="Client profile sections">
      {([['overview','Overview'],['activity','Activity & Notes'],['services','Services'],['work','Work'],['documents','Documents'],['billing','Billing'],['relationships','People & Businesses'],['details','Profile']] as const).map(([key, label]) => <Link key={key} to={p(`clients/${account.id}/${key}`)} className={`shrink-0 border-b-2 pb-3 text-sm font-medium transition ${tab === key ? 'border-gold text-white' : 'border-transparent text-slate-500 hover:text-slate-200'}`}>{label}</Link>)}
    </nav>

    {tab === 'overview' && <div className="mt-7 grid gap-9 xl:grid-cols-[minmax(0,1fr)_380px]">
      <main>
        <SectionTitle eyebrow="Relationship" title="Client at a glance" action={<button className="text-sm font-medium text-gold hover:underline" onClick={() => setEditing((v) => !v)}>{editing ? 'Cancel' : 'Edit profile'}</button>} />
        {editing ? <ProfileEditor account={account} profile={profile} onSaved={async () => { setEditing(false); await load() }} /> : <dl className="border-y border-white/10">
          <DetailRow label="Business" value={profile?.business_name || 'Not provided'} />
          <DetailRow label="Entity" value={profile?.entity_type || 'Not provided'} />
          <DetailRow label="Assigned team">{data.assigned_staff.length ? data.assigned_staff.map((s) => s.full_name || s.email).join(', ') : <span className="text-slate-500">Unassigned</span>}</DetailRow>
          <DetailRow label="Onboarding" value={profile?.onboarding_completed ? 'Completed' : `${data.onboarding_progress.answered} of ${data.onboarding_progress.total} answers`} />
          <DetailRow label="Last login" value={account.last_login_at ? timeAgo(account.last_login_at) : 'Never'} />
        </dl>}

        <div className="mt-9">
          <SectionTitle eyebrow="Current work" title="Services & next steps" action={<Link to={p(`clients/${account.id}/manage`)} className="text-sm font-medium text-gold hover:underline">Manage →</Link>} />
          {!data.services.length ? <EmptyState label="No services are attached to this client." /> : <div className="border-y border-white/10">{data.services.slice(0, 8).map((s) => <div key={s.id} className="flex items-center justify-between gap-4 border-t border-white/5 py-3.5 first:border-t-0"><div><p className="text-sm font-medium text-white">{s.name}</p><p className="mt-0.5 text-xs text-slate-500">{humanizeLabel(s.service_key)}</p></div><Tag tone={statusTone(s.status)}>{humanizeLabel(s.status)}</Tag></div>)}</div>}
        </div>

        {attention.length > 0 && <div className="mt-9"><SectionTitle eyebrow="Priority" title="Needs attention" /><div className="border-y border-white/10">{attention.map((item) => <div key={item.key} className="border-t border-white/5 py-3.5 first:border-t-0"><p className="text-sm font-medium text-white">{item.title}</p><p className="mt-0.5 text-xs text-amber-200/70">{item.detail}</p></div>)}</div></div>}
      </main>

      <aside className="xl:border-l xl:border-white/10 xl:pl-7">
        <SectionTitle eyebrow="Relationship history" title="Latest activity" action={<Link to={p(`clients/${account.id}/activity`)} className="text-xs font-medium text-gold hover:underline">View all</Link>} />
        <Timeline rows={timeline.slice(0, 8)} />
        <div className="mt-8 border-t border-white/10 pt-6"><p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">Next appointment</p>{nextAppointment ? <div className="mt-3"><p className="text-sm font-medium text-white">{nextAppointment.title || 'Appointment'}</p><p className="mt-1 text-xs text-slate-400">{displayDate(nextAppointment.starts_at)}</p></div> : <p className="mt-3 text-sm text-slate-500">Nothing scheduled.</p>}</div>
        <div className="mt-6 border-t border-white/10 pt-6"><p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">Open balance</p><p className="mt-2 font-display text-2xl text-white">{money(openBalance)}</p><p className="mt-1 text-xs text-slate-500">Across {openInvoices.length} open invoice{openInvoices.length === 1 ? '' : 's'}</p></div>
      </aside>
    </div>}

    {tab === 'activity' && <div className="mt-7 grid gap-9 xl:grid-cols-[minmax(0,1fr)_380px]">
      <main><SectionTitle eyebrow="Timeline" title="Relationship activity" />{timeline.length ? <Timeline rows={timeline} /> : <EmptyState label="No activity yet." />}</main>
      <aside className="xl:border-l xl:border-white/10 xl:pl-7"><SectionTitle title="Add internal note" /><p className="mb-4 text-xs leading-5 text-slate-500">Staff-only. Notes are never visible in the client portal.</p><form onSubmit={addNote}><textarea className={inputCls} rows={7} placeholder="Call notes, context, follow-up, next steps…" value={note} onChange={(e) => setNote(e.target.value)} /><button className={`${btnPrimary} mt-3 w-full`} disabled={noteBusy || !note.trim()}>{noteBusy ? 'Saving…' : 'Save note'}</button></form><Link to={clientEmailHref(p, { id: account.id, email: account.email, name: account.full_name })} className={`${btnOutline} mt-3 w-full`}>Compose email</Link><Link to={campaignAudienceHref(p, { client: account.id })} className={`${btnOutline} mt-2 w-full`}>Campaign email</Link></aside>
    </div>}

    {tab === 'services' && <div className="mt-7 space-y-9">
      <section>
        <SectionTitle eyebrow="Engagement" title="Assign a service" />
        <AssignServiceForm
          clientId={account.id}
          catalog={data.service_catalog}
          taken={new Set([...data.services.map((s) => s.service_key), ...data.service_applications.filter((a) => a.status !== 'declined' && a.status !== 'closed').map((a) => a.service_key)])}
          onAssigned={() => load('services', true)}
        />
        {data.service_applications.filter((a) => a.submission_source === 'staff_assigned').length > 0 && (
          <div className="mt-5 divide-y divide-white/5 border-y border-white/10">
            {data.service_applications.filter((a) => a.submission_source === 'staff_assigned').map((app) => (
              <div key={app.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{app.service_name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {app.status === 'draft' ? 'Awaiting client signature' : app.signed_name ? `Signed by ${app.signed_name}` : 'Submitted'}
                    {app.created_by_name ? ` · assigned by ${app.created_by_name}` : ''}
                  </p>
                </div>
                <Tag tone={statusTone(app.status)}>{humanizeLabel(app.status)}</Tag>
              </div>
            ))}
          </div>
        )}
      </section>
      <section>
        <SectionTitle eyebrow="Engagement" title="Services & applications" action={<Link to={p(`clients/${account.id}/manage`)} className="text-sm font-medium text-gold hover:underline">Manage service records →</Link>} />
        {!data.services.length ? <EmptyState label="No services yet." /> : <div className="divide-y divide-white/5 border-y border-white/10">{data.services.map((service) => { const answers = data.application_answers.filter((a) => a.service_key === service.service_key); return <div key={service.id} className="py-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-white">{service.name}</h3><p className="mt-1 text-xs text-slate-500">{humanizeLabel(service.service_key)}</p></div><Tag tone={statusTone(service.status)}>{humanizeLabel(service.status)}</Tag></div>{answers.length > 0 && <dl className="mt-4 grid gap-x-8 md:grid-cols-2">{answers.slice(0, 12).map((answer) => <DetailRow key={`${service.id}-${answer.question_key}`} label={answer.label || answer.question_key.replace(/_/g, ' ')} value={answer.value} />)}</dl>}</div>})}</div>}
      </section>
    </div>}

    {tab === 'work' && <div className="mt-7 space-y-9"><section><SectionTitle eyebrow="Execution" title="Tasks" action={<Link to={p(`clients/${account.id}/manage`)} className="text-sm font-medium text-gold hover:underline">Manage work →</Link>} /><SimpleTable rows={data.tasks} empty="No tasks." columns={[{ key: 'title', label: 'Task' }, { key: 'due_date', label: 'Due', render: (r) => r.due_date ? new Date(r.due_date).toLocaleDateString() : 'Not provided' }, { key: 'status', label: 'Status', render: (r) => <Tag tone={statusTone(r.status)}>{r.status?.replace(/_/g, ' ')}</Tag> }]} /></section><section><SectionTitle title="Projects & matters" /><SimpleTable rows={data.matters} empty="No projects or matters." columns={[{ key: 'title', label: 'Matter' }, { key: 'type', label: 'Type' }, { key: 'due_date', label: 'Due' }, { key: 'status', label: 'Status', render: (r) => <Tag tone={statusTone(r.status)}>{r.status?.replace(/_/g, ' ')}</Tag> }]} /></section><section><SectionTitle title="Calls & appointments" /><SimpleTable rows={[...data.calls.map((x) => ({ ...x, row_type: 'Call', when: x.scheduled_at })), ...data.appointments.map((x) => ({ ...x, row_type: 'Appointment', when: x.starts_at }))].sort((a, b) => new Date(b.when || 0).getTime() - new Date(a.when || 0).getTime())} empty="No calls or appointments." columns={[{ key: 'row_type', label: 'Type' }, { key: 'title', label: 'Topic', render: (r) => r.title || r.topic || 'Not provided' }, { key: 'when', label: 'When', render: (r) => displayDate(r.when) }, { key: 'status', label: 'Status', render: (r) => r.status ? <Tag tone={statusTone(r.status)}>{r.status.replace(/_/g, ' ')}</Tag> : 'Not provided' }]} /></section></div>}

    {tab === 'documents' && <div className="mt-7"><SectionTitle eyebrow="Files" title="Documents" action={<Link to={p(`clients/${account.id}/manage`)} className="text-sm font-medium text-gold hover:underline">Manage documents →</Link>} /><SimpleTable rows={data.documents} empty="No documents." columns={[{ key: 'file_name', label: 'Document', render: (r) => r.file_name || r.category || 'Document' }, { key: 'category', label: 'Category' }, { key: 'review_status', label: 'Review status', render: (r) => r.review_status ? <Tag tone={statusTone(r.review_status)}>{r.review_status.replace(/_/g, ' ')}</Tag> : 'Not provided' }, { key: 'created_at', label: 'Added', render: (r) => displayDate(r.created_at) }]} /></div>}

    {tab === 'billing' && <div className="mt-7 space-y-9">
      <section>
        <SectionTitle eyebrow="Financial" title="Quotes" action={<Link to={`${p('quotes')}?new=1&client=${encodeURIComponent(account.id)}&email=${encodeURIComponent(account.email)}&name=${encodeURIComponent(account.full_name || account.email)}`} className="text-sm font-medium text-gold hover:underline">New quote →</Link>} />
        <SimpleTable rows={clientQuotes} empty="No quotes for this client." columns={[
          { key: 'quote_number', label: 'Quote', render: (r) => <Link to={`${p('quotes')}?quote=${encodeURIComponent(r.id)}`} className="font-medium text-white hover:text-gold">{r.quote_number}: {r.title}</Link> },
          { key: 'total_cents', label: 'Amount', render: (r) => money(r.total_cents) },
          { key: 'status', label: 'Status', render: (r) => <Tag tone={statusTone(r.status)}>{r.status}</Tag> },
          { key: 'next', label: 'Next', render: (r) => (
            <div className="flex flex-wrap gap-3">
              {r.status === 'accepted' && !r.invoice_id && <button type="button" disabled={convertingId === r.id} onClick={() => void convertQuote(r.id)} className="text-xs font-semibold text-emerald-300 hover:underline">{convertingId === r.id ? 'Converting…' : 'Convert to invoice'}</button>}
              {r.invoice_id && <Link to={`${p('invoices')}?invoice=${encodeURIComponent(r.invoice_id)}`} className="text-xs font-semibold text-gold hover:underline">Open invoice</Link>}
              {r.decision_note && <span className="text-xs text-slate-500">{r.decision_note}</span>}
            </div>
          ) },
        ]} />
      </section>
      <section>
        <SectionTitle title="Invoices" action={<Link to={`${p('invoices')}?client=${encodeURIComponent(account.id)}`} className="text-sm font-medium text-gold hover:underline">New invoice →</Link>} />
        <SimpleTable rows={data.invoices} empty="No invoices." columns={[{ key: 'description', label: 'Invoice', render: (r) => <Link to={`${p('invoices')}?invoice=${encodeURIComponent(r.id)}`} className="font-medium text-white hover:text-gold">{r.description || r.title || r.invoice_number || `Invoice ${String(r.id).slice(0, 8)}`}</Link> }, { key: 'amount_cents', label: 'Amount', render: (r) => money(r.amount_cents) }, { key: 'due_date', label: 'Due', render: (r) => r.due_date ? new Date(r.due_date).toLocaleDateString() : 'Not provided' }, { key: 'status', label: 'Status', render: (r) => <Tag tone={statusTone(r.status)}>{r.status}</Tag> }]} />
      </section>
      <section><SectionTitle title="ACH methods on file" /><div className="border-y border-white/10">{data.payment_methods.length ? data.payment_methods.map((method) => <div key={method.id} className="flex items-center justify-between gap-4 border-t border-white/5 py-4 first:border-t-0"><div><p className="text-sm font-medium text-white">{method.account_holder_name}</p><p className="mt-1 text-xs text-slate-500">{method.bank_name || 'Bank'} · {method.account_type || 'account'} ending {method.account_last4}</p></div><span className="text-xs text-slate-600">Sensitive details available in Manage records</span></div>) : <p className="py-5 text-sm text-slate-500">No ACH payment methods on file.</p>}</div></section>
    </div>}

    {tab === 'relationships' && <div className="mt-7"><ClientRelationships clientId={account.id}/></div>}

    {tab === 'details' && <div className="mt-7 max-w-5xl"><SectionTitle eyebrow="Account" title="Client & business details" action={<button className="text-sm font-medium text-gold hover:underline" onClick={() => setEditing((v) => !v)}>{editing ? 'Cancel' : 'Edit'}</button>} />{editing ? <ProfileEditor account={account} profile={profile} onSaved={async () => { setEditing(false); await load() }} /> : <dl className="border-y border-white/10"><DetailRow label="Full name" value={account.full_name || 'Not provided'} /><DetailRow label="Email" value={account.email} /><DetailRow label="Phone" value={account.phone || 'Not provided'} /><DetailRow label="Business name" value={profile?.business_name || 'Not provided'} /><DetailRow label="Entity type" value={profile?.entity_type || 'Not provided'} /><DetailRow label="EIN" value={profile?.ein || 'Not provided'} /><DetailRow label="State" value={profile?.state || 'Not provided'} /><DetailRow label="Account created" value={displayDate(account.created_at)} /><DetailRow label="Last login" value={displayDate(account.last_login_at)} /><DetailRow label="Assigned team" value={data.assigned_staff.map((s) => s.full_name || s.email).join(', ') || 'Unassigned'} /></dl>}</div>}
  </div>
}

function Timeline({ rows }: { rows: { id: string; at: string; kind: 'activity' | 'note'; title: string; detail: string; meta: string }[] }) {
  if (!rows.length) return <p className="text-sm text-slate-500">No activity yet.</p>
  return <ol className="relative mt-2 border-l border-white/10">{rows.map((row) => <li key={row.id} className="relative pb-6 pl-6 last:pb-0"><span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-navy-950 ${row.kind === 'note' ? 'bg-sky-400' : 'bg-gold'}`} /><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-white">{row.title}</p><time className="shrink-0 text-[11px] text-slate-600">{timeAgo(row.at)}</time></div>{row.detail && <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-400">{row.detail}</p>}{row.meta && <p className="mt-1 text-xs text-slate-600">{row.meta}</p>}</li>)}</ol>
}

function ProfileEditor({ account, profile, onSaved }: { account: Bundle['account']; profile: Bundle['profile']; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ full_name: account.full_name || '', phone: account.phone || '', business_name: profile?.business_name || '', entity_type: profile?.entity_type || '', ein: profile?.ein || '', state: profile?.state || '' })
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try { await api.patch(`/admin/clients/${account.id}/profile`, form); toast.success('Profile updated.'); await onSaved() }
    catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not update profile.') }
    finally { setBusy(false) }
  }
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))
  return <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2"><label><span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Full name</span><input className={inputCls} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} /></label><label><span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Phone</span><input className={inputCls} value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label><label><span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Business name</span><input className={inputCls} value={form.business_name} onChange={(e) => set('business_name', e.target.value)} /></label><label><span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Entity type</span><input className={inputCls} value={form.entity_type} onChange={(e) => set('entity_type', e.target.value)} /></label><label><span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">EIN</span><input className={inputCls} value={form.ein} onChange={(e) => set('ein', e.target.value)} /></label><label><span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">State</span><input className={inputCls} value={form.state} onChange={(e) => set('state', e.target.value)} /></label><div className="sm:col-span-2"><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div></form>
}
