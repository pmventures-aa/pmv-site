import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, PenLine, Save } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { DocumentCanvas } from '../../components/admin/DocumentCanvas'
import { DocumentExportMenu } from '../../components/admin/DocumentExportMenu'
import { btnPrimary, inputCls } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'

type DocDetail = { document: any; versions: any[]; shares: any[] }

export default function DocumentFullPage() {
  const { id } = useParams<{ id: string }>()
  const p = useAppPath()
  const [detail, setDetail] = useState<DocDetail | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editText, setEditText] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [missing, setMissing] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const d = await api.get<DocDetail>(`/admin/documents-workspace/${id}`)
      setDetail(d)
      setEditTitle(d.document.title)
      setEditText(d.document.text_content || '')
      setDirty(false)
    } catch {
      setMissing(true)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!detail) return
    setSaving(true)
    try {
      await api.patch(`/admin/documents-workspace/${detail.document.id}`, {
        title: editTitle,
        ...(detail.document.document_type === 'text' ? { text_content: editText, change_note: 'Saved from full-page editor' } : {}),
      })
      setDirty(false)
      toast.success('Saved')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not save document')
    } finally {
      setSaving(false)
    }
  }

  if (missing) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <FileText size={40} className="mx-auto text-slate-600" />
        <h1 className="mt-4 text-lg font-semibold text-white">Document not found</h1>
        <p className="mt-2 text-sm text-slate-400">It may have been archived or removed from the Document Hub.</p>
        <Link to={p('document-center')} className={`${btnPrimary} mt-6`}><ArrowLeft size={14} /> Back to Document Hub</Link>
      </div>
    )
  }

  if (!detail) {
    return <div className="px-4 py-16 text-center text-sm text-slate-400">Loading document…</div>
  }

  const d = detail.document
  return (
    <div className="flex min-h-screen flex-col bg-[#0b1118]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-navy-950/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link to={p('document-center')} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[.02] text-slate-400 transition hover:border-gold/35 hover:text-gold" title="Back to Document Hub" aria-label="Back to Document Hub">
              <ArrowLeft size={15} />
            </Link>
            {d.document_type === 'text' ? (
              <input
                className={`${inputCls} max-w-[42vw] min-w-0 !py-1 text-base font-semibold text-white sm:max-w-[56vw]`}
                value={editTitle}
                onChange={(e) => { setEditTitle(e.target.value); setDirty(true) }}
                placeholder="Document title"
                aria-label="Document title"
              />
            ) : (
              <h1 className="truncate text-base font-semibold text-white">{d.title}</h1>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DocumentExportMenu documentId={d.id} title={editTitle || d.title} documentType={d.document_type} mimeType={d.mime_type} originalName={d.original_name} align="right" />
            {d.document_type === 'text' && (
              <button type="button" className={btnPrimary} onClick={() => void save()} disabled={saving || !dirty}>
                {saving ? 'Saving…' : <><PenLine size={14} /> <span className="hidden sm:inline">Save</span><Save size={14} className="sm:hidden" /></>}
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 p-3 sm:p-5">
        <DocumentCanvas document={d} text={editText} onTextChange={(v) => { setEditText(v); setDirty(true) }} fullPage tall />
      </main>
    </div>
  )
}