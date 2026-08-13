import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, HelpCircle, Wrench } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { Card, EmptyState, PageHeader, StatusBadge } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'
import { toast } from '../../components/kit/toast'
import {
  occupancyLabel, propertyCityLine, propertyDisplayName, propertyStatusLabel, propertyTypeLabel,
  PROPERTY_OCCUPANCIES, PROPERTY_TYPES,
} from '../../../shared/propertyProfile'
import { matterStatusLabel } from '../../../shared/matterWorkspace'

interface Property {
  id: string
  name: string | null
  address: string
  unit: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  property_type: string | null
  occupancy: string | null
  access_notes: string | null
  notes: string | null
  bedrooms: number | null
  bathrooms: string | null
  sqft: number | null
  year_built: number | null
  status: string
}

interface RelatedMatter { id: string; title: string; type: string | null; status: string; due_date: string | null }
interface RelatedTicket { id: string; subject: string; status: string; priority: string; waiting_on: string | null }
interface RelatedDoc { id: string; file_name: string | null; category: string | null; review_status: string }

export default function PropertyProfile() {
  const { id } = useParams()
  const p = useAppPath()
  const [property, setProperty] = useState<Property | null>(null)
  const [matters, setMatters] = useState<RelatedMatter[]>([])
  const [tickets, setTickets] = useState<RelatedTicket[]>([])
  const [documents, setDocuments] = useState<RelatedDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await api.get<{ property: Property; matters: RelatedMatter[]; tickets: RelatedTicket[]; documents: RelatedDoc[] }>(`/portal/property/${id}`)
      setProperty(res.property)
      setMatters(res.matters)
      setTickets(res.tickets)
      setDocuments(res.documents)
      const row = res.property
      setForm({
        name: row.name || '',
        address: row.address || '',
        unit: row.unit || '',
        city: row.city || '',
        state: row.state || '',
        postal_code: row.postal_code || '',
        property_type: row.property_type || 'residential',
        occupancy: row.occupancy || 'unknown',
        bedrooms: row.bedrooms != null ? String(row.bedrooms) : '',
        bathrooms: row.bathrooms || '',
        sqft: row.sqft != null ? String(row.sqft) : '',
        year_built: row.year_built != null ? String(row.year_built) : '',
        access_notes: row.access_notes || '',
        notes: row.notes || '',
      })
    } finally { setLoading(false) }
  }, [id])
  useEffect(() => { void load() }, [load])

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    setBusy(true)
    try {
      await api.patch(`/portal/property/${id}`, {
        ...form,
        bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
        sqft: form.sqft ? Number(form.sqft) : null,
        year_built: form.year_built ? Number(form.year_built) : null,
      })
      toast.success('Property profile saved.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save this property.')
    } finally { setBusy(false) }
  }

  if (loading) return <Card><p className="text-sm text-slate-400">Loading property…</p></Card>
  if (!property) return <Card><EmptyState label="This property could not be found." /></Card>

  const city = propertyCityLine(property)

  return (
    <div>
      <Link to={p('property-management')} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-gold">
        <ArrowLeft size={14} /> All properties
      </Link>
      <PageHeader
        eyebrow="Property profile"
        title={propertyDisplayName(property)}
        subtitle={[property.address, property.unit, city].filter(Boolean).join(' · ')}
        action={<StatusBadge tone={property.status === 'active' ? 'green' : 'gold'}>{propertyStatusLabel(property.status)}</StatusBadge>}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={onSave} className="space-y-4">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Name</span><input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
              <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Type</span><select className={inputCls} value={form.property_type} onChange={(e) => setForm((f) => ({ ...f, property_type: e.target.value }))}>{PROPERTY_TYPES.map((t) => <option key={t} value={t}>{propertyTypeLabel(t)}</option>)}</select></label>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Street</span><input className={inputCls} required value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></label>
              <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Unit</span><input className={inputCls} value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} /></label>
              <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">City</span><input className={inputCls} value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} /></label>
              <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">State</span><input className={inputCls} value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} /></label>
              <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">ZIP</span><input className={inputCls} value={form.postal_code} onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))} /></label>
            </div>
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Occupancy and access</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Occupancy</span><select className={inputCls} value={form.occupancy} onChange={(e) => setForm((f) => ({ ...f, occupancy: e.target.value }))}>{PROPERTY_OCCUPANCIES.map((o) => <option key={o} value={o}>{occupancyLabel(o)}</option>)}</select></label>
              <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Beds</span><input className={inputCls} type="number" min={0} value={form.bedrooms} onChange={(e) => setForm((f) => ({ ...f, bedrooms: e.target.value }))} /></label>
              <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Baths</span><input className={inputCls} value={form.bathrooms} onChange={(e) => setForm((f) => ({ ...f, bathrooms: e.target.value }))} /></label>
              <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Sq ft</span><input className={inputCls} type="number" min={0} value={form.sqft} onChange={(e) => setForm((f) => ({ ...f, sqft: e.target.value }))} /></label>
              <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Year built</span><input className={inputCls} type="number" min={0} value={form.year_built} onChange={(e) => setForm((f) => ({ ...f, year_built: e.target.value }))} /></label>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Access notes</span><textarea className={`${inputCls} min-h-[80px]`} value={form.access_notes} onChange={(e) => setForm((f) => ({ ...f, access_notes: e.target.value }))} placeholder="Lockbox, gate, alarm, pets, HOA…" /></label>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Notes for Pinnacle</span><textarea className={`${inputCls} min-h-[80px]`} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></label>
            </div>
            <button type="submit" disabled={busy} className="btn-gold mt-5 disabled:opacity-60">{busy ? 'Saving…' : 'Save profile'}</button>
          </Card>
        </form>

        <aside className="space-y-4">
          <Card className="!p-0">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Wrench size={13} /> Work</p>
              <Link to={`${p('matters')}?property=${property.id}`} className="text-xs font-semibold text-gold hover:underline">New</Link>
            </div>
            {matters.length === 0 ? <div className="p-5"><EmptyState label="No work on this address yet." /></div> : (
              <ul className="divide-y divide-white/10">
                {matters.map((m) => (
                  <li key={m.id}><Link to={p(`matters/${m.id}`)} className="block px-5 py-3 hover:bg-white/[.03]"><p className="text-sm font-medium text-white">{m.title}</p><p className="mt-0.5 text-xs text-slate-500">{matterStatusLabel(m.status)}</p></Link></li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="!p-0">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><HelpCircle size={13} /> Requests</p>
              <Link to={`${p('support')}?property=${property.id}`} className="text-xs font-semibold text-gold hover:underline">New</Link>
            </div>
            {tickets.length === 0 ? <div className="p-5"><EmptyState label="No requests tied to this address." /></div> : (
              <ul className="divide-y divide-white/10">
                {tickets.map((t) => (
                  <li key={t.id}><Link to={p('support')} className="block px-5 py-3 hover:bg-white/[.03]"><p className="text-sm font-medium text-white">{t.subject}</p><p className="mt-0.5 text-xs text-slate-500">{t.status.replace(/_/g, ' ')}</p></Link></li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="!p-0">
            <div className="border-b border-white/10 px-5 py-3">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><FileText size={13} /> Files</p>
            </div>
            {documents.length === 0 ? <div className="p-5"><EmptyState label="No files attached to this address." /></div> : (
              <ul className="divide-y divide-white/10">
                {documents.map((d) => (
                  <li key={d.id}><Link to={p('documents')} className="block px-5 py-3 text-sm text-slate-200 hover:bg-white/[.03]">{d.file_name || d.category || 'Document'}</Link></li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  )
}
