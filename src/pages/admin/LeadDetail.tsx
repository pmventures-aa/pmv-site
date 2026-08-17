import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { lifecycleLabel } from '../../../shared/lifecycle'
import { Panel, Tag, inputCls, btnPrimary, btnOutline, EmptyState } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { describeActivity, timeAgo, type ActivityEvent } from '../../lib/activity'
import { campaignAudienceHref, leadEmailHref } from '../../lib/engagements'
import { InlineLoading } from '../../components/LoadingScreen'
import { crmPersonName } from '../../../shared/crmRecord'

interface LeadRecord {
  id: string
  name: string
  email: string
  phone: string | null
  record_type: 'person' | 'business'
  first_name: string | null
  last_name: string | null
  company_name: string | null
  job_title: string | null
  website: string | null
  industry: string | null
  source: string | null
  lifecycle_stage: string
  status: string
  email_status: string
  service_key: string | null
  service_name: string | null
  owner_staff_user_id: string | null
  owner_name: string | null
  owner_email: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  message: string
  last_contacted_at: string | null
  created_at: string
  updated_at: string | null
  client_user_id: string | null
  converted_at: string | null
}

interface NoteRow { id: string; body: string; author_name: string | null; author_email: string; created_at: string }
interface EmailRow { id: string; subject: string; body: string; to_address: string; sender_name: string | null; sender_email: string | null; created_at: string }
interface ActivityRow { id: string; kind: string; detail: string | null; actor_name: string | null; actor_email: string | null; created_at: string }
interface CRMList { id: string; name: string; list_type: string }
interface StaffMember { id: string; full_name: string | null; email: string }
interface Bundle { record: LeadRecord; notes: NoteRow[]; emails: EmailRow[]; activity: ActivityRow[]; lists: CRMList[]; tags: { id: string; name: string }[]; conversion: { client_user_id: string } | null }

type Tab = 'overview' | 'activity' | 'lists' | 'details'

function lifecycleTone(stage: string): 'gold' | 'green' | 'blue' | 'slate' | 'red' {
  if (stage === 'opportunity') return 'gold'
  if (stage === 'prospect') return 'blue'
  if (stage === 'lost') return 'red'
  if (stage === 'converted') return 'green'
  return 'slate'
}

function plainText(html: string) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}

