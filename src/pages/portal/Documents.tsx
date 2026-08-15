import { useCallback, useEffect, useState, useMemo } from 'react'
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
  if (bytes == null) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function categoryLabel(cat: string | null): string {
  if (!cat) return 'General'
  return cat.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

interface StatusDisplay {
  tone: 'gold' | 'green' | 'red' | 'slate'
  label: string
}

function reviewStatusDisplay(status: string): StatusDisplay {
  switch (status) {
    case 'approved':
      return { tone: 'green', label: 'Approved' }
    case 'rejected':
      return { tone: 'red', label: 'Update Requested' }
    case 'pending':
    case 'pending_review':
      return { tone: 'gold', label: 'Pending Review' }
    default:
      return { tone: 'slate', label: status.replace(/_/g, ' ').charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ') }
  }
}

export default function Documents() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
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

  // Organize documents without duplication.
  // Action needed means the client currently owes Pinnacle a document or a
  // replacement/correction:
  //   - review_status === 'rejected'          → update/replacement requested
  //   - review_status !== 'approved' && no r2_key → requested, not yet provided
  // A document the client has already uploaded (r2_key set) is under Pinnacle
  // review and is NOT a client action, even while review_status is 'pending'.
  const actionRequired = useMemo(() =>
    docs.filter(d => d.review_status === 'rejected' || (d.review_status !== 'approved' && !d.r2_key)),
    [docs]
  )

  // Recently added: non-action documents, sorted by date, first 5
  const recentlyAdded = useMemo(() => {
    const nonAction = docs.filter(d => !actionRequired.includes(d))
    return nonAction.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ).slice(0, 5)
  }, [docs, actionRequired])

  // All documents: everything else not already shown
  const displayedIds = new Set([...actionRequired, ...recentlyAdded].map(d => d.id))
  const allOther = useMemo(() => 
    docs.filter(d => !displayedIds.has(d.id)),
    [docs, displayedIds]
  )

  const renderDocCard = (doc: Doc) => {
    const statusDisplay = reviewStatusDisplay(doc.review_status)
    return (
      <div key={doc.id} className="flex flex-col gap-3 rounded-md border border-white/10 bg-white/[.02] p-3 hover:border-gold/30 transition">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{doc.file_name || 'Document'}</p>
            <p className="mt-1 text-xs text-slate-500">
              {categoryLabel(doc.category)}
              {doc.tax_year ? ` · Tax year ${doc.tax_year}` : ''}
              {doc.size_bytes ? ` · ${sizeLabel(doc.size_bytes)}` : ''}
            </p>
            {doc.matter_title && <p className="mt-1 text-xs text-slate-400">Matter: {doc.matter_title}</p>}
            <p className="mt-1 text-xs text-slate-500">
              Added {new Date(doc.created_at).toLocaleDateString()}
            </p>
          </div>
          <StatusBadge tone={statusDisplay.tone}>{statusDisplay.label}</StatusBadge>
        </div>

        {/* Download action */}
        {doc.r2_key && (
          <a 
            href={`/api/portal/documents/${doc.id}/file`} 
            target="_blank" 
            rel="noreferrer" 
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold hover:text-gold/80"
          >
            <Download size={14} />
            View
          </a>
        )}
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Files"
        title="Documents"
        subtitle="Files you've shared with Pinnacle and documents we've shared with you."
      />

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
          {/* Action Needed */}
          {actionRequired.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-white flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gold/20 text-gold text-xs font-bold">!</span>
                Action needed
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {actionRequired.map(renderDocCard)}
              </div>
            </section>
          )}

          {/* Recently Added */}
          {recentlyAdded.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-white">Recently added</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {recentlyAdded.map(renderDocCard)}
              </div>
            </section>
          )}

          {/* All Documents */}
          {allOther.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-white">All documents</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {allOther.map(renderDocCard)}
              </div>
            </section>
          )}

          {/* Empty fallback */}
          {actionRequired.length === 0 && recentlyAdded.length === 0 && allOther.length === 0 && (
            <Card>
              <p className="text-center text-sm text-slate-400">No documents available.</p>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
