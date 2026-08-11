import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { api, ApiError } from '../../lib/api'
import { Card, EmptyState, PageHeader, StatusBadge, type Tone } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'
import { toast } from '../../components/kit/toast'

export interface FieldConfig {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'date' | 'datetime-local'
  placeholder?: string
  required?: boolean
}

export interface ColumnConfig {
  key: string
  label: string
  render?: (row: any) => React.ReactNode
}

export interface ModuleConfig {
  title: string
  eyebrow: string
  subtitle?: string
  apiPath: string
  listKey: string
  columns: ColumnConfig[]
  createFields?: FieldConfig[]
  createLabel?: string
  emptyLabel: string
  statusField?: string
  statusOptions?: string[]
  clientCanSetStatus?: boolean
  clientCancelValue?: string
  transformBeforeSubmit?: (form: Record<string, string>) => Record<string, unknown>
}

function statusTone(status: string): Tone {
  const s = (status || '').toLowerCase()
  if (['done', 'completed', 'approved', 'filed', 'paid', 'active', 'confirmed'].includes(s)) return 'green'
  if (['cancelled', 'declined', 'blocked'].includes(s)) return 'red'
  if (['in_progress', 'under_review', 'scheduled', 'submitted'].includes(s)) return 'blue'
  if (['open', 'requested', 'pending', 'not_started', 'draft', 'proposed'].includes(s)) return 'gold'
  return 'slate'
}

export function ModulePage({ config }: { config: ModuleConfig }) {
  const { user } = useAuth()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  const isStaff = user?.role === 'staff' || user?.role === 'admin'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<any>(config.apiPath)
      setItems(res[config.listKey] ?? [])
      setLoadError(false)
    } catch {
      setItems([])
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [config.apiPath, config.listKey])

  useEffect(() => {
    load()
  }, [load])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const payload = config.transformBeforeSubmit ? config.transformBeforeSubmit(form) : form
      await api.post(config.apiPath, payload)
      setForm({})
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(id: string, status: string) {
    try {
      await api.patch(`${config.apiPath}/${id}`, { status })
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update status. Try again.')
    }
  }

  const canSetStatusDropdown = isStaff || config.clientCanSetStatus

  return (
    <div>
      <PageHeader
        eyebrow={config.eyebrow}
        title={config.title}
        subtitle={config.subtitle}
        action={
          config.createFields && (
            <button className="btn-gold" onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cancel' : config.createLabel ?? '+ New'}
            </button>
          )
        }
      />

      {showForm && config.createFields && (
        <Card className="mb-6">
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
            {config.createFields.map((f) => (
              <label key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">{f.label}</span>
                {f.type === 'textarea' ? (
                  <textarea
                    className={`${inputCls} min-h-[80px]`}
                    placeholder={f.placeholder}
                    required={f.required}
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))}
                  />
                ) : (
                  <input
                    className={inputCls}
                    type={f.type}
                    placeholder={f.placeholder}
                    required={f.required}
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))}
                  />
                )}
              </label>
            ))}
            <div className="flex items-center gap-3 sm:col-span-2">
              <button type="submit" disabled={busy} className="btn-gold disabled:opacity-60">
                {busy ? 'Saving…' : 'Submit'}
              </button>
              {error && <span className="text-sm text-rose-300">{error}</span>}
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-x-auto !p-0">
        {loading ? (
          <div className="p-6 text-sm text-slate-400">Loading…</div>
        ) : loadError ? (
          <div className="space-y-2 p-6 text-sm text-slate-400">
            <p>Couldn't load this list.</p>
            <button onClick={() => load()} className="text-gold hover:underline">
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-6">
            <EmptyState label={config.emptyLabel} />
          </div>
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                {config.columns.map((col) => (
                  <th key={col.key} className="whitespace-nowrap px-5 py-3 font-medium">
                    {col.label}
                  </th>
                ))}
                {config.statusField && <th className="whitespace-nowrap px-5 py-3 font-medium">Status</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => (
                <tr key={row.id ?? i} className="border-b border-white/5 last:border-0">
                  {config.columns.map((col) => (
                    <td key={col.key} className="whitespace-nowrap px-5 py-3 text-slate-200">
                      {col.render ? col.render(row) : String(row[col.key] ?? 'Not provided')}
                    </td>
                  ))}
                  {config.statusField && (
                    <td className="whitespace-nowrap px-5 py-3">
                      <div className="flex items-center gap-2">
                        {canSetStatusDropdown && config.statusOptions ? (
                          <select
                            className="rounded-lg border border-white/10 bg-navy-900 px-2 py-1 text-xs text-white"
                            value={row[config.statusField]}
                            onChange={(e) => setStatus(row.id, e.target.value)}
                          >
                            {config.statusOptions.map((s) => (
                              <option key={s} value={s}>
                                {s.replace(/_/g, ' ')}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <StatusBadge tone={statusTone(row[config.statusField])}>
                            {String(row[config.statusField] ?? 'Not provided').replace(/_/g, ' ')}
                          </StatusBadge>
                        )}
                        {!isStaff &&
                          !config.clientCanSetStatus &&
                          config.clientCancelValue &&
                          row[config.statusField] !== config.clientCancelValue && (
                            <button
                              onClick={() => setStatus(row.id, config.clientCancelValue!)}
                              className="text-xs text-rose-300 hover:underline"
                            >
                              Cancel
                            </button>
                          )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
