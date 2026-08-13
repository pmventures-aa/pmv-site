import { useEffect, useState } from 'react'
import { Loader2, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { toast } from '../../components/kit/toast'
import { signatureLabel, type EmailSignature } from '../../lib/emailSignatures'
import { SignaturePreview } from './SignatureLetterhead'

export function EmailSignaturesPanel({
  signatures,
  templates,
  onClose,
  onChanged,
}: {
  signatures: EmailSignature[]
  templates?: { company: string; support: string; personal: string }
  onClose: () => void
  onChanged: () => void
}) {
  const [selectedId, setSelectedId] = useState(signatures[0]?.id || '')
  const selected = signatures.find((s) => s.id === selectedId) || signatures[0] || null
  const [name, setName] = useState(selected?.name || '')
  const [html, setHtml] = useState(selected?.html || '')
  const [busy, setBusy] = useState(false)
  const [showHtml, setShowHtml] = useState(false)

  useEffect(() => {
    if (!selected) return
    setName(selected.name)
    setHtml(selected.html)
  }, [selected?.id])

  function restoreLetterhead() {
    if (!selected || !templates) return
    const next = selected.kind === 'support' ? templates.support : selected.kind === 'personal' ? templates.personal : templates.company
    setHtml(next)
  }

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

  async function createCustom() {
    setBusy(true)
    try {
      const r = await api.post<{ signature: EmailSignature }>('/admin/email-signatures', {
        name: 'Custom signature',
        kind: 'custom',
        html: templates?.company || selected?.html || '<p></p>',
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
    <div className="flex h-full min-h-0 flex-col bg-[#f7f4ee] text-[#0a1728]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[#e4dfd4] bg-white px-4 py-2.5">
        <p className="min-w-0 flex-1 font-serif text-[17px] text-[#0a1728]">Signatures</p>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-[#ddd6c8] bg-white px-3 py-1.5 text-sm font-medium text-[#3d4a5c] hover:bg-[#f4f1ea]" onClick={() => void createCustom()}>
          <Plus size={14}/>New
        </button>
        <button type="button" className="grid h-8 w-8 place-items-center rounded-md text-[#7b8492] hover:bg-black/[.05]" onClick={onClose} aria-label="Close signatures">
          <X size={16} />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[240px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-b border-[#e4dfd4] bg-white lg:border-b-0 lg:border-r">
          {signatures.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`block w-full border-b border-[#eeeae2] px-4 py-3 text-left ${selectedId === s.id ? 'bg-[#f7f4ee]' : 'hover:bg-[#fbfaf6]'}`}
            >
              <p className="truncate font-serif text-[15px] text-[#0a1728]">{signatureLabel(s)}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[.14em] text-[#7b8492]">{s.owner_user_id ? 'Personal' : 'Firm letterhead'}</p>
            </button>
          ))}
        </aside>
        <section className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
          {!selected ? (
            <p className="text-sm text-[#5b6573]">No signatures yet.</p>
          ) : (
            <>
              <input
                className="h-10 rounded-md border border-[#ddd6c8] bg-white px-3 font-serif text-[15px] text-[#0a1728] outline-none focus:border-[#c9a227]"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Signature name"
              />
              <div className="rounded-md border border-[#e4dfd4] bg-white p-6">
                <p className="mb-4 text-[10px] font-semibold uppercase tracking-[.16em] text-[#9a7838]">What recipients get</p>
                <SignaturePreview signature={selected} html={html} />
                <p className="mt-4 max-w-[36rem] text-[11px] leading-[16px] text-[#8b939e]">
                  This is the HTML attached under your message. The crest is a PNG on the site; everything else is text. Gmail and Outlook may hide the crest until images are shown.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="inline-flex items-center gap-2 rounded-md bg-[#c9a227] px-3 py-1.5 text-sm font-semibold text-[#07111f] disabled:opacity-50" disabled={busy || !name.trim()} onClick={() => void save()}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save
                </button>
                {templates && (
                  <button type="button" className="inline-flex items-center gap-2 rounded-md border border-[#ddd6c8] bg-white px-3 py-1.5 text-sm font-medium text-[#3d4a5c]" disabled={busy} onClick={restoreLetterhead}>
                    <RotateCcw size={14} />Restore letterhead
                  </button>
                )}
                <button type="button" className="text-sm font-medium text-[#5b6573] hover:underline" onClick={() => setShowHtml((v) => !v)}>
                  {showHtml ? 'Hide HTML' : 'Advanced HTML'}
                </button>
                <button type="button" className="ml-auto inline-flex items-center gap-2 text-sm font-medium text-[#9a4a3c]" disabled={busy} onClick={() => void remove()}>
                  <Trash2 size={14} />Delete
                </button>
              </div>
              {showHtml && (
                <textarea
                  className="min-h-[180px] rounded-md border border-[#ddd6c8] bg-white p-3 font-mono text-xs text-[#0a1728] outline-none focus:border-[#c9a227]"
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
