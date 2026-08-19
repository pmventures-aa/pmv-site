import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Send, Star } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, Tag, inputCls, btnPrimary } from '../../components/admin/ui'
import { Avatar } from '../../components/kit/Avatar'
import { useAppPath } from '../../lib/basePath'
import { toast } from '../../components/kit/toast'
import { liveLetterheadHtml, type SignatureRosterPerson } from '../../lib/emailSignatures'
import { SignaturePreview } from './SignatureLetterhead'
import { canDispatchPerson, networkDispatchHref } from '../../lib/networkRoster'
import { DOC_LABELS, type ApplicationDocKey } from '../../../shared/providerApplication'
import { Dialog, DialogTrigger, DialogContent } from '../../components/kit/Dialog'

interface SsoIdentity { connection: string; label: string; email: string | null; last_login_at: string | null }
interface Data {
  employee: any
  vendor_application: any
  vendor_documents: any[]
  provider_credentials: any
  provider_agreements: any[]
  tasks: any[]
  notes: any[]
  login_history: any[]
  network_notes: any[]
  dispatch_history: any[]
  avg_response_hours: number | null
  sso_identities?: SsoIdentity[]
  has_password?: boolean
}

const tabs = [
  { key: 'profile', label: 'Overview' },
  { key: 'credentials', label: 'Credentials' },
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
  const [profile, setProfile] = useState({ full_name: '', display_name: '', phone: '', vendor_category: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [sigName, setSigName] = useState('')
  const [sigTitle, setSigTitle] = useState('')
  const [sigEmail, setSigEmail] = useState('')
  const [sigPhone, setSigPhone] = useState('')
  const [sigReady, setSigReady] = useState(false)
  const [genBusy, setGenBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const next = await api.get<Data>(`/admin/employees/${id}`)
      setData(next)
      setError('')
      const emp0 = next.employee || {}
      setProfile({
        full_name: emp0.full_name || '',
        display_name: emp0.display_name || '',
        phone: emp0.phone || '',
        vendor_category: emp0.vendor_category || '',
      })
      try {
        const sigs = await api.get<{ roster?: SignatureRosterPerson[] }>('/admin/email-signatures')
        const person = (sigs.roster || []).find((row) => row.user_id === id)
        const emp = next.employee
        setSigName(person?.full_name || emp?.full_name || '')
        setSigTitle(person?.title || emp?.title || '')
        setSigEmail(person?.email || emp?.email || '')
        setSigPhone(person?.phone || emp?.phone || '')
        setSigReady(true)
      } catch {
        setSigReady(false)
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Provider profile could not load.')
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  async function generateApplicationPdf() {
    setGenBusy(true)
    try {
      await api.post(`/admin/employees/${id}/vendor-application/generate-pdf`, {})
      toast.success('Application PDF generated and attached.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not generate the application PDF.')
    } finally {
      setGenBusy(false)
    }
  }

  async function saveProfile() {
    setSavingProfile(true)
    try {
      await api.patch(`/admin/employees/${id}/profile`, profile)
      toast.success('Provider details saved.')
      await load()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not save provider details.')
    } finally {
      setSavingProfile(false)
    }
  }

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

  async function saveSignature() {
    if (!id) return
    setSaving(true)
    try {
      await api.post(`/admin/email-signatures/roster/${id}`, {
        person: { name: sigName, title: sigTitle, email: sigEmail, phone: sigPhone },
      })
      toast.success('Branded signature saved.')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not save signature.')
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
  const sso = data.sso_identities || []
  const ssoNames = sso.map((s) => s.label).join(' · ')
  const signInMethod = sso.length
    ? `${ssoNames} SSO${data.has_password ? ' · password' : ''}`
    : data.has_password ? 'Password' : 'No sign-in set yet'
  const subtitle = [e.display_name && e.display_name !== e.full_name ? `Goes by ${e.display_name}` : null, e.vendor_category || e.role_name || e.title, e.email, e.phone].filter(Boolean).join(' · ')

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
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canDispatchPerson(e) && (
              <Link to={networkDispatchHref(p, e.id)} className="btn-gold">Dispatch</Link>
            )}
            {provider && e.provider_code ? <Tag>{e.provider_code}</Tag> : null}
            {sso.length > 0 ? <Tag tone="gold">{sso.length === 1 ? `${sso[0].label} SSO` : 'SSO'}</Tag> : null}
            {e.is_preferred_provider ? <Tag tone="gold"><Star size={12} className="fill-gold" />Preferred</Tag> : null}
          </div>
        }
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
          <div className="space-y-5">
          {provider && (
            <Panel>
              <h2 className="text-sm font-semibold text-white">Provider details</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Correct the provider&apos;s name, how they appear, phone, and what they provide. These are the same fields a provider can self-fill on their review shell.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Full legal name"><input className={inputCls} value={profile.full_name} onChange={(x) => setProfile({ ...profile, full_name: x.target.value })} /></Field>
                <Field label="Display name"><input className={inputCls} value={profile.display_name} onChange={(x) => setProfile({ ...profile, display_name: x.target.value })} placeholder="How they appear" /></Field>
                <Field label="Phone"><input className={inputCls} value={profile.phone} onChange={(x) => setProfile({ ...profile, phone: x.target.value })} placeholder="(555) 123-4567" /></Field>
                <Field label="What they provide"><input className={inputCls} value={profile.vendor_category} onChange={(x) => setProfile({ ...profile, vendor_category: x.target.value })} placeholder="Mobile notary, cleaning…" /></Field>
              </div>
              <button className={`${btnPrimary} mt-4`} disabled={savingProfile} onClick={() => void saveProfile()}><Save size={14} />{savingProfile ? 'Saving…' : 'Save provider details'}</button>
            </Panel>
          )}
          <ApplicationReviewPanel application={data.vendor_application} />
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

          {sigReady && (
            <Panel>
              <h2 className="text-sm font-semibold text-white">Signature</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Name"><input className={inputCls} value={sigName} onChange={(x) => setSigName(x.target.value)} /></Field>
                <Field label="Title"><input className={inputCls} value={sigTitle} onChange={(x) => setSigTitle(x.target.value)} placeholder="Principal, Field vendor…" /></Field>
                <Field label="Email"><input className={inputCls} value={sigEmail} onChange={(x) => setSigEmail(x.target.value)} /></Field>
                <Field label="Phone"><input className={inputCls} value={sigPhone} onChange={(x) => setSigPhone(x.target.value)} /></Field>
              </div>
              <div className="mt-4 overflow-x-auto rounded-xl bg-white p-5">
                <SignaturePreview
                  signature={{
                    id: id,
                    name: sigName || e.email,
                    slug: null,
                    kind: 'personal',
                    html: liveLetterheadHtml('personal', { name: sigName, title: sigTitle, email: sigEmail, phone: sigPhone }),
                    owner_user_id: id,
                    is_default: 0,
                    sort_order: 30,
                  }}
                  html={liveLetterheadHtml('personal', { name: sigName, title: sigTitle, email: sigEmail, phone: sigPhone })}
                />
              </div>
              <button className={`${btnPrimary} mt-4`} disabled={saving || !sigName.trim()} onClick={() => void saveSignature()}><Save size={14} />Save signature</button>
            </Panel>
          )}
          </div>

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
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">Sign-in method</dt>
                  <dd>{signInMethod}{sso.length > 0 && sso[0].last_login_at ? <span className="text-xs text-slate-500"> · last used {new Date(sso[0].last_login_at).toLocaleDateString()}</span> : null}</dd>
                </div>
                <div>
                  <dt className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500">
                    <span>Application &amp; verification files ({data.vendor_documents.length})</span>
                    <button type="button" onClick={() => void generateApplicationPdf()} disabled={genBusy} className="text-[11px] font-semibold normal-case text-gold hover:underline disabled:opacity-50">
                      {genBusy ? 'Generating…' : data.vendor_documents.some((d) => d.document_type === 'application_summary') ? 'Regenerate PDF' : 'Generate application PDF'}
                    </button>
                  </dt>
                  <dd className="mt-1.5 space-y-1">
                    {data.vendor_documents.length === 0 && <p className="text-xs text-slate-500">No files on record yet.</p>}
                    {data.vendor_documents.map((doc) => (
                      <DocRow key={doc.id} employeeId={id} doc={doc} />
                    ))}
                  </dd>
                </div>
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

      {tab === 'credentials' && (
        <CredentialsTab id={id} data={data} reload={load} />
      )}

      {tab === 'dispatch' && (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Dispatch history</h2>
              {!canDispatchPerson(e) && (
                <p className="mt-1 text-xs text-slate-500">Activate this profile before dispatching new work.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {canDispatchPerson(e) && (
                <Link to={networkDispatchHref(p, e.id)} className="btn-gold">Dispatch</Link>
              )}
              <Link to={p('field-work')} className="btn-outline">Open Dispatch Board</Link>
            </div>
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
            <p className="mt-0.5 text-xs text-slate-500">Sign-ins with the network, device, and approximate location captured at login.</p>
            {data.login_history.length ? data.login_history.map((l: any, i: number) => {
              const location = [l.actor_city, l.actor_region, l.actor_country].filter(Boolean).join(', ')
              return (
                <div key={i} className="border-b border-white/[.06] py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-slate-200">{new Date(l.created_at).toLocaleString()}</p>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">{l.action === 'auth0_login' ? 'Auth0 / social' : 'Password'}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {location || 'Location unavailable'}{l.actor_ip ? ` · IP ${l.actor_ip}` : ''}
                  </p>
                  {l.actor_user_agent && <p className="mt-0.5 text-xs text-slate-600">{describeDevice(l.actor_user_agent)}</p>}
                </div>
              )
            }) : <p className="py-6 text-sm text-slate-500">No sign-ins recorded yet. Sign-ins appear here after this provider next logs in.</p>}
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

// The applicant's submitted enrollment answers, shown for staff review.
// Read-only readout built from a fixed field list so nothing unexpected leaks
// and the notary commission is always visible when captured.
function ApplicationReviewPanel({ application }: { application: any }) {
  if (!application) {
    return (
      <Panel>
        <h2 className="text-sm font-semibold text-white">Application review</h2>
        <p className="mt-2 text-sm text-slate-500">No structured application answers on file. This provider may have been added manually or applied before the enrollment questionnaire was captured. Use “Generate application PDF” once answers exist.</p>
      </Panel>
    )
  }
  const val = (v: any): string => Array.isArray(v) ? v.filter(Boolean).join(', ') : v === true ? 'Yes' : v === false ? 'No' : (v ?? '') === '' ? '' : String(v)
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Entity type', value: val(application.entity_type) },
    { label: 'Has EIN', value: val(application.has_ein) },
    { label: 'Business', value: val(application.company_name) },
    { label: 'Service categories', value: val(application.enrollments) },
    { label: 'Service area', value: val(application.service_area) },
    { label: 'Years of experience', value: val(application.years_experience) },
    { label: 'Travel radius', value: val(application.travel_radius) },
    { label: 'Professional license', value: val(application.license_status) },
    { label: 'Insurance', value: val(application.insurance_status) },
    { label: 'Notary commission number', value: val(application.commission_number) },
    { label: 'Commission state', value: val(application.commission_state) },
    { label: 'Commission expiration', value: val(application.commission_expiration) },
    { label: 'RON platform', value: val(application.ron_provider) },
    { label: 'Technology platforms', value: val(application.technology_platforms) },
    { label: 'Accounting credentials', value: val(application.accounting_credentials) },
    { label: 'Other service', value: val(application.other_service) },
    ...Object.entries((application.track_answers && typeof application.track_answers === 'object') ? application.track_answers : {})
      .map(([k, v]) => ({ label: k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), value: val(v) })),
    { label: 'Applicant notes', value: val(application.notes) },
  ].filter((r) => r.value !== '')
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">Application review</h2>
        {application.submitted_at && <span className="text-[11px] text-slate-500">Submitted {new Date(application.submitted_at).toLocaleDateString()}</span>}
      </div>
      <dl className="mt-3 divide-y divide-white/[.06]">
        {rows.map((r) => (
          <div key={r.label} className="grid gap-1 py-2 sm:grid-cols-[180px_1fr]">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">{r.label}</dt>
            <dd className="whitespace-pre-wrap text-sm text-slate-200">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}

// A document row that opens the file in an in-app viewer (modal) with a clear
// Close, instead of navigating away to the raw file with no way back. PDFs and
// images preview inline; anything else offers download. Download and
// open-in-new-tab stay available for staff who want them.
function DocRow({ employeeId, doc }: { employeeId: string; doc: any }) {
  const base = `/api/admin/employees/${employeeId}/vendor-documents/${doc.id}/download`
  const inlineUrl = `${base}?inline=1`
  const type = String(doc.content_type || '')
  const name = String(doc.file_name || 'Document')
  const isPdf = type.includes('pdf') || name.toLowerCase().endsWith('.pdf')
  const isImage = type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(name)
  const label = DOC_LABELS[doc.document_type as ApplicationDocKey] || String(doc.document_type).replace(/_/g, ' ')
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[.02] px-2.5 py-1.5 text-left text-xs text-slate-200 transition hover:border-gold/40 hover:text-gold">
          <span className="truncate">{doc.document_type === 'application_summary' ? '★ ' : ''}{name}</span>
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
        </button>
      </DialogTrigger>
      <DialogContent title={name} description={label} size="full">
        <DocPreview inlineUrl={inlineUrl} base={base} name={name} isPdf={isPdf} isImage={isImage} />
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={base} className={btnPrimary}>Download</a>
          <a href={inlineUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-md border border-white/12 px-3 py-1.5 text-sm font-semibold text-slate-200 transition hover:border-gold/45 hover:text-gold">Open in new tab</a>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Fetches the file as a same-origin blob and previews the blob URL, rather
// than pointing an <iframe>/<img> straight at the /api download route. Two
// reasons: the strict CSP only frames 'self'/blob:, and streaming the bytes
// ourselves lets us show a clean in-app message on failure instead of a bare
// browser/Cloudflare error page. Only mounts (and so only fetches) when the
// dialog is open.
function DocPreview({ inlineUrl, base, name, isPdf, isImage }: { inlineUrl: string; base: string; name: string; isPdf: boolean; isImage: boolean }) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(isPdf || isImage ? 'loading' : 'ready')

  useEffect(() => {
    if (!isPdf && !isImage) return
    let objectUrl = ''
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(inlineUrl, { credentials: 'same-origin' })
        if (!res.ok) throw new Error(String(res.status))
        const blob = await res.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
        setStatus('ready')
      } catch {
        if (!cancelled) setStatus('error')
      }
    })()
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [inlineUrl, isPdf, isImage])

  return (
    <div className="overflow-hidden rounded-md border border-white/10 bg-navy-950">
      {status === 'loading' ? (
        <div className="grid h-[70vh] place-items-center text-sm text-slate-400">Loading preview…</div>
      ) : status === 'error' ? (
        <div className="grid h-[40vh] place-items-center px-6 text-center text-sm text-slate-400">
          <div>
            <p className="font-medium text-slate-300">This document could not be previewed here.</p>
            <p className="mt-1">Use <a href={base} className="font-semibold text-gold hover:underline">Download</a> to open it directly.</p>
          </div>
        </div>
      ) : isPdf ? (
        <iframe title={name} src={url} className="h-[70vh] w-full" />
      ) : isImage ? (
        <img src={url} alt={name} className="mx-auto max-h-[70vh] w-auto object-contain" />
      ) : (
        <div className="p-10 text-center text-sm text-slate-400">This file type cannot preview here. Use Download or Open to view it.</div>
      )}
    </div>
  )
}

// Editable, current provider credentials - insurance, notary, background
// check, tax - plus document management. This is the place to revise details
// over time (e.g. when an insurance carrier or policy changes), separate from
// the immutable submitted application.
const CREDENTIAL_GROUPS: Array<{ title: string; fields: Array<{ key: string; label: string; type?: 'text' | 'date' }> }> = [
  { title: 'General liability insurance', fields: [
    { key: 'insurance_carrier', label: 'Carrier' },
    { key: 'insurance_policy_number', label: 'Policy number' },
    { key: 'insurance_expires_at', label: 'Expires', type: 'date' },
  ] },
  { title: 'Auto insurance', fields: [
    { key: 'auto_insurance_carrier', label: 'Carrier' },
    { key: 'auto_insurance_policy_number', label: 'Policy number' },
    { key: 'auto_insurance_expires_at', label: 'Expires', type: 'date' },
  ] },
  { title: 'Notary commission', fields: [
    { key: 'notary_commission_number', label: 'Commission number' },
    { key: 'notary_state', label: 'State' },
    { key: 'notary_expires_at', label: 'Expires', type: 'date' },
  ] },
  { title: 'E&O / bond', fields: [
    { key: 'eo_bond_provider', label: 'Provider' },
    { key: 'eo_bond_expires_at', label: 'Expires', type: 'date' },
  ] },
  { title: 'Tax', fields: [
    { key: 'ein', label: 'EIN' },
  ] },
]

function CredentialsTab({ id, data, reload }: { id: string; data: Data; reload: () => Promise<void> }) {
  const seed = data.provider_credentials || {}
  const [form, setForm] = useState<Record<string, any>>(() => ({ ...seed }))
  const [saving, setSaving] = useState(false)
  const [uploadType, setUploadType] = useState<ApplicationDocKey>('insurance')
  const [uploadBusy, setUploadBusy] = useState(false)
  const setField = (key: string, value: any) => setForm((cur) => ({ ...cur, [key]: value }))

  async function save() {
    setSaving(true)
    try {
      const payload: Record<string, any> = { w9_on_file: !!form.w9_on_file }
      for (const group of CREDENTIAL_GROUPS) for (const f of group.fields) payload[f.key] = form[f.key] ?? ''
      payload.background_check_status = form.background_check_status ?? ''
      payload.background_check_completed_at = form.background_check_completed_at ?? ''
      payload.notes = form.notes ?? ''
      await api.patch(`/admin/employees/${id}/credentials`, payload)
      toast.success('Credentials saved.')
      await reload()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save credentials.')
    } finally {
      setSaving(false)
    }
  }

  async function uploadDoc(file: File | undefined) {
    if (!file) return
    setUploadBusy(true)
    try {
      await api.upload(`/admin/employees/${id}/vendor-documents?document_type=${encodeURIComponent(uploadType)}`, file)
      toast.success('Document uploaded.')
      await reload()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not upload that document.')
    } finally {
      setUploadBusy(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)]">
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Credentials</h2>
            <p className="mt-0.5 text-xs text-slate-500">The current record. Update these whenever something changes - a renewed policy, a new carrier, a completed background check.</p>
          </div>
          {!data.provider_credentials?.is_saved && <Tag tone="gold">Suggested from application</Tag>}
        </div>
        <div className="mt-4 space-y-5">
          {CREDENTIAL_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-gold">{group.title}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.fields.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <input className={inputCls} type={f.type === 'date' ? 'date' : 'text'} value={form[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)} />
                  </Field>
                ))}
              </div>
            </div>
          ))}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-gold">Background check</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Status">
                <select className={inputCls} value={form.background_check_status ?? ''} onChange={(e) => setField('background_check_status', e.target.value)}>
                  <option value="">Not set</option>
                  <option value="not_started">Not started</option>
                  <option value="pending">Pending</option>
                  <option value="cleared">Cleared</option>
                  <option value="flagged">Flagged</option>
                </select>
              </Field>
              <Field label="Completed"><input className={inputCls} type="date" value={form.background_check_completed_at ?? ''} onChange={(e) => setField('background_check_completed_at', e.target.value)} /></Field>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={!!form.w9_on_file} onChange={(e) => setField('w9_on_file', e.target.checked)} />W-9 on file</label>
          <Field label="Internal notes"><textarea className={`${inputCls} min-h-24`} value={form.notes ?? ''} onChange={(e) => setField('notes', e.target.value)} placeholder="Anything HQ should know about this provider's credentials." /></Field>
          <button className={btnPrimary} disabled={saving} onClick={() => void save()}><Save size={14} />{saving ? 'Saving…' : 'Save credentials'}</button>
        </div>
      </Panel>

      <Panel>
        <h2 className="text-sm font-semibold text-white">Documents</h2>
        <p className="mt-0.5 text-xs text-slate-500">Upload a refreshed file when something changes (e.g. a new insurance certificate). Existing files stay on record.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className={`${inputCls} h-9 flex-1`} value={uploadType} onChange={(e) => setUploadType(e.target.value as ApplicationDocKey)}>
            {(Object.keys(DOC_LABELS) as ApplicationDocKey[]).map((k) => <option key={k} value={k}>{DOC_LABELS[k]}</option>)}
          </select>
          <label className={`${btnPrimary} cursor-pointer ${uploadBusy ? 'opacity-60' : ''}`}>
            {uploadBusy ? 'Uploading…' : 'Upload'}
            <input type="file" className="hidden" accept="application/pdf,image/*" disabled={uploadBusy} onChange={(e) => { void uploadDoc(e.target.files?.[0]); e.currentTarget.value = '' }} />
          </label>
        </div>
        <div className="mt-3 space-y-1">
          {data.vendor_documents.length === 0 && <p className="text-xs text-slate-500">No documents on record.</p>}
          {data.vendor_documents.map((doc: any) => (
            <DocRow key={doc.id} employeeId={id} doc={doc} />
          ))}
        </div>
      </Panel>
    </div>
  )
}

// Compact device summary from a raw user-agent string, for the access log.
function describeDevice(ua: string): string {
  const browser = /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Browser'
  const os = /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS'
  const kind = /Mobi|Android|iPhone/.test(ua) ? 'Mobile' : 'Desktop'
  return `${kind} · ${browser} on ${os}`
}

function Field({ label, children }: { label: string; children: any }) {
  return <label><span className="mb-1.5 block text-xs text-slate-500">{label}</span>{children}</label>
}

function Stat({ label, value }: { label: string; value: any }) {
  return <div className="rounded-xl border border-white/10 p-3"><p className="text-xl font-semibold text-white">{value}</p><p className="text-xs text-slate-500">{label}</p></div>
}
