import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Card, EmptyState, PageHeader } from '../../components/ui'
import { toast } from '../../components/kit/toast'
import { PROPERTY_TEXT_FIELDS, PROPERTY_COUNTIES, PROPERTY_TYPES, type CleaningPropertyProfile } from '../../../shared/cleaningProperty'

const input = 'w-full rounded-md border border-white/12 bg-navy-950/40 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-gold/50 focus:outline-none'
const COUNTY_LABEL: Record<string, string> = { miami_dade: 'Miami-Dade', broward: 'Broward', palm_beach: 'Palm Beach' }
const TYPE_LABEL: Record<string, string> = { house: 'House', condo: 'Condo', townhome: 'Townhome', apartment: 'Apartment', str: 'Short-term rental', other: 'Other' }

type FormState = Record<string, string>

function toForm(p?: CleaningPropertyProfile): FormState {
  const f: FormState = {}
  for (const field of PROPERTY_TEXT_FIELDS) f[field.column] = (p?.[camel(field.column) as keyof CleaningPropertyProfile] as string) || ''
  f.county = p?.county || ''
  f.property_type = p?.propertyType || ''
  f.bedrooms = p?.bedrooms != null ? String(p.bedrooms) : ''
  f.bathrooms = p?.bathrooms != null ? String(p.bathrooms) : ''
  f.beds = p?.beds != null ? String(p.beds) : ''
  f.square_feet = p?.squareFeet != null ? String(p.squareFeet) : ''
  f.access_instructions = p?.accessInstructions || ''
  return f
}
function camel(col: string): string {
  return col.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase())
}

export default function CleaningProperties() {
  const [properties, setProperties] = useState<CleaningPropertyProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<{ id: string | null; form: FormState } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ properties: CleaningPropertyProfile[] }>('/portal/cleaning/properties')
      setProperties(res.properties)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load your properties.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  async function save() {
    if (!editing) return
    setSaving(true)
    try {
      if (editing.id) await api.patch(`/portal/cleaning/properties/${editing.id}`, editing.form)
      else await api.post('/portal/cleaning/properties', editing.form)
      toast.success('Property saved.')
      setEditing(null)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the property.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(p: CleaningPropertyProfile) {
    if (!confirm('Remove this property?')) return
    try { await api.del(`/portal/cleaning/properties/${p.id}`); await load() }
    catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not remove.') }
  }

  const set = (col: string, v: string) => setEditing((e) => (e ? { ...e, form: { ...e.form, [col]: v } } : e))

  return (
    <div>
      <PageHeader
        eyebrow="Cleaning"
        title="My Properties"
        subtitle="Save each property once so you do not re-enter the details every booking, and your cleaner arrives knowing what matters."
        action={!editing ? <button onClick={() => setEditing({ id: null, form: toForm() })} className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy-950">Add property</button> : undefined}
      />

      {editing ? (
        <Card className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-400"><span className="mb-1 block">County</span>
              <select className={input} value={editing.form.county} onChange={(e) => set('county', e.target.value)}>
                <option value="">Select</option>
                {PROPERTY_COUNTIES.map((k) => <option key={k} value={k}>{COUNTY_LABEL[k]}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-400"><span className="mb-1 block">Property type</span>
              <select className={input} value={editing.form.property_type} onChange={(e) => set('property_type', e.target.value)}>
                <option value="">Select</option>
                {PROPERTY_TYPES.map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
              </select>
            </label>
            {(['bedrooms', 'bathrooms', 'beds', 'square_feet'] as const).map((col) => (
              <label key={col} className="text-xs text-slate-400"><span className="mb-1 block capitalize">{col.replace('_', ' ')}</span>
                <input className={input} inputMode="numeric" value={editing.form[col]} onChange={(e) => set(col, e.target.value)} />
              </label>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {PROPERTY_TEXT_FIELDS.map((field) => (
              <label key={field.column} className={`text-xs text-slate-400 ${field.multiline ? 'sm:col-span-2' : ''}`}>
                <span className="mb-1 block">{field.label}</span>
                {field.multiline
                  ? <textarea className={`${input} min-h-[60px]`} value={editing.form[field.column]} onChange={(e) => set(field.column, e.target.value)} />
                  : <input className={input} value={editing.form[field.column]} onChange={(e) => set(field.column, e.target.value)} />}
              </label>
            ))}
          </div>
          <label className="mt-3 block text-xs text-slate-400">
            <span className="mb-1 block">Access instructions <span className="text-gold/80">(kept private - shown only to your assigned cleaner and Pinnacle)</span></span>
            <textarea className={`${input} min-h-[60px]`} placeholder="Lockbox code, gate code, where the key is…" value={editing.form.access_instructions} onChange={(e) => set('access_instructions', e.target.value)} />
          </label>
          <div className="mt-4 flex gap-2">
            <button onClick={save} disabled={saving} className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy-950 disabled:opacity-60">{saving ? 'Saving…' : 'Save property'}</button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-slate-400">Cancel</button>
          </div>
        </Card>
      ) : loading ? (
        <p className="mt-6 text-sm text-slate-400">Loading…</p>
      ) : properties.length === 0 ? (
        <div className="mt-6"><EmptyState label="No saved properties yet. Add one so bookings and your cleaner have the details." /></div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {properties.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-white">{p.nickname || p.address || 'Property'}</p>
                  <p className="text-xs text-slate-400">{[p.address, p.unit].filter(Boolean).join(', ')}</p>
                  <p className="mt-1 text-xs text-slate-500">{[p.propertyType && TYPE_LABEL[p.propertyType], p.county && COUNTY_LABEL[p.county], p.bedrooms != null && `${p.bedrooms}BR`, p.bathrooms != null && `${p.bathrooms}BA`].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-3 text-xs">
                <button onClick={() => setEditing({ id: p.id, form: toForm(p) })} className="font-semibold text-gold">Edit</button>
                <button onClick={() => remove(p)} className="text-slate-500 hover:text-rose-300">Remove</button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
