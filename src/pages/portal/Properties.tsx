import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, ChevronRight, MapPin } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { Card, EmptyState, PageHeader, StatusBadge } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'
import {
  occupancyLabel, propertyCityLine, propertyDisplayName, propertyStatusLabel, propertyTypeLabel,
  PROPERTY_OCCUPANCIES, PROPERTY_TYPES,
} from '../../../shared/propertyProfile'

export interface PropertyRow {
  id: string
  name: string | null
  address: string
  unit: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  property_type: string | null
  occupancy: string | null
  status: string
  notes: string | null
}

export default function Properties() {
  const p = useAppPath()
  const [items, setItems] = useState<PropertyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', address: '', unit: '', city: '', state: '', postal_code: '',
    property_type: 'residential', occupancy: 'unknown', notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ properties: PropertyRow[] }>('/portal/property')
      setItems(res.properties)
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/portal/property', form)
      setForm({ name: '', address: '', unit: '', city: '', state: '', postal_code: '', property_type: 'residential', occupancy: 'unknown', notes: '' })
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this property.')
    } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Addresses"
        title="Properties"
        subtitle="Each address has its own profile: occupancy, access, open work, and files."
        action={<button className="btn-gold" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ Add property'}</button>}
      />

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
            <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Name</span><input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Beach house, Building A…" /></label>
            <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Type</span><select className={inputCls} value={form.property_type} onChange={(e) => setForm((f) => ({ ...f, property_type: e.target.value }))}>{PROPERTY_TYPES.map((t) => <option key={t} value={t}>{propertyTypeLabel(t)}</option>)}</select></label>
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Street address</span><input className={inputCls} required value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></label>
            <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Unit</span><input className={inputCls} value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} /></label>
            <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">City</span><input className={inputCls} value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} /></label>
            <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">State</span><input className={inputCls} value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} /></label>
            <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">ZIP</span><input className={inputCls} value={form.postal_code} onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))} /></label>
            <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Occupancy</span><select className={inputCls} value={form.occupancy} onChange={(e) => setForm((f) => ({ ...f, occupancy: e.target.value }))}>{PROPERTY_OCCUPANCIES.map((o) => <option key={o} value={o}>{occupancyLabel(o)}</option>)}</select></label>
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Notes</span><textarea className={`${inputCls} min-h-[80px]`} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Gate code location, HOA, preferred vendors…" /></label>
            <div className="flex items-center gap-3 sm:col-span-2">
              <button type="submit" disabled={busy} className="btn-gold disabled:opacity-60">{busy ? 'Saving…' : 'Save property'}</button>
              {error && <span className="text-sm text-rose-300">{error}</span>}
            </div>
          </form>
        </Card>
      )}

      {loading ? <Card><p className="text-sm text-slate-400">Loading properties…</p></Card> : items.length === 0 ? (
        <Card><EmptyState label="No properties on file yet. Add an address to give Pinnacle a place to attach work." /></Card>
      ) : (
        <ul className="space-y-3">
          {items.map((row) => {
            const city = propertyCityLine(row)
            return (
              <li key={row.id}>
                <Link to={p(`property-management/${row.id}`)} className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-navy-900/70 px-5 py-4 transition hover:border-gold/30">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 size={16} className="shrink-0 text-gold/80" />
                      <p className="truncate font-semibold text-white">{propertyDisplayName(row)}</p>
                      <StatusBadge tone={row.status === 'active' ? 'green' : row.status === 'sold' ? 'slate' : 'gold'}>{propertyStatusLabel(row.status)}</StatusBadge>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-400">
                      <MapPin size={12} className="shrink-0" />
                      {row.address}{row.unit ? ` · ${row.unit}` : ''}{city ? ` · ${city}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{propertyTypeLabel(row.property_type)} · {occupancyLabel(row.occupancy)}</p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-slate-600" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
