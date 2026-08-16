import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Check, DoorOpen, Loader2, Plus, Trash2 } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, Tag, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { useAppPath } from '../../lib/basePath'
import { strPackageLabel, strPlatformLabel, turnoverStatusLabel, turnoverStatusTone, money } from '../../../shared/strWorkspace'

interface PropertyRow {
  property_id: string
  nickname: string | null
  platform: string | null
  bedrooms: number | null
  max_guests: number | null
  address: string
  client_name: string | null
  client_business: string | null
  primary_provider_name: string | null
  package_name: string | null
  service_package_key: string | null
  supply_tracking_enabled: number
  auto_create_turnovers: number
  active_turnovers: number
  active: number
}

interface PropertyDetail {
  profile: any
  property: any
  supplies: any[]
  access: any[]
  reservation_calendars: any[]
  turnovers: any[]
}

interface PickerProperty { id: string; address: string; name: string | null; client_name: string | null; client_business: string | null; has_str_profile: number }
interface StaffOption { id: string; full_name: string | null; email: string }
interface PackageRow { key: string; name: string; active: number }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  )
}

export default function StrPropertyAdmin() {
  const p = useAppPath()
  const [rows, setRows] = useState<PropertyRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<PropertyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [picker, setPicker] = useState<PickerProperty[]>([])
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [packages, setPackages] = useState<PackageRow[]>([])
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [res, pickerRes, staffRes, pkgRes] = await Promise.all([
        api.get<{ properties: PropertyRow[] }>('/admin/str/properties'),
        api.get<{ properties: PickerProperty[] }>('/admin/str/property-picker'),
        api.get<{ staff: StaffOption[] }>('/admin/staff-directory'),
        api.get<{ packages: PackageRow[] }>('/admin/str/packages'),
      ])
      setRows(res.properties)
      setPicker(pickerRes.properties)
      setStaff(staffRes.staff)
      setPackages(pkgRes.packages)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load STR properties.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const select = useCallback(async (id: string) => {
    setSelectedId(id)
    setDetailLoading(true)
    try {
      const res = await api.get<PropertyDetail>(`/admin/str/properties/${id}`)
      setDetail(res)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load the property.')
      setSelectedId(null)
    } finally { setDetailLoading(false) }
  }, [])

  async function saveProfile(payload: Record<string, unknown>) {
    if (!selectedId) return
    try {
      await api.patch(`/admin/str/properties/${selectedId}`, payload)
      toast.success('Property profile updated.')
      await select(selectedId)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the property.')
    }
  }

  return (
    <div>
      <PageIntro
        kicker="STR Turnover & Property Support"
        title="STR Properties"
        subtitle="Property profiles, secure access credentials, supplies, and reservation feeds."
        action={<button type="button" className={btnPrimary} onClick={() => setCreateOpen(true)}><Plus size={14} /> New STR profile</button>}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel className="!p-0 lg:self-start">
          {loading && rows.length === 0 ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-md bg-white/[.05]" />)}</div>
          ) : rows.length === 0 ? (
            <div className="p-4"><EmptyState label="No STR properties yet. Create the first profile to get started." /></div>
          ) : (
            <ul className="divide-y divide-white/[.07]">
              {rows.map((row) => (
                <li key={row.property_id}>
                  <button type="button" onClick={() => select(row.property_id)} className={`block w-full px-4 py-3 text-left hover:bg-white/[.025] ${selectedId === row.property_id ? 'bg-gold/[.06]' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-white">{row.nickname || row.address}</p>
                      {row.active === 0 && <Tag tone="slate">Inactive</Tag>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {row.address} · {row.client_business || row.client_name || 'Client'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {row.bedrooms != null ? `${row.bedrooms} BR` : ''}{row.max_guests != null ? ` · ${row.max_guests} guests` : ''}{row.platform ? ` · ${strPlatformLabel(row.platform)}` : ''}
                      {row.active_turnovers > 0 ? ` · ${row.active_turnovers} active` : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="min-w-0">
          {detailLoading ? (
            <Panel><p className="text-sm text-slate-400">Loading property…</p></Panel>
          ) : detail ? (
            <PropertyPanel
              key={detail.property.id}
              detail={detail}
              staff={staff}
              packages={packages}
              p={p}
              onRefresh={async () => { if (selectedId) await select(selectedId) }}
            />
          ) : (
            <Panel><EmptyState label="Select a property on the left to manage its profile, access, supplies, and calendars." /></Panel>
          )}
        </div>
      </div>

      {createOpen && (
        <CreateProfileModal
          picker={picker}
          staff={staff}
          packages={packages}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => { setCreateOpen(false); void load(); void select(id) }}
        />
      )}
    </div>
  )
}

function PropertyPanel({ detail, staff, packages, p, onRefresh }: {
  detail: PropertyDetail
  staff: StaffOption[]
  packages: PackageRow[]
  p: (path: string) => string
  onRefresh: () => Promise<void>
}) {
  const profile = detail.profile
  const [form, setForm] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const [accessLabel, setAccessLabel] = useState('')
  const [accessForm, setAccessForm] = useState<Record<string, string>>({})
  const [supplyName, setSupplyName] = useState('')
  const [supplyPar, setSupplyPar] = useState('3')
  const [supplyStock, setSupplyStock] = useState('3')
  const [calUrl, setCalUrl] = useState('')
  const [calPlatform, setCalPlatform] = useState('airbnb')

  const val = (k: string, fallback = '') => (form[k] ?? fallback)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    setForm({
      nickname: profile.nickname ?? '',
      platform: profile.platform ?? '',
      platform_url: profile.platform_url ?? '',
      bedrooms: profile.bedrooms?.toString() ?? '',
      bathrooms: profile.bathrooms ?? '',
      max_guests: profile.max_guests?.toString() ?? '',
      checkout_time: profile.checkout_time ?? '11:00',
      checkin_time: profile.checkin_time ?? '16:00',
      turnover_window_minutes: profile.turnover_window_minutes?.toString() ?? '180',
      access_instructions: profile.access_instructions ?? '',
      building_entry: profile.building_entry ?? '',
      parking: profile.parking ?? '',
      supplies_notes: profile.supplies_notes ?? '',
      staging_notes: profile.staging_notes ?? '',
      primary_provider_user_id: profile.primary_provider_user_id ?? '',
      service_package_key: profile.service_package_key ?? 'guest_ready',
    })
  }, [profile])

  async function save() {
    setSaveBusy(true)
    try {
      const payload: Record<string, unknown> = {
        nickname: val('nickname') || null,
        platform: val('platform') || null,
        platform_url: val('platform_url') || null,
        bedrooms: val('bedrooms') ? Number(val('bedrooms')) : null,
        bathrooms: val('bathrooms') || null,
        max_guests: val('max_guests') ? Number(val('max_guests')) : null,
        checkout_time: val('checkout_time') || null,
        checkin_time: val('checkin_time') || null,
        turnover_window_minutes: val('turnover_window_minutes') ? Number(val('turnover_window_minutes')) : undefined,
        access_instructions: val('access_instructions') || null,
        building_entry: val('building_entry') || null,
        parking: val('parking') || null,
        supplies_notes: val('supplies_notes') || null,
        staging_notes: val('staging_notes') || null,
        primary_provider_user_id: val('primary_provider_user_id') || null,
        service_package_key: val('service_package_key') || null,
      }
      await api.patch(`/admin/str/properties/${detail.property.id}`, payload)
      toast.success('Profile saved.')
      await onRefresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the profile.')
    } finally { setSaveBusy(false) }
  }

  async function toggle(key: string, current: number) {
    setBusy(`tog-${key}`)
    try {
      await api.patch(`/admin/str/properties/${detail.property.id}`, { [key]: current === 1 ? false : true })
      toast.success('Updated.')
      await onRefresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the setting.')
    } finally { setBusy(null) }
  }

  async function addAccess() {
    if (!accessLabel) return
    setBusy('access')
    try {
      await api.post(`/admin/str/properties/${detail.property.id}/access`, {
        label: accessLabel,
        entry_method: accessForm.entry_method || undefined,
        code_value: accessForm.code_value || undefined,
        lockbox_location: accessForm.lockbox_location || undefined,
        instructions: accessForm.instructions || undefined,
      })
      toast.success('Access credential saved.')
      setAccessLabel(''); setAccessForm({})
      await onRefresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the credential.')
    } finally { setBusy(null) }
  }

  async function deleteAccess(id: string) {
    if (!window.confirm('Delete this access credential?')) return
    setBusy(`acc-${id}`)
    try {
      await api.del(`/admin/str/properties/${detail.property.id}/access/${id}`)
      await onRefresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete the credential.')
    } finally { setBusy(null) }
  }

  async function addSupply() {
    if (!supplyName) return
    setBusy('supply')
    try {
      await api.post(`/admin/str/properties/${detail.property.id}/supplies`, {
        name: supplyName, par_level: Number(supplyPar) || 1, stock: Number(supplyStock) || 0,
      })
      toast.success('Supply added.')
      setSupplyName('')
      await onRefresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add the supply.')
    } finally { setBusy(null) }
  }

  async function saveSupply(id: string, stock: number) {
    setBusy(`sup-${id}`)
    try {
      await api.patch(`/admin/str/properties/${detail.property.id}/supplies/${id}`, { stock })
      await onRefresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the supply.')
    } finally { setBusy(null) }
  }

  async function addCalendar() {
    if (!calUrl) return
    setBusy('cal')
    try {
      await api.post(`/admin/str/properties/${detail.property.id}/reservation-calendars`, { ical_url: calUrl, platform: calPlatform })
      toast.success('Calendar added. Run a sync to import reservations.')
      setCalUrl('')
      await onRefresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add the calendar.')
    } finally { setBusy(null) }
  }

  async function syncCalendar(id: string) {
    setBusy(`sync-${id}`)
    try {
      const res = await api.post<{ ok: boolean; events_found: number; created_turnovers: number; updated: number }>(`/admin/str/reservation-calendars/${id}/sync`)
      toast.success(`Synced — ${res.events_found} reservations${res.created_turnovers ? `, ${res.created_turnovers} turnover(s) auto-created` : ''}.`)
      await onRefresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Sync failed.')
    } finally { setBusy(null) }
  }

  async function toggleCalendar(id: string, enabled: number) {
    setBusy(`cal-${id}`)
    try {
      await api.patch(`/admin/str/reservation-calendars/${id}`, { enabled: enabled === 1 ? false : true })
      await onRefresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the calendar.')
    } finally { setBusy(null) }
  }

  async function deleteCalendar(id: string) {
    if (!window.confirm('Remove this calendar feed?')) return
    setBusy(`caldel-${id}`)
    try {
      await api.del(`/admin/str/reservation-calendars/${id}`)
      await onRefresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove the calendar.')
    } finally { setBusy(null) }
  }

  const clientName = detail.property.name || detail.property.address
  const requiredPhotos: string[] = Array.isArray(profile.required_completion_photos_json) ? profile.required_completion_photos_json : []

  return (
    <div className="space-y-4">
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold/85">STR property</p>
              <h2 className="mt-1 text-lg font-bold text-white">{profile.nickname || detail.property.address}</h2>
              <p className="mt-0.5 text-xs text-slate-400">{detail.property.address}{detail.property.city ? `, ${detail.property.city}` : ''}{detail.property.state ? ` ${detail.property.state}` : ''} · {detail.property.client_user_id ? clientName : 'No client linked'}</p>
            </div>
          </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btnOutline} disabled={busy !== null} onClick={() => toggle('active', profile.active)}>{profile.active === 1 ? 'Deactivate' : 'Activate'} profile</button>
          <button type="button" className={btnOutline} disabled={busy !== null} onClick={() => toggle('supply_tracking_enabled', profile.supply_tracking_enabled)}>{profile.supply_tracking_enabled === 1 ? 'Disable' : 'Enable'} supply tracking</button>
          <button type="button" className={btnOutline} disabled={busy !== null} onClick={() => toggle('priority_dispatch', profile.priority_dispatch)}>{profile.priority_dispatch === 1 ? 'Remove' : 'Set'} priority dispatch</button>
          <button type="button" className={btnOutline} disabled={busy !== null} onClick={() => toggle('auto_create_turnovers', profile.auto_create_turnovers)}>{profile.auto_create_turnovers === 1 ? 'Disable' : 'Enable'} auto-create from reservations</button>
        </div>
      </Panel>

      <Panel>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Profile</p>
          <button type="button" className={btnPrimary} disabled={saveBusy} onClick={save}>{saveBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save profile</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nickname"><input className={inputCls} value={val('nickname')} onChange={(e) => set('nickname', e.target.value)} placeholder="e.g. Seaspray Unit 3" /></Field>
          <Field label="Platform"><select className={inputCls} value={val('platform')} onChange={(e) => set('platform', e.target.value)}><option value="">None</option><option value="airbnb">Airbnb</option><option value="vrbo">VRBO</option><option value="other">Other</option><option value="multiple">Multiple</option></select></Field>
          <Field label="Platform URL"><input className={inputCls} value={val('platform_url')} onChange={(e) => set('platform_url', e.target.value)} /></Field>
          <Field label="Bedrooms"><input type="number" min={0} className={inputCls} value={val('bedrooms')} onChange={(e) => set('bedrooms', e.target.value)} /></Field>
          <Field label="Bathrooms"><input className={inputCls} value={val('bathrooms')} onChange={(e) => set('bathrooms', e.target.value)} placeholder="e.g. 2.5" /></Field>
          <Field label="Max guests"><input type="number" min={1} className={inputCls} value={val('max_guests')} onChange={(e) => set('max_guests', e.target.value)} /></Field>
          <Field label="Checkout time"><input type="time" className={inputCls} value={val('checkout_time')} onChange={(e) => set('checkout_time', e.target.value)} /></Field>
          <Field label="Check-in time"><input type="time" className={inputCls} value={val('checkin_time')} onChange={(e) => set('checkin_time', e.target.value)} /></Field>
          <Field label="Turnover window (minutes)"><input type="number" min={30} max={720} className={inputCls} value={val('turnover_window_minutes')} onChange={(e) => set('turnover_window_minutes', e.target.value)} /></Field>
          <Field label="Service package"><select className={inputCls} value={val('service_package_key')} onChange={(e) => set('service_package_key', e.target.value)}>{packages.map((pk) => <option key={pk.key} value={pk.key}>{pk.name}</option>)}</select></Field>
          <Field label="Primary provider"><select className={inputCls} value={val('primary_provider_user_id')} onChange={(e) => set('primary_provider_user_id', e.target.value)}><option value="">None</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}</select></Field>
          <Field label="Required completion photos"><input className={inputCls} value={requiredPhotos.join(', ')} readOnly aria-label="Required completion photos" /></Field>
          <Field label="Access instructions"><input className={inputCls} value={val('access_instructions')} onChange={(e) => set('access_instructions', e.target.value)} /></Field>
          <Field label="Building entry"><input className={inputCls} value={val('building_entry')} onChange={(e) => set('building_entry', e.target.value)} /></Field>
          <Field label="Parking"><input className={inputCls} value={val('parking')} onChange={(e) => set('parking', e.target.value)} /></Field>
          <Field label="Supplies notes"><input className={inputCls} value={val('supplies_notes')} onChange={(e) => set('supplies_notes', e.target.value)} /></Field>
          <Field label="Staging notes"><input className={inputCls} value={val('staging_notes')} onChange={(e) => set('staging_notes', e.target.value)} /></Field>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Secure access credentials</p>
          <p className="mt-1 text-[11px] text-slate-500">Only shown to assigned providers and HQ. Never client-visible.</p>
          <div className="mt-2 space-y-1.5">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <input className={inputCls} placeholder="Label (e.g. Front door keypad)" value={accessLabel} onChange={(e) => setAccessLabel(e.target.value)} />
              <input className={inputCls} placeholder="Entry method (e.g. Keypad)" value={accessForm.entry_method ?? ''} onChange={(e) => setAccessForm((f) => ({ ...f, entry_method: e.target.value }))} />
              <input className={inputCls} placeholder="Code / value" value={accessForm.code_value ?? ''} onChange={(e) => setAccessForm((f) => ({ ...f, code_value: e.target.value }))} />
              <input className={inputCls} placeholder="Lockbox location" value={accessForm.lockbox_location ?? ''} onChange={(e) => setAccessForm((f) => ({ ...f, lockbox_location: e.target.value }))} />
            </div>
            <input className={inputCls} placeholder="Instructions (optional)" value={accessForm.instructions ?? ''} onChange={(e) => setAccessForm((f) => ({ ...f, instructions: e.target.value }))} />
            <button type="button" className={btnPrimary} disabled={busy === 'access' || !accessLabel} onClick={addAccess}>{busy === 'access' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add credential</button>
          </div>
          {detail.access.length > 0 && (
            <ul className="mt-3 divide-y divide-white/[.06]">
              {detail.access.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-200">{a.label}</p>
                    <p className="text-xs text-slate-500">{a.entry_method}{a.code_value ? ` · ${a.code_value}` : ''}{a.lockbox_location ? ` · ${a.lockbox_location}` : ''}</p>
                  </div>
                  <button type="button" onClick={() => deleteAccess(a.id)} className="text-slate-500 hover:text-red-400" aria-label={`Delete ${a.label}`}><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Supplies</p>
          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_5rem_5rem_auto]">
            <input className={inputCls} placeholder="Item (e.g. Toilet paper)" value={supplyName} onChange={(e) => setSupplyName(e.target.value)} />
            <input className={inputCls} type="number" min={1} placeholder="Par" aria-label="Par level" value={supplyPar} onChange={(e) => setSupplyPar(e.target.value)} />
            <input className={inputCls} type="number" min={0} placeholder="Stock" aria-label="Current stock" value={supplyStock} onChange={(e) => setSupplyStock(e.target.value)} />
            <button type="button" className={btnPrimary} disabled={busy === 'supply' || !supplyName} onClick={addSupply}><Plus size={14} /> Add</button>
          </div>
          {detail.supplies.length > 0 && (
            <ul className="mt-3 divide-y divide-white/[.06]">
              {detail.supplies.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-slate-200">{s.name} <span className="text-xs text-slate-500">· par {s.par_level}</span></span>
                  <span className="flex items-center gap-2">
                    <input type="number" min={0} className={`${inputCls} !min-h-8 !w-16`} defaultValue={s.stock} aria-label={`Stock for ${s.name}`} onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== Number(s.stock)) void saveSupply(s.id, v) }} />
                    <Tag tone={s.stock <= 0 ? 'red' : s.stock < s.par_level ? 'gold' : 'green'}>{s.stock <= 0 ? 'Out' : s.stock < s.par_level ? 'Low' : 'Good'}</Tag>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel>
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Reservation feeds (iCal)</p>
        <p className="mt-1 text-[11px] text-slate-500">Connect an Airbnb/VRBO iCal URL. Syncing imports guest windows; auto-create builds turnovers when enabled on the profile.</p>
        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
          <input className={inputCls} placeholder="https://www.airbnb.com/calendar/ical/…" value={calUrl} onChange={(e) => setCalUrl(e.target.value)} />
          <select className={inputCls} value={calPlatform} onChange={(e) => setCalPlatform(e.target.value)}><option value="airbnb">Airbnb</option><option value="vrbo">VRBO</option><option value="other">Other</option></select>
          <button type="button" className={btnPrimary} disabled={busy === 'cal' || !calUrl} onClick={addCalendar}><Plus size={14} /> Add feed</button>
        </div>
        {detail.reservation_calendars.length > 0 && (
          <ul className="mt-3 divide-y divide-white/[.06]">
            {detail.reservation_calendars.map((cal) => (
              <li key={cal.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-slate-200">{strPlatformLabel(cal.platform)} {cal.enabled === 0 && <Tag tone="slate">Paused</Tag>}</p>
                  <p className="truncate text-xs text-slate-500">{cal.ical_url}{cal.last_synced_at ? ` · last synced ${cal.last_synced_at}` : ' · never synced'}</p>
                </div>
                <span className="flex items-center gap-2">
                  <button type="button" className={btnOutline} disabled={busy !== null} onClick={() => toggleCalendar(cal.id, cal.enabled)}>{cal.enabled === 1 ? 'Pause' : 'Resume'}</button>
                  <button type="button" className={btnOutline} disabled={busy !== null} onClick={() => syncCalendar(cal.id)}>{busy === `sync-${cal.id}` ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} Sync now</button>
                  <button type="button" className="text-slate-500 hover:text-red-400" onClick={() => deleteCalendar(cal.id)} aria-label="Remove feed"><Trash2 size={14} /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {detail.turnovers.length > 0 && (
        <Panel className="!p-0">
          <p className="px-4 pt-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Recent turnovers</p>
          <ul className="divide-y divide-white/[.07]">
            {detail.turnovers.map((t) => (
              <li key={t.id}>
                <Link to={p(`str/turnovers/${t.id}`)} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-white/[.025]">
                  <span className="text-slate-200">{t.turnover_date}{t.provider_name ? ` · ${t.provider_name}` : ''}</span>
                  <span className="flex items-center gap-2">
                    <Tag tone={turnoverStatusTone(t.status)}>{turnoverStatusLabel(t.status)}</Tag>
                    <span className="text-xs tabular-nums text-slate-500">{money(t.client_charge_cents)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}

function CreateProfileModal({ picker, staff, packages, onClose, onCreated }: {
  picker: PickerProperty[]
  staff: StaffOption[]
  packages: PackageRow[]
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [form, setForm] = useState<Record<string, string>>({
    property_id: '', platform: 'airbnb', bedrooms: '', checkout_time: '11:00', checkin_time: '16:00',
    turnover_window_minutes: '180', service_package_key: 'guest_ready', primary_provider_user_id: '',
  })
  const [busy, setBusy] = useState(false)
  const eligible = picker.filter((pr) => pr.has_str_profile === 0)

  async function submit() {
    if (!form.property_id) return
    setBusy(true)
    try {
      const res = await api.post<{ ok: boolean; property_id: string }>('/admin/str/properties', {
        property_id: form.property_id,
        platform: form.platform || undefined,
        bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
        checkout_time: form.checkout_time || undefined,
        checkin_time: form.checkin_time || undefined,
        turnover_window_minutes: form.turnover_window_minutes ? Number(form.turnover_window_minutes) : undefined,
        service_package_key: form.service_package_key || undefined,
        primary_provider_user_id: form.primary_provider_user_id || undefined,
      })
      toast.success('STR profile created.')
      onCreated(res.property_id)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create the profile.')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-navy-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="New STR profile">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-white/12 bg-[#0d1220] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-white">New STR profile</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md border border-white/10 text-slate-400 hover:text-white" aria-label="Close dialog">×</button>
        </div>
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Property</span>
            <select className={inputCls} value={form.property_id} onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value }))}>
              <option value="">Select…</option>
              {eligible.map((pr) => <option key={pr.id} value={pr.id}>{pr.name || pr.address} — {pr.client_business || pr.client_name || 'Client'}</option>)}
            </select>
            {eligible.length === 0 && <span className="mt-1 block text-xs text-slate-500">Every property already has a profile.</span>}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Platform</span>
              <select className={inputCls} value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}><option value="airbnb">Airbnb</option><option value="vrbo">VRBO</option><option value="other">Other</option><option value="multiple">Multiple</option></select>
            </label>
            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Bedrooms</span>
              <input type="number" min={0} className={inputCls} value={form.bedrooms} onChange={(e) => setForm((f) => ({ ...f, bedrooms: e.target.value }))} />
            </label>
            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Checkout time</span>
              <input type="time" className={inputCls} value={form.checkout_time} onChange={(e) => setForm((f) => ({ ...f, checkout_time: e.target.value }))} />
            </label>
            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Window (minutes)</span>
              <input type="number" min={30} max={720} className={inputCls} value={form.turnover_window_minutes} onChange={(e) => setForm((f) => ({ ...f, turnover_window_minutes: e.target.value }))} />
            </label>
            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Package</span>
              <select className={inputCls} value={form.service_package_key} onChange={(e) => setForm((f) => ({ ...f, service_package_key: e.target.value }))}>{packages.map((pk) => <option key={pk.key} value={pk.key}>{pk.name}</option>)}</select>
            </label>
            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Primary provider</span>
              <select className={inputCls} value={form.primary_provider_user_id} onChange={(e) => setForm((f) => ({ ...f, primary_provider_user_id: e.target.value }))}><option value="">None</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}</select>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={btnOutline} onClick={onClose}>Cancel</button>
            <button type="button" className={btnPrimary} disabled={busy || !form.property_id} onClick={submit}>{busy ? <Loader2 size={14} className="animate-spin" /> : null} Create profile</button>
          </div>
        </div>
      </div>
    </div>
  )
}