export default function LeadDetail() {
  const { id, section } = useParams<{ id: string; section?: string }>()
  const p = useAppPath()
  const navigate = useNavigate()
  const [data, setData] = useState<Bundle | null>(null)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [allLists, setAllLists] = useState<CRMList[]>([])
  const tab:Tab = (['overview','activity','lists','details'] as Tab[]).includes(section as Tab) ? section as Tab : 'overview'
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  const [listId, setListId] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const [bundle, staffRes, listsRes] = await Promise.all([
      api.get<Bundle>(`/admin/crm/records/${id}`),
      api.get<{ staff: StaffMember[] }>('/admin/crm/staff-directory').catch(() => ({ staff: [] })),
      api.get<{ lists: CRMList[] }>('/admin/crm/lists').catch(() => ({ lists: [] })),
    ])
    setData(bundle); setStaff(staffRes.staff); setAllLists(listsRes.lists)
  }, [id])

  useEffect(() => { load().catch(() => setData(null)) }, [load])
  useEffect(() => { if(id&&!section)navigate(p(`leads/${id}/overview`),{replace:true}) },[id,section,navigate,p])

  const timeline = useMemo(() => {
    if (!data) return []
    const rows = [
      ...data.notes.map((n) => ({ id: `note-${n.id}`, at: n.created_at, type: 'note', title: 'Internal note', body: n.body, meta: n.author_name || n.author_email })),
      ...data.emails.map((e) => ({ id: `email-${e.id}`, at: e.created_at, type: 'email', title: e.subject, body: plainText(e.body), meta: `Email to ${e.to_address}` })),
      ...data.activity.filter((a) => a.kind !== 'email.sent' && a.kind !== 'comms_message_sent').map((a) => ({ id: `activity-${a.id}`, at: a.created_at, type: 'activity', title: describeActivity({ id: a.id, actor_user_id: null, actor_name: a.actor_name, actor_email: a.actor_email, client_user_id: null, kind: a.kind, detail: a.detail, created_at: a.created_at } satisfies ActivityEvent), body: '', meta: a.actor_name || a.actor_email || 'Pinnacle' })),
    ]
    return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  }, [data])

  async function addNote(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !note.trim()) return
    setBusy(true)
    try {
      await api.post(`/admin/crm/records/${id}/notes`, { body: note })
      setNote(''); toast.success('Note added.'); await load()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not add note.') }
    finally { setBusy(false) }
  }

  async function updateRecord(patch: Record<string, unknown>) {
    if (!id) return
    try { await api.patch(`/admin/crm/records/${id}`, patch); await load() }
    catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not update record.') }
  }

  async function addToList() {
    if (!id || !listId) return
    setBusy(true)
    try {
      await api.post(`/admin/crm/lists/${listId}/members`, { inquiry_ids: [id] })
      setListId(''); toast.success('Added to list.'); await load()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not add to list.') }
    finally { setBusy(false) }
  }

  async function convert() {
    if (!id || !data) return
    if (!window.confirm(`Convert ${data.record.name} to a client? Their notes, outbound email history, and activity will carry forward.`)) return
    setBusy(true)
    try {
      const res = await api.post<{ client_user_id: string; client_public_ref: string | null }>(`/admin/inquiries/${id}/convert`)
      toast.success('Converted to client.')
      navigate(p(`clients/${res.client_public_ref || res.client_user_id}/overview`))
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not convert this record.') }
    finally { setBusy(false) }
  }

  if (!data) return <InlineLoading />
  const r = data.record
  const location = [r.city, r.state].filter(Boolean).join(', ')
  const unusedLists = allLists.filter((l) => l.list_type === 'static' && !data.lists.some((member) => member.id === l.id))
  const contactName = crmPersonName(r)
  const contactLine = [r.job_title, contactName].filter(Boolean).join(' · ')

  return (
    <div className="mx-auto max-w-[1440px]">
      <Link to={p('inquiries')} className="mb-5 inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-white">← Leads & Prospects</Link>

      <header className="border-b border-white/10 pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="uppercase tracking-[0.16em]">{r.record_type === 'business' ? 'Business' : 'Person'}</span>
              <span>·</span><span>CRM record</span>
              {r.source && <><span>·</span><span>Source: {r.source}</span></>}
            </div>
            <h1 className="truncate font-display text-3xl font-medium text-white sm:text-4xl">{r.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-400">
              {r.record_type === 'business' && contactLine && <span>{contactLine}</span>}
              {r.company_name && r.record_type !== 'business' && <span>{r.job_title ? `${r.job_title} at ` : ''}<strong className="font-medium text-slate-200">{r.company_name}</strong></span>}
              <a href={`mailto:${r.email}`} className="hover:text-gold">{r.email}</a>
              {r.phone && <a href={`tel:${r.phone}`} className="hover:text-gold">{r.phone}</a>}
              {location && <span>{location}</span>}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Tag tone={lifecycleTone(r.lifecycle_stage)}>{lifecycleLabel(r.lifecycle_stage)}</Tag>
              <Tag>{r.status}</Tag>
              {r.client_user_id && !r.converted_at && <Tag tone="blue">Reserved workspace</Tag>}
              {r.email_status !== 'emailable' && <Tag tone="red">Email {r.email_status}</Tag>}
              {data.tags.map((tag) => <Tag key={tag.id}>{tag.name}</Tag>)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={leadEmailHref(p, { id: r.id, email: r.email, name: r.name })} className={btnPrimary}>Email</Link>
            <Link to={`${p('quotes')}?new=1&email=${encodeURIComponent(r.email)}&name=${encodeURIComponent(r.name)}`} className={btnOutline}>New quote</Link>
            <Link to={campaignAudienceHref(p, { lead: r.id })} className={btnOutline}>Campaign</Link>
            <Link className={btnOutline} to={p(`leads/${r.id}/activity`)}>Add note</Link>
            {!r.converted_at && !data.conversion && <button className={btnOutline} disabled={busy} onClick={convert}>Convert to client</button>}
            {(r.converted_at || data.conversion) && <Link to={p(`clients/${r.client_user_id || data.conversion?.client_user_id}/overview`)} className={btnOutline}>Open client</Link>}
          </div>
        </div>
      </header>

      <div className="mt-5 flex gap-6 overflow-x-auto border-b border-white/10">
        {([['overview', 'Overview'], ['activity', 'Activity & Notes'], ['lists', 'Lists & Tags'], ['details', 'Profile']] as const).map(([key, label]) => (
          <Link key={key} to={p(`leads/${r.id}/${key}`)} className={`shrink-0 border-b-2 pb-3 text-sm font-medium transition ${tab === key ? 'border-gold text-white' : 'border-transparent text-slate-500 hover:text-slate-200'}`}>{label}</Link>
        ))}
      </div>

      {tab === 'overview' && <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <div className="mb-5 flex items-end justify-between"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Relationship</p><h2 className="mt-1 text-xl font-semibold text-white">What we know</h2></div><button onClick={() => setEditing((v) => !v)} className="text-sm font-medium text-gold hover:underline">{editing ? 'Done' : 'Edit details'}</button></div>
          {editing ? <RecordEditor record={r} staff={staff} onSave={async (patch) => { await updateRecord(patch); setEditing(false) }} /> : <dl className="grid border-y border-white/10 sm:grid-cols-2">
            <Info label="Lifecycle" value={lifecycleLabel(r.lifecycle_stage)} />
            <Info label="Pipeline stage" value={r.status} />
            <Info label="Owner" value={r.owner_name || r.owner_email || 'Unassigned'} />
            <Info label="Interested in" value={r.service_name || 'Not specified'} />
            <Info label="Company / business" value={r.company_name || (r.record_type === 'business' ? r.name : 'Not provided')} />
            <Info label="Contact person" value={contactLine || 'Not listed'} />
            <Info label="Industry" value={r.industry || 'Not provided'} />
            <Info label="Source" value={r.source || 'Not provided'} />
            <Info label="Last contacted" value={r.last_contacted_at ? timeAgo(r.last_contacted_at) : 'Not yet'} />
          </dl>}
          {r.message && <div className="mt-8"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Original context</p><p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-300">{r.message}</p></div>}
        </section>
        <aside className="border-l border-white/10 xl:pl-7">
          <div className="flex items-center justify-between"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Timeline</p><h2 className="mt-1 text-lg font-semibold text-white">Latest activity</h2></div><Link className="text-xs text-gold hover:underline" to={p(`leads/${r.id}/activity`)}>View all</Link></div>
          <Timeline rows={timeline.slice(0, 7)} />
        </aside>
      </div>}

      {tab === 'activity' && <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section><div className="mb-5"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Relationship history</p><h2 className="mt-1 text-xl font-semibold text-white">Activity & communication</h2></div>{timeline.length ? <Timeline rows={timeline} /> : <EmptyState label="No activity yet." />}</section>
        <aside className="xl:border-l xl:border-white/10 xl:pl-7"><h3 className="font-semibold text-white">Add internal note</h3><p className="mt-1 text-xs leading-5 text-slate-500">Staff-only. This note follows the record if it becomes a client.</p><form onSubmit={addNote} className="mt-4"><textarea className={inputCls} rows={6} placeholder="Add context, call notes, next steps…" value={note} onChange={(e) => setNote(e.target.value)} /><button className={`${btnPrimary} mt-3 w-full`} disabled={busy || !note.trim()}>Save note</button></form><Link to={leadEmailHref(p, { id: r.id, email: r.email, name: r.name })} className={`${btnOutline} mt-3 w-full`}>Compose email</Link></aside>
      </div>}

      {tab === 'lists' && <div className="mt-6 max-w-4xl"><div className="mb-5"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Audience organization</p><h2 className="mt-1 text-xl font-semibold text-white">Lists & segments</h2></div><div className="border-y border-white/10">{data.lists.length === 0 ? <p className="py-6 text-sm text-slate-500">This record is not in any static lists yet.</p> : data.lists.map((list) => <div key={list.id} className="flex items-center justify-between border-t border-white/5 py-4 first:border-t-0"><div><p className="font-medium text-white">{list.name}</p><p className="text-xs text-slate-500">{list.list_type}</p></div><Link to={campaignAudienceHref(p, { list: list.id })} className="text-sm font-medium text-gold hover:underline">Email list →</Link></div>)}</div>{unusedLists.length > 0 && <div className="mt-5 flex gap-2"><select className={inputCls} value={listId} onChange={(e) => setListId(e.target.value)}><option value="">Add to a static list…</option>{unusedLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select><button className={btnPrimary} disabled={!listId || busy} onClick={addToList}>Add</button></div>}</div>}

      {tab === 'details' && <div className="mt-6 max-w-5xl"><div className="mb-5 flex items-end justify-between"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Record data</p><h2 className="mt-1 text-xl font-semibold text-white">Contact & business details</h2></div><button onClick={() => setEditing((v) => !v)} className="text-sm font-medium text-gold hover:underline">{editing ? 'Cancel' : 'Edit'}</button></div>{editing ? <RecordEditor record={r} staff={staff} onSave={async (patch) => { await updateRecord(patch); setEditing(false) }} /> : <dl className="grid border-y border-white/10 sm:grid-cols-2"><Info label="Record type" value={r.record_type} /><Info label="Email status" value={r.email_status} /><Info label="Email" value={r.email} /><Info label="Phone" value={r.phone || 'Not provided'} /><Info label={r.record_type === 'business' ? 'Contact first name' : 'First name'} value={r.first_name || 'Not provided'} /><Info label={r.record_type === 'business' ? 'Contact last name' : 'Last name'} value={r.last_name || 'Not provided'} /><Info label={r.record_type === 'business' ? 'Contact title' : 'Job title'} value={r.job_title || 'Not provided'} /><Info label="Website" value={r.website || 'Not provided'} /><Info label="Industry" value={r.industry || 'Not provided'} /><Info label="Owner" value={r.owner_name || r.owner_email || 'Unassigned'} /><Info label="Address" value={[r.address_line1, r.address_line2, r.city, r.state, r.postal_code, r.country].filter(Boolean).join(', ') || 'Not provided'} /><Info label="Created" value={new Date(r.created_at).toLocaleString()} /></dl>}</div>}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="border-t border-white/5 px-0 py-4 pr-6 first:border-t-0 sm:[&:nth-child(-n+2)]:border-t-0"><dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-200">{value}</dd></div>
}

function Timeline({ rows }: { rows: { id: string; at: string; type: string; title: string; body: string; meta: string }[] }) {
  return <div className="mt-5"><ol className="relative border-l border-white/10">{rows.map((row) => <li key={row.id} className="relative pb-6 pl-6 last:pb-0"><span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-navy-950 ${row.type === 'email' ? 'bg-gold' : row.type === 'note' ? 'bg-sky-400' : 'bg-slate-600'}`} /><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-white">{row.title}</p><time className="shrink-0 text-[11px] text-slate-600">{timeAgo(row.at)}</time></div>{row.body && <p className="mt-1 line-clamp-3 text-sm leading-5 text-slate-400">{row.body}</p>}<p className="mt-1 text-xs text-slate-600">{row.meta}</p></li>)}</ol></div>
}

function RecordEditor({ record, staff, onSave }: { record: LeadRecord; staff: StaffMember[]; onSave: (patch: Record<string, unknown>) => Promise<void> }) {
  const [form, setForm] = useState({
    record_type: record.record_type, first_name: record.first_name || '', last_name: record.last_name || '', company_name: record.company_name || '', job_title: record.job_title || '',
    phone: record.phone || '', website: record.website || '', industry: record.industry || '', source: record.source || '', lifecycle_stage: record.lifecycle_stage, status: record.status,
    owner_staff_user_id: record.owner_staff_user_id || '', email_status: record.email_status, address_line1: record.address_line1 || '', address_line2: record.address_line2 || '', city: record.city || '', state: record.state || '', postal_code: record.postal_code || '', country: record.country || '',
  })
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) { e.preventDefault(); setBusy(true); try { await onSave(form) } finally { setBusy(false) } }
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))
  return <form onSubmit={submit} className="grid gap-4 md:grid-cols-2"><select className={inputCls} value={form.record_type} onChange={(e) => set('record_type', e.target.value)}><option value="person">Person</option><option value="business">Business</option></select><select className={inputCls} value={form.lifecycle_stage} onChange={(e) => set('lifecycle_stage', e.target.value)}><option value="lead">Lead</option><option value="prospect">Prospect</option><option value="opportunity">Application</option><option value="lost">Lost</option></select><input className={inputCls} placeholder={form.record_type === 'business' ? 'Contact first name' : 'First name'} value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /><input className={inputCls} placeholder={form.record_type === 'business' ? 'Contact last name' : 'Last name'} value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /><input className={inputCls} placeholder="Company / business" value={form.company_name} onChange={(e) => set('company_name', e.target.value)} /><input className={inputCls} placeholder={form.record_type === 'business' ? 'Contact title' : 'Job title'} value={form.job_title} onChange={(e) => set('job_title', e.target.value)} /><input className={inputCls} placeholder="Phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} /><input className={inputCls} placeholder="Website" value={form.website} onChange={(e) => set('website', e.target.value)} /><input className={inputCls} placeholder="Industry" value={form.industry} onChange={(e) => set('industry', e.target.value)} /><input className={inputCls} placeholder="Source" value={form.source} onChange={(e) => set('source', e.target.value)} /><select className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value)}><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="lost">Lost</option></select><select className={inputCls} value={form.owner_staff_user_id} onChange={(e) => set('owner_staff_user_id', e.target.value)}><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}</select><select className={inputCls} value={form.email_status} onChange={(e) => set('email_status', e.target.value)}><option value="emailable">Email allowed</option><option value="unsubscribed">Unsubscribed</option><option value="bounced">Bounced</option><option value="suppressed">Suppressed</option></select><input className={inputCls} placeholder="Address line 1" value={form.address_line1} onChange={(e) => set('address_line1', e.target.value)} /><input className={inputCls} placeholder="Address line 2" value={form.address_line2} onChange={(e) => set('address_line2', e.target.value)} /><input className={inputCls} placeholder="City" value={form.city} onChange={(e) => set('city', e.target.value)} /><input className={inputCls} placeholder="State" value={form.state} onChange={(e) => set('state', e.target.value)} /><input className={inputCls} placeholder="Postal code" value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} /><input className={inputCls} placeholder="Country" value={form.country} onChange={(e) => set('country', e.target.value)} /><div className="md:col-span-2"><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div></form>
}
