import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Loader2, Paperclip, Send, Trash2, X } from 'lucide-react'
import { RichTextComposer } from '../../components/admin/RichTextComposer'
import { btnPrimary, btnSecondary, inputCls } from '../../components/admin/ui'
import { pickDefaultSignature, rememberSignatureId, signatureLabel, type EmailSignature } from '../../lib/emailSignatures'

export type ComposeDraft = {
  mode: 'new' | 'reply'
  threadId?: string
  to: string
  cc: string
  bcc: string
  subject: string
  html: string
}

export function EmailComposePane({
  draft,
  signatures,
  busy,
  onChange,
  onSend,
  onDiscard,
  onManageSignatures,
}: {
  draft: ComposeDraft
  signatures: EmailSignature[]
  busy: boolean
  onChange: (next: ComposeDraft) => void
  onSend: (signatureId: string | null) => void
  onDiscard: () => void
  onManageSignatures: () => void
}) {
  const [showCc, setShowCc] = useState(!!draft.cc)
  const [showBcc, setShowBcc] = useState(!!draft.bcc)
  const defaultSig = useMemo(() => pickDefaultSignature(signatures), [signatures])
  const [signatureId, setSignatureId] = useState<string>(defaultSig?.id || 'none')

  useEffect(() => {
    if (signatureId !== 'none' && signatures.some((s) => s.id === signatureId)) return
    if (defaultSig) setSignatureId(defaultSig.id)
  }, [defaultSig, signatureId, signatures])

  useEffect(() => { if (draft.cc) setShowCc(true) }, [draft.cc])
  useEffect(() => { if (draft.bcc) setShowBcc(true) }, [draft.bcc])

  const selected = signatures.find((s) => s.id === signatureId) || null
  const canSend = draft.to.trim() && draft.subject.trim() && stripEditor(draft.html).trim()
  const title = draft.mode === 'reply' ? draft.subject || 'Reply' : (draft.subject.trim() || 'Untitled Message')

  function setSig(id: string) {
    setSignatureId(id)
    if (id !== 'none') rememberSignatureId(id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-navy-950">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-navy-900 px-3 py-2">
        <button type="button" className={btnPrimary} disabled={busy || !canSend} onClick={() => onSend(signatureId === 'none' ? null : signatureId)}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Send
        </button>
        <button type="button" className={btnSecondary} disabled={busy} onClick={onDiscard}>
          <Trash2 size={14} />Discard
        </button>
        <p className="ml-2 min-w-0 flex-1 truncate text-sm font-semibold text-white">{title}</p>
        <button type="button" className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-white/5 hover:text-white" onClick={onDiscard} aria-label="Close compose">
          <X size={16} />
        </button>
      </div>

      <div className="shrink-0 border-b border-white/10 bg-navy-900/80">
        <FieldRow label="From">
          <p className="truncate px-1 py-1.5 text-sm text-slate-300">Pinnacle Management Ventures</p>
          <span className="ml-auto hidden text-[11px] text-slate-500 sm:inline">Replies return to this thread</span>
        </FieldRow>
        <FieldRow label="To">
          <input
            className={`${inputCls} !border-0 !bg-transparent !px-1 shadow-none focus:!ring-0`}
            value={draft.to}
            onChange={(e) => onChange({ ...draft, to: e.target.value })}
            placeholder="name@example.com"
            readOnly={draft.mode === 'reply'}
          />
          <div className="ml-auto flex shrink-0 gap-2 pr-1">
            {!showCc && <button type="button" className="text-xs font-semibold text-gold hover:underline" onClick={() => setShowCc(true)}>Cc</button>}
            {!showBcc && <button type="button" className="text-xs font-semibold text-gold hover:underline" onClick={() => setShowBcc(true)}>Bcc</button>}
          </div>
        </FieldRow>
        {showCc && (
          <FieldRow label="Cc">
            <input className={`${inputCls} !border-0 !bg-transparent !px-1 shadow-none focus:!ring-0`} value={draft.cc} onChange={(e) => onChange({ ...draft, cc: e.target.value })} placeholder="cc@example.com" />
          </FieldRow>
        )}
        {showBcc && (
          <FieldRow label="Bcc">
            <input className={`${inputCls} !border-0 !bg-transparent !px-1 shadow-none focus:!ring-0`} value={draft.bcc} onChange={(e) => onChange({ ...draft, bcc: e.target.value })} placeholder="bcc@example.com" />
          </FieldRow>
        )}
        <FieldRow label="Subject">
          <input className={`${inputCls} !border-0 !bg-transparent !px-1 shadow-none focus:!ring-0`} value={draft.subject} onChange={(e) => onChange({ ...draft, subject: e.target.value })} placeholder="Subject" />
        </FieldRow>
      </div>

      <div className="min-h-0 flex-1 p-3">
        <RichTextComposer
          fill
          value={draft.html}
          onChange={(html) => onChange({ ...draft, html })}
          placeholder="Write your message"
        />
      </div>

      <div className="shrink-0 border-t border-white/10 bg-navy-900 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-400">
            Signature
            <select
              className={`${inputCls} !h-8 !w-auto min-w-[180px]`}
              value={signatureId}
              onChange={(e) => setSig(e.target.value)}
            >
              <option value="none">None</option>
              {signatures.map((s) => (
                <option key={s.id} value={s.id}>{signatureLabel(s)}</option>
              ))}
            </select>
          </label>
          <button type="button" className="text-xs font-semibold text-gold hover:underline" onClick={onManageSignatures}>Edit signatures</button>
          <span className="hidden items-center gap-1 text-[11px] text-slate-600 sm:inline-flex"><Paperclip size={11} />Attachments stay on the next pass</span>
          <button type="button" className={`${btnPrimary} ml-auto`} disabled={busy || !canSend} onClick={() => onSend(signatureId === 'none' ? null : signatureId)}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send
          </button>
        </div>
        {selected && (
          <div className="mt-2 max-h-28 overflow-y-auto rounded-md border border-white/10 bg-white p-3 text-navy-950">
            <div className="origin-top-left scale-[.92]" dangerouslySetInnerHTML={{ __html: selected.html }} />
          </div>
        )}
      </div>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-white/[.06] px-3 last:border-b-0">
      <span className="w-16 shrink-0 text-[11px] font-bold uppercase tracking-[.12em] text-slate-500">{label}</span>
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
    </div>
  )
}

function stripEditor(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim()
}
