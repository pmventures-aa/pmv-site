import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { Card, EmptyState, PageHeader, StatusBadge } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'
import { MATTER_TYPES, matterTypeLabel, responsibilityBanner } from '../../../shared/matterWorkspace'
import { propertyDisplayName } from '../../../shared/propertyProfile'

interface MatterRow {
  id: string
  title: string
  type: string | null
  status: string
  due_date: string | null
  summary: string | null
  property_id: string | null
  property_address: string | null
  property_name: string | null
  created_at: string
  owner_name?: string | null
  client_stage?: string | null
  responsibility_state?: string | null
  next_action_label?: string | null
  next_action_due_at?: string | null
  blocked_reason_client_safe?: string | null
}

interface PropertyOpt { id: string; name: string | null; address: string }

export default function Matters() {
  const p = useAppPath()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const seededProperty = params.get('property') || ''
  const [items, setItems] = useState<MatterRow[]>([])
  const [properties, setProperties] = useState<PropertyOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(!!seededProperty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', type: 'property_work', summary: '', property_id: seededProperty, due_date: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [m, props] = await Promise.all([
        api.get<{ matters: MatterRow[] }>('/portal/matters'),
        api.get<{ properties: PropertyOpt[] }>('/portal/property'),
      ])
      setItems(m.matters)
      setProperties(props.properties)
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const open = useMemo(() => items.filter((row) => row.status !== 'closed'), [items])
  const closed = useMemo(() => items.filter((row) => row.status === 'closed'), [items])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api.post<{ id: string }>('/portal/matters', {
        title: form.title,
        type: form.type,
        summary: form.summary || undefined,
        property_id: form.property_id || undefined,
        due_date: form.due_date || undefined,
      })
      setShowForm(false)
      setForm({ title: '', type: 'property_work', summary: '', property_id: '', due_date: '' })
      navigate(p(`matters/${res.id}`))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open this project.')
    } finally { setBusy(false) }
  }

  function tone(status: string, responsibility?: string | null) {
    const banner = responsibilityBanner(responsibility, status)
    if (banner.state === 'none') return 'green' as const
    if (banner.state === 'client') return 'gold' as const
    if (banner.state === 'third_party') return 'red' as const
    return 'blue' as const
  }

  function list(rows: MatterRow[]) {
    return (
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id}>
            <Link to={p(`matters/${row.id}`)} className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-navy-900/70 px-5 py-4 transition hover:border-gold/30">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-white">{row.title}</p>
                  <StatusBadge tone={tone(row.status, row.responsibility_state)}>{responsibilityBanner(row.responsibility_state, row.status).label}</StatusBadge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {matterTypeLabel(row.type)}
                  {row.owner_name ? ` · ${row.owner_name}` : ''}
                  {row.property_address || row.property_name ? ` · ${propertyDisplayName({ name: row.property_name, address: row.property_address })}` : ''}
                  {row.next_action_label ? ` · ${row.next_action_label}` : row.due_date ? ` · due ${new Date(`${row.due_date}T12:00:00`).toLocaleDateString()}` : ''}
                </p>
                {row.summary && <p className="mt-2 line-clamp-2 text-sm text-slate-400">{row.summary}</p>}
              </div>
              <ChevronRight size={16} className="shrink-0 text-slate-600" />
            </Link>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Active work"
        title="Work"
        subtitle="Each item has a page: who owns it, what happens next, and whether anything is needed from you."
        action={<button className="btn-gold" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ Open work'}</button>}
      />

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Title</span><input className={inputCls} required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Turnover at 14 Oak, HOA packet…" /></label>
            <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Type</span><select className={inputCls} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>{MATTER_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
            <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Property</span><select className={inputCls} value={form.property_id} onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value }))}><option value="">Not tied to an address</option>{properties.map((prop) => <option key={prop.id} value={prop.id}>{propertyDisplayName(prop)}</option>)}</select></label>
            <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Due</span><input className={inputCls} type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} /></label>
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">What needs to happen</span><textarea className={`${inputCls} min-h-[80px]`} value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} /></label>
            <div className="flex items-center gap-3 sm:col-span-2">
              <button type="submit" disabled={busy} className="btn-gold disabled:opacity-60">{busy ? 'Opening…' : 'Open work'}</button>
              {error && <span className="text-sm text-rose-300">{error}</span>}
            </div>
          </form>
        </Card>
      )}

      {loading ? <Card><p className="text-sm text-slate-400">Loading projects…</p></Card> : items.length === 0 ? (
        <Card><EmptyState label="No work yet. Open an item when Pinnacle should track it." /></Card>
      ) : (
        <div className="space-y-8">
          {open.length > 0 && <section>{list(open)}</section>}
          {closed.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Closed</h2>
              {list(closed)}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
