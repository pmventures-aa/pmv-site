import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Loader2, Plus, MapPin } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, Tag, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { AddressAutocomplete } from '../../components/kit/AddressAutocomplete'
import { useAppPath } from '../../lib/basePath'
import { useLiveRefresh } from '../../lib/liveRefresh'
import { toast } from '../../components/kit/toast'
import { FieldLiveMap, type FieldMapPin } from '../../components/admin/FieldLiveMap'
import { ScopeIntakePicker } from '../../components/admin/ScopeIntakePicker'
import { fieldPrefillFromScope } from '../../../shared/scopeIntakePrefill'
import { composeAddressQuery, isUsefulGeoQuery, type GeoHit } from '../../../shared/geocode'

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
  site_lat?: number | null
  site_lng?: number | null
  scheduled_at: string | null
  client_name: string | null
  vendor_name: string | null
  vendor_user_id: string
  completed_at: string | null
  audit_email_sent_at: string | null
}

type MapPayload = {
  assignments: Array<{
    id: string
    kind: string
    status: string
    title: string | null
    site_label: string | null
    site_address: string | null
    site_lat: number | null
    site_lng: number | null
    depart_lat: number | null
    depart_lng: number | null
    arrival_lat: number | null
    arrival_lng: number | null
    vendor_user_id: string
    vendor_name: string | null
  }>
  agents: Array<{
    user_id: string
    assignment_id: string | null
    lat: number
    lng: number
    updated_at: string
    full_name: string | null
    email: string
  }>
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
  const [searchParams] = useSearchParams()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [mapPins, setMapPins] = useState<FieldMapPin[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(() => searchParams.get('dispatch') === '1')
  const [kindFilter, setKindFilter] = useState<'all' | 'field' | 'ron'>('all')
  const dispatchVendorId = searchParams.get('vendor') || ''

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [res, map] = await Promise.all([
        api.get<{ assignments: Assignment[] }>('/admin/field-assignments'),
        api.get<MapPayload>('/admin/field-map').catch(() => ({ assignments: [], agents: [] } as MapPayload)),
      ])
      setAssignments(res.assignments)
      const pins: FieldMapPin[] = []
      for (const agent of map.agents || []) {
        pins.push({
          id: `agent-${agent.user_id}`,
          kind: 'agent',
          label: agent.full_name || agent.email,
          sublabel: `Updated ${new Date(agent.updated_at.includes('T') ? agent.updated_at : `${agent.updated_at}Z`).toLocaleTimeString()}`,
          lat: agent.lat,
          lng: agent.lng,
          href: agent.assignment_id ? `field-work/${agent.assignment_id}` : undefined,
          stale: Date.now() - Date.parse(agent.updated_at.includes('T') ? agent.updated_at : `${agent.updated_at}Z`) > 15 * 60_000,
        })
      }
      for (const row of map.assignments || []) {
        if (row.site_lat != null && row.site_lng != null) {
          pins.push({
            id: `site-${row.id}`,
            kind: 'site',
            label: row.title || row.site_label || row.site_address || 'Job site',
            sublabel: `${row.status.replace(/_/g, ' ')}${row.vendor_name ? ` · ${row.vendor_name}` : ''}`,
            status: row.status,
            lat: row.site_lat,
            lng: row.site_lng,
            href: `field-work/${row.id}`,
          })
        } else if (row.arrival_lat != null && row.arrival_lng != null) {
          pins.push({
            id: `arrive-${row.id}`,
            kind: 'agent',
            label: row.vendor_name || 'Provider',
            sublabel: 'Last arrival ping',
            lat: row.arrival_lat,
            lng: row.arrival_lng,
            href: `field-work/${row.id}`,
            stale: true,
          })
        }
      }
      setMapPins(pins)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (searchParams.get('dispatch') === '1') setShowCreate(true)
  }, [searchParams])
  const backgroundLoad = useCallback(() => load(true), [load])
  useLiveRefresh(backgroundLoad)

  const filtered = useMemo(() => assignments.filter((a) => kindFilter === 'all' || a.kind === kindFilter), [assignments, kindFilter])

  return (
    <div>
      <PageIntro
        kicker="Field & mobile work"
        title="Field assignments"
        subtitle="Property visits, mobile notary jobs, and Remote Online Notarizations. Live map shows vendor GPS and job sites."
        action={
          <div className="flex flex-wrap gap-2">
            <Link to={p('service-assignments')} className={btnOutline}>Client services</Link>
            <button type="button" onClick={() => setShowCreate((v) => !v)} className={btnPrimary}>
              <Plus size={14} /> New assignment
            </button>
          </div>
        }
      />

      <FieldLiveMap pins={mapPins} className="mb-4" />

      {showCreate && (
        <CreateAssignment
          initialVendorId={dispatchVendorId}
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

function CreateAssignment({ onCreated, onCancel, initialVendorId }: { onCreated: () => void; onCancel: () => void; initialVendorId?: string }) {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [vendors, setVendors] = useState<StaffOption[]>([])
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing')
  const [newClient, setNewClient] = useState({ full_name: '', email: '', phone: '', business_name: '' })
  const [form, setForm] = useState({
    kind: 'field' as 'field' | 'ron',
    service_key: 'mobile_notary',
    client_user_id: '',
    vendor_user_id: initialVendorId || '',
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
  const [geoStatus, setGeoStatus] = useState<'idle' | 'looking' | 'pinned' | 'miss'>('idle')
  const pinnedQueryRef = useRef('')

  useEffect(() => {
    api.get<{ clients: ClientOption[] }>('/admin/clients').then((r) => setClients(r.clients ?? [])).catch(() => {})
    api.get<{ employees: StaffOption[] }>('/admin/employees').then((r) => setVendors(r.employees ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!initialVendorId) return
    setForm((current) => current.vendor_user_id === initialVendorId ? current : { ...current, vendor_user_id: initialVendorId })
  }, [initialVendorId])

  const availableVendors = useMemo(() => {
    const list = vendors.filter((v) => v.party_type === 'vendor')
    if (initialVendorId && !list.some((v) => v.id === initialVendorId)) {
      const extra = vendors.find((v) => v.id === initialVendorId)
      if (extra) return [extra, ...list]
    }
    return list
  }, [vendors, initialVendorId])

  useEffect(() => {
    if (form.kind !== 'field') return
    const query = composeAddressQuery({ line1: form.site_address, city: form.site_city, state: form.site_state, postal: form.site_postal_code })
    if (!isUsefulGeoQuery(query)) {
      setGeoStatus(form.site_lat && form.site_lng ? 'pinned' : 'idle')
      return
    }
    if (pinnedQueryRef.current === query && form.site_lat && form.site_lng) {
      setGeoStatus('pinned')
      return
    }
    let cancelled = false
    setGeoStatus('looking')
    const handle = window.setTimeout(async () => {
      try {
        const data = await api.get<{ results: GeoHit[] }>(`/geo/search?q=${encodeURIComponent(query)}&limit=1`)
        if (cancelled) return
        const hit = data.results?.[0]
        if (!hit) {
          setGeoStatus('miss')
          return
        }
        pinnedQueryRef.current = query
        setForm((current) => {
          const nextLat = String(hit.lat)
          const nextLng = String(hit.lng)
          if (current.site_lat === nextLat && current.site_lng === nextLng) return current
          return { ...current, site_lat: nextLat, site_lng: nextLng }
        })
        setGeoStatus('pinned')
      } catch {
        if (!cancelled) setGeoStatus('miss')
      }
    }, 450)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [form.kind, form.site_address, form.site_city, form.site_state, form.site_postal_code])

  async function submit() {
    if (!form.vendor_user_id || !form.service_key) {
      toast.error('Choose a provider and enter the service.')
      return
    }
    if (clientMode === 'existing' && !form.client_user_id) {
      toast.error('Choose an existing client or add the new caller.')
      return
    }
    if (clientMode === 'new' && (!newClient.full_name.trim() || !newClient.email.trim())) {
      toast.error('Add the new client’s name and email so Pinnacle can create their profile.')
      return
    }
    setSaving(true)
    try {
      let clientUserId = form.client_user_id
      if (clientMode === 'new') {
        const normalizedEmail = newClient.email.trim().toLowerCase()
        const existing = clients.find((client) => client.email.toLowerCase() === normalizedEmail)
        if (existing) {
          clientUserId = existing.id
          toast.success(`${existing.full_name || existing.email} was already in Pinnacle, so this request was connected to that profile.`)
        } else {
          const created = await api.post<{
            user: { id: string; email: string; full_name: string | null }
            email_delivery?: { status: string }
          }>('/admin/account-users', {
            role: 'client',
            full_name: newClient.full_name.trim(),
            email: normalizedEmail,
            phone: newClient.phone.trim() || undefined,
            business_name: newClient.business_name.trim() || undefined,
            services_enrolled: [form.service_key],
          })
          clientUserId = created.user.id
          setClients((current) => [{
            id: created.user.id,
            full_name: created.user.full_name,
            email: created.user.email,
            business_name: newClient.business_name.trim() || null,
          }, ...current])
          const delivery = created.email_delivery?.status
          if (delivery === 'sent' || delivery === 'delivered') {
            toast.success(`Client profile created and secure portal setup sent to ${created.user.email}.`)
          } else {
            toast.success('Client profile created. Portal access can be resent from Users when you are ready.')
          }
        }
        setForm((current) => ({ ...current, client_user_id: clientUserId }))
      }
      await api.post('/admin/field-assignments', {
        ...form,
        client_user_id: clientUserId,
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
      <div className="mb-4">
        <ScopeIntakePicker
          label="Prefill from occupancy / photos / reports"
          onPick={(row) => {
            const prefill = fieldPrefillFromScope(row)
            pinnedQueryRef.current = ''
            setForm((current) => ({
              ...current,
              kind: prefill.kind,
              service_key: prefill.service_key,
              title: prefill.title,
              site_address: prefill.site_address,
              site_city: prefill.site_city,
              site_state: prefill.site_state,
              site_postal_code: prefill.site_postal_code,
              site_lat: '',
              site_lng: '',
              notes: prefill.notes,
              client_user_id: row.reserved_user_id || current.client_user_id,
            }))
            if (!row.reserved_user_id) {
              setClientMode('new')
              setNewClient({
                full_name: prefill.new_client.full_name,
                email: prefill.new_client.email,
                phone: prefill.new_client.phone,
                business_name: '',
              })
            } else {
              setClientMode('existing')
            }
          }}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="mb-1 block text-xs text-slate-400">Assignment kind</span><select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'field' | 'ron', service_key: e.target.value === 'ron' ? 'ron' : form.service_key })}><option value="field">Field visit (Property Management / Mobile Notary)</option><option value="ron">Remote Online Notarization</option></select></label>
        <label><span className="mb-1 block text-xs text-slate-400">Service</span><input className={inputCls} placeholder="e.g. mobile_notary, property_management, ron" value={form.service_key} onChange={(e) => setForm({ ...form, service_key: e.target.value })}/></label>
        <div className="sm:col-span-2 rounded-xl border border-white/10 bg-white/[.018] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><span className="block text-xs font-semibold text-slate-200">Who requested the work?</span><p className="mt-1 text-xs leading-5 text-slate-500">Use a client already in Pinnacle, or create the caller’s profile without leaving this assignment.</p></div>
            <div className="inline-flex w-fit rounded-lg border border-white/10 bg-navy-950/45 p-1">
              <button type="button" onClick={() => setClientMode('existing')} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${clientMode === 'existing' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Existing client</button>
              <button type="button" onClick={() => setClientMode('new')} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${clientMode === 'new' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}>New caller</button>
            </div>
          </div>
          {clientMode === 'existing' ? (
            <label className="mt-4 block"><span className="mb-1 block text-xs text-slate-400">Client profile</span><select className={inputCls} value={form.client_user_id} onChange={(e) => setForm({ ...form, client_user_id: e.target.value })}><option value="">Choose a client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.email}{c.business_name ? `: ${c.business_name}` : ''}</option>)}</select></label>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label><span className="mb-1 block text-xs text-slate-400">Name</span><input className={inputCls} required value={newClient.full_name} onChange={(e) => setNewClient((current) => ({ ...current, full_name: e.target.value }))} placeholder="Caller’s full name" /></label>
              <label><span className="mb-1 block text-xs text-slate-400">Email</span><input className={inputCls} type="email" required value={newClient.email} onChange={(e) => setNewClient((current) => ({ ...current, email: e.target.value }))} placeholder="For their secure client access" /></label>
              <label><span className="mb-1 block text-xs text-slate-400">Phone <span className="text-slate-600">(optional)</span></span><input className={inputCls} type="tel" value={newClient.phone} onChange={(e) => setNewClient((current) => ({ ...current, phone: e.target.value }))} /></label>
              <label><span className="mb-1 block text-xs text-slate-400">Business / property entity <span className="text-slate-600">(optional)</span></span><input className={inputCls} value={newClient.business_name} onChange={(e) => setNewClient((current) => ({ ...current, business_name: e.target.value }))} /></label>
              <p className="text-xs leading-5 text-slate-500 sm:col-span-2">Pinnacle will create the client profile, connect this assignment to it, and send secure portal setup. More details can be added later.</p>
            </div>
          )}
        </div>
        <label><span className="mb-1 block text-xs text-slate-400">Provider</span><select className={inputCls} value={form.vendor_user_id} onChange={(e) => setForm({ ...form, vendor_user_id: e.target.value })}><option value="">Choose a provider…</option>{availableVendors.map((v) => <option key={v.id} value={v.id}>{v.full_name || v.email}{v.vendor_category ? `: ${v.vendor_category}` : ''}</option>)}</select></label>
        <label className="sm:col-span-2"><span className="mb-1 block text-xs text-slate-400">Title</span><input className={inputCls} placeholder='e.g. "Loan signing: Boca Raton office"' value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}/></label>
        <label><span className="mb-1 block text-xs text-slate-400">Scheduled for</span><input className={inputCls} type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}/></label>
        <label><span className="mb-1 block text-xs text-slate-400">Site label (optional)</span><input className={inputCls} placeholder="Client home, conference room…" value={form.site_label} onChange={(e) => setForm({ ...form, site_label: e.target.value })}/></label>
        {form.kind === 'field' && <div className="sm:col-span-2 space-y-3"><div><span className="mb-1 block text-xs text-slate-400">Site address</span><AddressAutocomplete value={form.site_address} inputClassName={inputCls} onChange={(line1) => { pinnedQueryRef.current = ''; setForm({ ...form, site_address: line1, site_lat: '', site_lng: '' }) }} onSelect={(address) => { const next = { ...form, site_address: address.line1, site_city: address.city || form.site_city, site_state: address.state || form.site_state, site_postal_code: address.postal_code || form.site_postal_code, site_lat: address.lat != null ? String(address.lat) : '', site_lng: address.lng != null ? String(address.lng) : '' }; pinnedQueryRef.current = composeAddressQuery({ line1: next.site_address, city: next.site_city, state: next.site_state, postal: next.site_postal_code }); setGeoStatus(next.site_lat && next.site_lng ? 'pinned' : 'looking'); setForm(next) }}/></div><div className="grid gap-3 sm:grid-cols-3"><label><span className="mb-1 block text-xs text-slate-400">City</span><input className={inputCls} value={form.site_city} onChange={(e) => { pinnedQueryRef.current = ''; setForm({ ...form, site_city: e.target.value, site_lat: '', site_lng: '' }) }}/></label><label><span className="mb-1 block text-xs text-slate-400">State</span><input className={inputCls} value={form.site_state} onChange={(e) => { pinnedQueryRef.current = ''; setForm({ ...form, site_state: e.target.value, site_lat: '', site_lng: '' }) }}/></label><label><span className="mb-1 block text-xs text-slate-400">Postal code</span><input className={inputCls} value={form.site_postal_code} onChange={(e) => { pinnedQueryRef.current = ''; setForm({ ...form, site_postal_code: e.target.value, site_lat: '', site_lng: '' }) }}/></label></div>
          {geoStatus === 'looking' && <p className="flex items-center gap-1 text-xs text-slate-500"><Loader2 size={12} className="animate-spin"/> Looking up the map pin from this address…</p>}
          {geoStatus === 'pinned' && form.site_lat && form.site_lng && <p className="flex items-center gap-1 text-xs text-emerald-300"><MapPin size={12}/> Map pin set from address ({Number(form.site_lat).toFixed(5)}, {Number(form.site_lng).toFixed(5)}). Vendor phones auto-arrive within 150 m.</p>}
          {geoStatus === 'miss' && <p className="flex items-center gap-1 text-xs text-slate-500"><MapPin size={12}/> No pin yet. Pick an address from the suggestions so the live map and auto-arrive can use it.</p>}
          {geoStatus === 'idle' && <p className="flex items-center gap-1 text-xs text-slate-500"><MapPin size={12}/> Start typing a street address. The map pin fills in from the public address database.</p>}</div>}
        <label className="sm:col-span-2"><span className="mb-1 block text-xs text-slate-400">Notes for the provider (optional)</span><textarea className={`${inputCls} min-h-20`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}/></label>
      </div>
      <div className="mt-4 flex gap-2"><button type="button" onClick={onCancel} className={btnOutline}>Cancel</button><button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} disabled:opacity-60`}>{saving ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>} Create assignment</button></div>
    </Panel>
  )
}
