import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Plus, MapPin } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, Tag, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { AddressAutocomplete } from '../../components/kit/AddressAutocomplete'
import { useAppPath } from '../../lib/basePath'
import { useLiveRefresh } from '../../lib/liveRefresh'
import { toast } from '../../components/kit/toast'

interface StaffOption { id: string; full_name: string | null; email: string; party_type: string | null; vendor_category: string | null }
interface ClientOption { id: string; full_name: string | null; email: string; business_name: string | null }

interface Assignment {
  id: string
  kind: 'field' | 'ron'
  service_key: string
  status: string
  title: string | null
  site_label: string | null
  site_address: string | null
  scheduled_at: string | null
  client_name: string | null
  vendor_name: string | null
  vendor_user_id: string
  completed_at: string | null
  audit_email_sent_at: string | null
}

function toneFor(status: string) {
  switch (status) {
    case 'completed': return 'green' as const
    case 'cancelled': return 'slate' as const
    case 'assigned': return 'gold' as const
    default: return 'blue' as const
  }
}

const KIND_LABEL = { field: 'Field visit', ron: 'RON session' } as const

export default function FieldWorkAdmin() {
  const p = useAppPath()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [kindFilter, setKindFilter] = useState<'all' | 'field' | 'ron'>('all')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await api.get<{ assignments: Assignment[] }>('/admin/field-assignments')
      setAssignments(res.assignments)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  const backgroundLoad = useCallback(() => load(true), [load])
  useLiveRefresh(backgroundLoad)

  const filtered = useMemo(() => assignments.filter((a) => kindFilter === 'all' || a.kind === kindFilter), [assignments, kindFilter])

  return (
    <div>
      <PageIntro
        kicker="Field & mobile work"
        title="Field assignments"
        subtitle="Property visits, mobile notary jobs, and Remote Online Notarizations across your professional network."
        action={
          <button type="button" onClick={() => setShowCreate((v) => !v)} className={btnPrimary}>
            <Plus size={14} /> New assignment
          </button>
        }
      />

      {showCreate && (
        <CreateAssignment
          onCreated={() => { setShowCreate(false); void load() }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div className="mb-4 flex gap-2">
        {(['all', 'field', 'ron'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKindFilter(k)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${kindFilter === k ? 'border-gold/50 bg-gold/10 text-gold' : 'border-white/10 text-slate-300 hover:border-white/25'}`}
          >
            {k === 'all' ? 'All' : k === 'field' ? 'Field visits' : 'RON'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <Panel><EmptyState label="No assignments yet." /></Panel>
      ) : (
        <Panel className="divide-y divide-white/5 !p-0">
          {filtered.map((a) => (
            <Link
              key={a.id}
              to={p(`field-work/${a.id}`)}
              className="block px-5 py-4 transition hover:bg-white/[.03]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag tone={toneFor(a.status)}>{a.status.replace(/_/g, ' ')}</Tag>
                    <Tag tone="slate">{KIND_LABEL[a.kind]}</Tag>
                    {a.audit_email_sent_at && <Tag tone="green">Audit sent</Tag>}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-white">{a.title || a.service_key.replace(/_/g, ' ')}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {a.site_label ? `${a.site_label}: ` : ''}{a.site_address || 'Not provided'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Client: <span className="text-slate-300">{a.client_name || 'Not provided'}</span>
                    &nbsp;·&nbsp; Provider: <span className="text-slate-300">{a.vendor_name || 'Not provided'}</span>
                  </p>
                </div>
                {a.scheduled_at && (
                  <span className="shrink-0 text-xs text-slate-500">{new Date(a.scheduled_at).toLocaleString()}</span>
                )}
              </div>
            </Link>
          ))}
        </Panel>
      )}
    </div>
  )
}

function CreateAssignment({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [vendors, setVendors] = useState<StaffOption[]>([])
  const [form, setForm] = useState({
    kind: 'field' as 'field' | 'ron',
    service_key: 'mobile_notary',
    client_user_id: '',
    vendor_user_id: '',
    title: '',
    site_label: '',
    site_address: '',
    site_city: '',
    site_state: '',
    site_postal_code: '',
    site_lat: '' as string,
    site_lng: '' as string,
    scheduled_at: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<{ clients: ClientOption[] }>('/admin/clients').then((r) => setClients(r.clients ?? [])).catch(() => {})
    api.get<{ employees: StaffOption[] }>('/admin/employees').then((r) => setVendors(r.employees ?? [])).catch(() => {})
  }, [])

  const availableVendors = useMemo(() => vendors.filter((v) => v.party_type === 'vendor'), [vendors])

  async function submit() {
    if (!form.client_user_id || !form.vendor_user_id || !form.service_key) {
      toast.error('Choose a client, a provider, and a service.')
      return
    }
    setSaving(true)
    try {
      await api.post('/admin/field-assignments', {
        ...form,
        site_lat: form.site_lat ? Number(form.site_lat) : null,
        site_lng: form.site_lng ? Number(form.site_lng) : null,
        scheduled_at: form.scheduled_at || null,
      })
      toast.success('Assignment created.')
      onCreated()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create assignment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel className="mb-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="mb-1 block text-xs text-slate-400">Assignment kind</span><select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'field' | 'ron', service_key: e.target.value === 'ron' ? 'ron' : form.service_key })}><option value="field">Field visit (Property Management / Mobile Notary)</option><option value="ron">Remote Online Notarization</option></select></label>
        <label><span className="mb-1 block text-xs text-slate-400">Service</span><input className={inputCls} placeholder="e.g. mobile_notary, property_management, ron" value={form.service_key} onChange={(e) => setForm({ ...form, service_key: e.target.value })}/></label>
        <label><span className="mb-1 block text-xs text-slate-400">Client</span><select className={inputCls} value={form.client_user_id} onChange={(e) => setForm({ ...form, client_user_id: e.target.value })}><option value="">Choose a client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.email}{c.business_name ? `: ${c.business_name}` : ''}</option>)}</select></label>
        <label><span className="mb-1 block text-xs text-slate-400">Provider</span><select className={inputCls} value={form.vendor_user_id} onChange={(e) => setForm({ ...form, vendor_user_id: e.target.value })}><option value="">Choose a provider…</option>{availableVendors.map((v) => <option key={v.id} value={v.id}>{v.full_name || v.email}{v.vendor_category ? `: ${v.vendor_category}` : ''}</option>)}</select></label>
        <label className="sm:col-span-2"><span className="mb-1 block text-xs text-slate-400">Title</span><input className={inputCls} placeholder='e.g. "Loan signing: Boca Raton office"' value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}/></label>
        <label><span className="mb-1 block text-xs text-slate-400">Scheduled for</span><input className={inputCls} type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}/></label>
        <label><span className="mb-1 block text-xs text-slate-400">Site label (optional)</span><input className={inputCls} placeholder="Client home, conference room…" value={form.site_label} onChange={(e) => setForm({ ...form, site_label: e.target.value })}/></label>
        {form.kind === 'field' && <div className="sm:col-span-2 space-y-3"><div><span className="mb-1 block text-xs text-slate-400">Site address</span><AddressAutocomplete value={form.site_address} inputClassName={inputCls} onChange={(line1) => setForm({ ...form, site_address: line1 })} onSelect={(address) => setForm({ ...form, site_address: address.line1, site_city: address.city || form.site_city, site_state: address.state || form.site_state, site_postal_code: address.postal_code || form.site_postal_code })}/></div><div className="grid gap-3 sm:grid-cols-3"><label><span className="mb-1 block text-xs text-slate-400">City</span><input className={inputCls} value={form.site_city} onChange={(e) => setForm({ ...form, site_city: e.target.value })}/></label><label><span className="mb-1 block text-xs text-slate-400">State</span><input className={inputCls} value={form.site_state} onChange={(e) => setForm({ ...form, site_state: e.target.value })}/></label><label><span className="mb-1 block text-xs text-slate-400">Postal code</span><input className={inputCls} value={form.site_postal_code} onChange={(e) => setForm({ ...form, site_postal_code: e.target.value })}/></label></div><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs text-slate-400">Site latitude (optional)</span><input className={inputCls} type="number" step="0.00001" value={form.site_lat} onChange={(e) => setForm({ ...form, site_lat: e.target.value })}/></label><label><span className="mb-1 block text-xs text-slate-400">Site longitude (optional)</span><input className={inputCls} type="number" step="0.00001" value={form.site_lng} onChange={(e) => setForm({ ...form, site_lng: e.target.value })}/></label></div><p className="text-xs text-slate-500 flex items-center gap-1"><MapPin size={12}/> With lat/lng set, the vendor's phone will auto-mark them "on site" when they arrive within 150 m.</p></div>}
        <label className="sm:col-span-2"><span className="mb-1 block text-xs text-slate-400">Notes for the provider (optional)</span><textarea className={`${inputCls} min-h-20`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}/></label>
      </div>
      <div className="mt-4 flex gap-2"><button type="button" onClick={onCancel} className={btnOutline}>Cancel</button><button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} disabled:opacity-60`}>{saving ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>} Create assignment</button></div>
    </Panel>
  )
}
