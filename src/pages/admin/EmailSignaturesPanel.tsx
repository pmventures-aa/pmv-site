import { useEffect, useState } from 'react'
import { Loader2, Plus, Save, Trash2, X } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { toast } from '../../components/kit/toast'
import { btnPrimary, btnSecondary, inputCls } from '../../components/admin/ui'
import { signatureLabel, type EmailSignature } from '../../lib/emailSignatures'

export function EmailSignaturesPanel({
  signatures,
  onClose,
  onChanged,
}: {
  signatures: EmailSignature[]
  onClose: () => void
  onChanged: () => void
}) {
  const [selectedId, setSelectedId] = useState(signatures[0]?.id || '')
  const selected = signatures.find((s) => s.id === selectedId) || signatures[0] || null
  const [name, setName] = useState(selected?.name || '')
  const [html, setHtml] = useState(selected?.html || '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!selected) return
    setName(selected.name)
    setHtml(selected.html)
  }, [selected?.id])

  async function save() {
    if (!selected) return
    setBusy(true)
    try {
      await api.patch(`/admin/email-signatures/${selected.id}`, { name: name.trim(), html })
      toast.success('Signature saved')
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save signature')
    } finally { setBusy(false) }
  }

  async function createPersonal() {
    setBusy(true)
    try {
      const r = await api.post<{ signature: EmailSignature }>('/admin/email-signatures', {
        name: 'Custom signature',
        kind: 'custom',
        html: selected?.html || '<p></p>',
      })
      toast.success('Signature added')
      setSelectedId(r.signature.id)
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add signature')
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!selected) return
    setBusy(true)
    try {
      await api.del(`/admin/email-signatures/${selected.id}`)
      toast.success('Signature removed')
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove signature')
    } finally { setBusy(false) }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-navy-950">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-navy-900 px-3 py-2">
        <p className="min-w-0 flex-1 text-sm font-semibold text-white">Email signatures</p>
        <button type="button" className={btnSecondary} onClick={() => void createPersonal()}><Plus size={14}/>New</button>
        <button type="button" className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-white/5 hover:text-white" onClick={onClose} aria-label="Close signatures">
          <X size={16} />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[240px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-b border-white/10 lg:border-b-0 lg:border-r">
          {signatures.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`block w-full border-b border-white/[.06] px-3 py-3 text-left ${selectedId === s.id ? 'bg-gold/[.08]' : 'hover:bg-white/[.03]'}`}
            >
              <p className="truncate text-sm font-semibold text-white">{signatureLabel(s)}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[.12em] text-slate-500">{s.owner_user_id ? 'Personal' : 'Shared'}</p>
            </button>
          ))}
        </aside>
        <section className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4">
          {!selected ? (
            <p className="text-sm text-slate-500">No signatures yet.</p>
          ) : (
            <>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Signature name" />
              <p className="text-[11px] text-slate-500">This branded block is appended when you send. Keep it short: name, title, phone, and web. HTML is allowed so the crest and layout stay intact.</p>
              <textarea className={`${inputCls} min-h-[200px] font-mono text-xs`} value={html} onChange={(e) => setHtml(e.target.value)} />
              <div className="rounded-md border border-white/10 bg-white p-4 text-navy-950">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Preview</p>
                <div dangerouslySetInnerHTML={{ __html: html }} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnPrimary} disabled={busy || !name.trim()} onClick={() => void save()}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save
                </button>
                <button type="button" className={btnSecondary} disabled={busy} onClick={() => void remove()}>
                  <Trash2 size={14} />Delete
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
