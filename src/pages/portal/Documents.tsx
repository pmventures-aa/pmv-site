import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Card, PageHeader, StatusBadge, EmptyState } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'

interface Doc {
  id: string
  category: string | null
  tax_year: number | null
  file_name: string | null
  review_status: string
  created_at: string
}

export default function Documents() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ category: '', tax_year: '', file_name: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ documents: Doc[] }>('/portal/documents')
      setDocs(res.documents)
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/portal/documents', {
        category: form.category || undefined,
        tax_year: form.tax_year ? parseInt(form.tax_year, 10) : undefined,
        file_name: form.file_name || undefined,
      })
      setForm({ category: '', tax_year: '', file_name: '' })
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Files"
        title="Documents"
        subtitle="Track documents shared with Pinnacle. Direct file upload is coming soon — this logs a request in the meantime."
        action={
          <button className="btn-gold" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ Log a document'}
          </button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-3">
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Category</span>
              <input className={inputCls} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="tax, agreement, financial…" />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Tax year</span>
              <input className={inputCls} type="number" value={form.tax_year} onChange={(e) => setForm((f) => ({ ...f, tax_year: e.target.value }))} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">File name</span>
              <input className={inputCls} value={form.file_name} onChange={(e) => setForm((f) => ({ ...f, file_name: e.target.value }))} placeholder="2025-tax-return.pdf" />
            </label>
            <div className="flex items-center gap-3 sm:col-span-3">
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
            <p>Couldn't load documents.</p>
            <button onClick={() => load()} className="text-gold hover:underline">
              Try again
            </button>
          </div>
        ) : docs.length === 0 ? (
          <div className="p-6">
            <EmptyState label="No documents logged yet." />
          </div>
        ) : (
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">File</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium">Tax year</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-3 text-slate-200">{d.file_name ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-200">{d.category ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-200">{d.tax_year ?? '—'}</td>
                  <td className="px-5 py-3">
                    <StatusBadge tone={d.review_status === 'approved' ? 'green' : d.review_status === 'rejected' ? 'red' : 'gold'}>
                      {d.review_status}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
