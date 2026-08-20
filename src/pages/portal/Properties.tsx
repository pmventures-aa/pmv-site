import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, Building2, MapPin, Plus } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { Card, EmptyState, PageHeader, StatusBadge } from '../../components/ui'
import { pmvFadeUp, pmvStagger } from '../../lib/motionTheme'
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
        subtitle="Occupancy, access, open work, and files on each address."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link to={p('support')} className="btn-outline inline-flex items-center gap-1.5"><ArrowRight size={14} /> Start a request</Link>
            <button className="btn-gold inline-flex items-center gap-1.5" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : <><Plus size={14} /> Add property</>}</button>
          </div>
        }
      />

      {showForm && (
        <Card className="mb-4">
          <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2">
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
        <motion.ul variants={pmvStagger} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((row) => {
            const city = propertyCityLine(row)
            return (
              <motion.li key={row.id} variants={pmvFadeUp}>
                <Link
                  to={p(`property-management/${row.id}`)}
                  className="group block h-full overflow-hidden rounded-xl border border-white/10 bg-navy-900/60 transition duration-200 hover:-translate-y-0.5 hover:border-gold/35 hover:shadow-[0_12px_30px_rgba(0,0,0,.28)]"
                >
                  <div className="relative h-20 overflow-hidden bg-gradient-to-br from-gold/[.14] via-white/[.03] to-transparent">
                    <Building2 size={72} strokeWidth={1} className="absolute -bottom-3 -right-2 text-white/[.06] transition-transform duration-300 group-hover:scale-105" aria-hidden="true" />
                    <div className="absolute right-2 top-2">
                      <StatusBadge tone={row.status === 'active' ? 'green' : row.status === 'sold' ? 'slate' : 'gold'}>{propertyStatusLabel(row.status)}</StatusBadge>
                    </div>
                    <div className="absolute bottom-2 left-3 flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/12 bg-navy-950/70 text-gold"><Building2 size={16} /></span>
                    </div>
                  </div>
                  <div className="min-w-0 p-3.5">
                    <p className="truncate font-semibold text-white" title={propertyDisplayName(row)}>{propertyDisplayName(row)}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
                      <MapPin size={12} className="shrink-0" />
                      <span className="min-w-0 truncate">{row.address}{row.unit ? ` · ${row.unit}` : ''}{city ? ` · ${city}` : ''}</span>
                    </p>
                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/[.06] pt-2.5">
                      <p className="min-w-0 truncate text-xs text-slate-500">{propertyTypeLabel(row.property_type)} · {occupancyLabel(row.occupancy)}</p>
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-500 transition group-hover:text-gold">Open <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" /></span>
                    </div>
                  </div>
                </Link>
              </motion.li>
            )
          })}
        </motion.ul>
      )}
    </div>
  )
}
