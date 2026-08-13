import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Send, Star } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, Tag, inputCls, btnPrimary } from '../../components/admin/ui'
import { Avatar } from '../../components/kit/Avatar'
import { useAppPath } from '../../lib/basePath'
import { toast } from '../../components/kit/toast'

interface Data {
  employee: any
  vendor_application: any
  vendor_documents: any[]
  provider_agreements: any[]
  tasks: any[]
  notes: any[]
  login_history: any[]
  network_notes: any[]
  dispatch_history: any[]
  avg_response_hours: number | null
}

const tabs = [
  { key: 'profile', label: 'Overview' },
  { key: 'dispatch', label: 'Dispatch' },
  { key: 'notes', label: 'Notes' },
  { key: 'history', label: 'History' },
] as const

export default function ProviderProfile() {
  const { id = '' } = useParams()
  const p = useAppPath()
  const location = useLocation()
  const tab = (tabs.find((item) => location.pathname.endsWith(`/${item.key}`)) || tabs[0]).key
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await api.get<Data>(`/admin/employees/${id}`))
      setError('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Provider profile could not load.')
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  async function saveNetwork() {
    if (!data) return
    setSaving(true)
    try {
      await api.patch(`/admin/employees/${id}/network`, {
        network_status: data.employee.network_status,
        availability_status: data.employee.availability_status,
        is_preferred_provider: !!data.employee.is_preferred_provider,
        service_area_summary: data.employee.service_area_summary,
      })
      toast.success('Provider profile updated.')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not update provider.')
    } finally {
      setSaving(false)
    }
  }

  async function addNote() {
    if (!note.trim()) return
    setSaving(true)
    try {
      await api.post(`/admin/employees/${id}/network-notes`, { body: note, note_type: 'general' })
      setNote('')
      await load()
      toast.success('Network note added.')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not add note.')
    } finally {
      setSaving(false)
    }
  }

  if (error) return <Panel><p className="text-rose-300">{error}</p><button className="btn-outline mt-4" onClick={() => void load()}>Retry</button></Panel>
  if (!data) return <p className="text-sm text-slate-400">Loading provider profile…</p>

  const e = data.employee
  const provider = e.party_type === 'vendor'
  const agreement = data.provider_agreements[0]
  const subtitle = [e.vendor_category || e.role_name || e.title, e.email, e.phone].filter(Boolean).join(' · ')

  return (
    <div>
      <Link to={p('network')} className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-gold">
        <ArrowLeft size={14} />Network & Dispatch
      </Link>
      <PageIntro
        kicker={provider ? 'Provider' : 'Internal contact'}
        title={e.full_name || e.email}
        subtitle={subtitle}
        leading={
          <Avatar
            userId={e.id}
            name={e.full_name || e.email}
            size={72}
            editable
            uploadPath={`/admin/users/${e.id}/avatar`}
          />
        }
        action={e.is_preferred_provider ? <Tag tone="gold"><Star size={12} className="fill-gold" />Preferred</Tag> : undefined}
      />

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-white/10">
        {tabs.map((item) => (
          <Link
            key={item.key}
            to={p(`network/${id}/${item.key}`)}
            className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === item.key ? 'border-gold text-gold' : 'border-transparent text-slate-500 hover:text-white'}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === 'profile' && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,.85fr)]">
          <Panel>
            <h2 className="text-sm font-semibold text-white">Relationship</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Status, coverage, and whether this person is preferred for dispatch.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Pipeline status">
                <select className={inputCls} value={e.network_status || 'active'} onChange={(x) => setData({ ...data, employee: { ...e, network_status: x.target.value } })}>
                  <option value="prospect">Prospect</option>
                  <option value="vetting">Vetting</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
              <Field label="Availability">
                <select className={inputCls} value={e.availability_status || 'available'} onChange={(x) => setData({ ...data, employee: { ...e, availability_status: x.target.value } })}>
                  <option value="available">Available</option>
                  <option value="limited">Limited</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              </Field>
              <Field label="Service area">
                <input className={inputCls} value={e.service_area_summary || ''} onChange={(x) => setData({ ...data, employee: { ...e, service_area_summary: x.target.value } })} placeholder="Nationwide, South Florida, remote…" />
              </Field>
              <label className="flex items-end gap-3 rounded-xl border border-white/10 p-3 text-sm text-slate-300">
                <input type="checkbox" checked={!!e.is_preferred_provider} onChange={(x) => setData({ ...data, employee: { ...e, is_preferred_provider: x.target.checked ? 1 : 0 } })} />
                Preferred provider
              </label>
            </div>
            <button className={`${btnPrimary} mt-4`} disabled={saving} onClick={saveNetwork}><Save size={14} />Save relationship</button>
          </Panel>

          <div className="space-y-5">
            <Panel>
              <h2 className="text-sm font-semibold text-white">Load</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Stat label="Assigned" value={e.tasks_assigned} />
                <Stat label="Completed" value={e.tasks_completed} />
                <Stat label="Overdue" value={e.tasks_overdue} />
                <Stat label="Avg response" value={data.avg_response_hours == null ? 'Not provided' : `${data.avg_response_hours.toFixed(1)}h`} />
              </div>
            </Panel>
            <Panel>
              <h2 className="text-sm font-semibold text-white">Contact & files</h2>
              <dl className="mt-3 space-y-2 text-sm text-slate-300">
                <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">Email</dt><dd>{e.email}</dd></div>
                {e.phone && <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">Phone</dt><dd>{e.phone}</dd></div>}
                <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">Verification files</dt><dd>{data.vendor_documents.length}</dd></div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">Provider agreement</dt>
                  <dd className="text-xs leading-5 text-slate-400">
                    {agreement
                      ? `Version ${agreement.agreement_version} accepted ${new Date(agreement.accepted_at).toLocaleString()} by ${agreement.signature_name}`
                      : 'Not accepted'}
                  </dd>
                </div>
                <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">Last active</dt><dd>{e.last_seen_at ? new Date(e.last_seen_at).toLocaleString() : 'Never'}</dd></div>
              </dl>
            </Panel>
          </div>
        </div>
      )}

      {tab === 'dispatch' && (
        <Panel>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Dispatch history</h2>
            <Link to={p('field-work')} className="btn-gold">Open Dispatch Board</Link>
          </div>
          <div className="mt-4 divide-y divide-white/[.06]">
            {data.dispatch_history.length ? data.dispatch_history.map((a: any) => (
              <div key={a.id} className="py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">{a.title || String(a.service_key || '').replaceAll('_', ' ')}</p>
                  <Tag>{a.status}</Tag>
                </div>
                <p className="mt-1 text-xs text-slate-500">{a.site_address || 'Remote'} · {a.scheduled_at ? new Date(a.scheduled_at).toLocaleString() : 'Unscheduled'}</p>
              </div>
            )) : <p className="py-6 text-sm text-slate-500">No dispatch history yet.</p>}
          </div>
        </Panel>
      )}

      {tab === 'notes' && (
        <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
          <Panel>
            <h2 className="text-sm font-semibold text-white">Add relationship note</h2>
            <textarea className={`${inputCls} mt-4 min-h-32`} value={note} onChange={(x) => setNote(x.target.value)} placeholder="Conversation, vetting update, coverage change, follow-up…" />
            <button className={`${btnPrimary} mt-3`} disabled={saving || !note.trim()} onClick={addNote}><Send size={14} />Add note</button>
          </Panel>
          <Panel>
            <h2 className="text-sm font-semibold text-white">Network notes</h2>
            <div className="mt-3 divide-y divide-white/[.06]">
              {data.network_notes.length ? data.network_notes.map((n: any) => (
                <div key={n.id} className="py-4">
                  <p className="whitespace-pre-wrap text-sm text-slate-200">{n.body}</p>
                  <p className="mt-2 text-xs text-slate-600">{n.author_name || n.author_email} · {new Date(n.created_at).toLocaleString()}</p>
                </div>
              )) : <p className="py-6 text-sm text-slate-500">No relationship notes yet.</p>}
            </div>
          </Panel>
        </div>
      )}

      {tab === 'history' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel>
            <h2 className="text-sm font-semibold text-white">Access history</h2>
            {data.login_history.length ? data.login_history.map((l: any, i: number) => (
              <p key={i} className="border-b border-white/[.06] py-3 text-sm text-slate-400">Signed in {new Date(l.created_at).toLocaleString()}</p>
            )) : <p className="py-6 text-sm text-slate-500">No sign-ins recorded.</p>}
          </Panel>
          <Panel>
            <h2 className="text-sm font-semibold text-white">Work history</h2>
            {data.tasks.length ? data.tasks.map((t: any) => (
              <div key={t.id} className="border-b border-white/[.06] py-3">
                <p className="text-sm text-white">{t.title}</p>
                <p className="mt-1 text-xs text-slate-500">{t.status} · {t.client_name || t.client_email}</p>
              </div>
            )) : <p className="py-6 text-sm text-slate-500">No assigned work yet.</p>}
          </Panel>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: any }) {
  return <label><span className="mb-1.5 block text-xs text-slate-500">{label}</span>{children}</label>
}

function Stat({ label, value }: { label: string; value: any }) {
  return <div className="rounded-xl border border-white/10 p-3"><p className="text-xl font-semibold text-white">{value}</p><p className="text-xs text-slate-500">{label}</p></div>
}
