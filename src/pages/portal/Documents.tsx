import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Card, PageHeader, StatusBadge, EmptyState } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'
import { Download, Upload } from 'lucide-react'

interface Doc {
  id: string
  category: string | null
  tax_year: number | null
  file_name: string | null
  r2_key: string | null
  content_type: string | null
  size_bytes: number | null
  source: string | null
  review_status: string
  created_at: string
  matter_id?: string | null
  matter_title?: string | null
}

function sizeLabel(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function categoryLabel(cat: string | null): string {
  if (!cat) return 'General'
  return cat.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function reviewStatusBadge(status: string) {
  if (status === 'approved') return { tone: 'green' as const, label: 'Approved' }
  if (status === 'rejected') return { tone: 'red' as const, label: 'Rejected' }
  return { tone: 'gold' as const, label: 'Pending review' }
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

  useEffect(() => { load() }, [load])

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

  // Organize documents
  const bySource = {
    requested: docs.filter(d => d.source === 'requested'),
    uploaded: docs.filter(d => d.source === 'uploaded' || d.source === null),
  }
  
  const recentDocs = [...bySource.uploaded].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 5)

  const renderDocCard = (doc: Doc) => (
    <div key={doc.id} className="flex flex-col gap-2 rounded-md border border-white/10 bg-white/[.02] p-3 hover:border-gold/30 transition">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          {doc.r2_key ? (
            <a 
              href={`/api/portal/documents/${doc.id}/file`} 
              target="_blank" 
              rel="noreferrer" 
              className="block font-medium text-gold hover:underline truncate text-sm flex items-center gap-1.5"
            >
              <Download size={14} className="shrink-0" />
              <span className="truncate">{doc.file_name || 'Document'}</span>
            </a>
          ) : (
            <p className="text-sm font-medium text-slate-300">{doc.file_name || 'Document'}</p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            {categoryLabel(doc.category)}
            {doc.tax_year ? ` · Tax year ${doc.tax_year}` : ''}
            {doc.size_bytes ? ` · ${sizeLabel(doc.size_bytes)}` : ''}
          </p>
          {doc.matter_title && <p className="mt-1 text-xs text-slate-400">Matter: {doc.matter_title}</p>}
          <p className="mt-0.5 text-[11px] text-slate-600">
            Added {new Date(doc.created_at).toLocaleDateString()}
          </p>
        </div>
        <StatusBadge tone={reviewStatusBadge(doc.review_status).tone} className="shrink-0">
          {reviewStatusBadge(doc.review_status).label}
        </StatusBadge>
      </div>
    </div>
  )

  return (
    <div>
      <PageHeader
        eyebrow="Files"
        title="Documents"
        subtitle="Files you shared with Pinnacle and documents we've shared with you."
        action={<button className="btn-outline" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ Log expected document'}</button>}
      />

      {showForm && (
        <Card className="mb-4">
          <p className="mb-3 text-xs text-slate-400">Note a file you will send outside an intake. Uploads happen inside the application when requested.</p>
          <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-3">
            <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Category</span><input className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g., tax, agreement, financial" /></label>
            <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Tax year</span><input className={inputCls} type="number" value={form.tax_year} onChange={(e) => setForm({ ...form, tax_year: e.target.value })} placeholder="2026" /></label>
            <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">File name / description</span><input className={inputCls} value={form.file_name} onChange={(e) => setForm({ ...form, file_name: e.target.value })} placeholder="e.g., Q1 financials" /></label>
            <div className="flex items-center gap-3 sm:col-span-3"><button type="submit" disabled={busy} className="btn-gold disabled:opacity-60">{busy ? 'Saving…' : 'Save note'}</button>{error && <span className="text-sm text-rose-300">{error}</span>}</div>
          </form>
        </Card>
      )}

      {loading ? (
        <Card><p className="text-sm text-slate-400">Loading documents…</p></Card>
      ) : loadError ? (
        <Card className="space-y-2">
          <p className="text-sm text-slate-400">Couldn't load documents.</p>
          <button onClick={() => load()} className="text-gold hover:underline text-sm font-semibold">Try again</button>
        </Card>
      ) : docs.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <Upload size={32} className="mx-auto mb-3 text-slate-600" />
            <h3 className="text-sm font-semibold text-white mb-1">No documents yet</h3>
            <p className="text-xs text-slate-500 mb-3 max-w-sm mx-auto">Documents shared with you or requested by Pinnacle will appear here. You can upload files when we request them during an intake.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Requested Documents */}
          {bySource.requested.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-white flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gold/20 text-gold text-xs font-bold">!</span>
                Action needed
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {bySource.requested.map(renderDocCard)}
              </div>
            </section>
          )}

          {/* Recently Added */}
          {recentDocs.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-white">Recently added</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {recentDocs.map(renderDocCard)}
              </div>
            </section>
          )}

          {/* All Documents */}
          {docs.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-white">All documents</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {docs.map(renderDocCard)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
