import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2, Send, X } from 'lucide-react'
import { RichTextComposer } from '../../components/admin/RichTextComposer'
import { pickDefaultSignature, rememberSignatureId, signatureLabel, type EmailSignature } from '../../lib/emailSignatures'
import { SignaturePreview } from './SignatureLetterhead'
import { api } from '../../lib/api'
import type { HqEmailTemplate } from '../../lib/hqEmailTemplates'

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
  const [templates, setTemplates] = useState<HqEmailTemplate[]>([])
  const [, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (signatureId !== 'none' && signatures.some((s) => s.id === signatureId)) return
    if (defaultSig) setSignatureId(defaultSig.id)
  }, [defaultSig, signatureId, signatures])

  useEffect(() => { if (draft.cc) setShowCc(true) }, [draft.cc])
  useEffect(() => { if (draft.bcc) setShowBcc(true) }, [draft.bcc])
  useEffect(() => {
    void api.get<{ templates: HqEmailTemplate[] }>('/admin/email-templates')
      .then((r) => setTemplates((r.templates || []).filter((row) => row.enabled)))
      .catch(() => setTemplates([]))
  }, [])

  const selected = signatures.find((s) => s.id === signatureId) || null
  const canSend = draft.to.trim() && draft.subject.trim() && stripEditor(draft.html).trim()

  function setSig(id: string) {
    setSignatureId(id)
    if (id !== 'none') rememberSignatureId(id)
  }

  function applyTemplate(id: string) {
    const row = templates.find((item) => item.id === id)
    if (!row) return
    onChange({
      ...draft,
      subject: draft.subject.trim() ? draft.subject : row.subject.replace(/\{\{[^}]+\}\}/g, '').replace(/\s+/g, ' ').trim(),
      html: row.body_html,
    })
  }

  function openTemplates() {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('tab', 'templates')
      return next
    })
  }

  function send() {
    onSend(signatureId === 'none' ? null : signatureId)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f4ee] text-[#0a1728]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[#e4dfd4] bg-white px-4 py-2.5">
        <button
          type="button"
          disabled={busy || !canSend}
          onClick={send}
          className="inline-flex items-center gap-2 rounded-md bg-[#c9a227] px-4 py-1.5 text-sm font-semibold text-[#07111f] transition hover:bg-[#d9b84a] disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Send
        </button>
        <button type="button" disabled={busy} onClick={onDiscard} className="rounded-md px-3 py-1.5 text-sm font-medium text-[#5b6573] hover:bg-black/[.04] hover:text-[#0a1728]">
          Discard
        </button>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <label className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#5b6573]">
            Template
            <select
              className="h-8 min-w-[148px] rounded-md border border-[#ddd6c8] bg-white px-2 text-[13px] font-medium normal-case tracking-normal text-[#0a1728] outline-none focus:border-[#c9a227]"
              defaultValue=""
              onChange={(e) => { applyTemplate(e.target.value); e.currentTarget.value = '' }}
            >
              <option value="">Insert…</option>
              {templates.map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </label>
          <button type="button" className="text-[12px] font-semibold text-[#9a7838] hover:underline" onClick={openTemplates}>Manage</button>
          <label className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#5b6573]">
            Signature
            <select
              className="h-8 min-w-[148px] rounded-md border border-[#ddd6c8] bg-white px-2 text-[13px] font-medium normal-case tracking-normal text-[#0a1728] outline-none focus:border-[#c9a227]"
              value={signatureId}
              onChange={(e) => setSig(e.target.value)}
            >
              <option value="none">None</option>
              {signatures.map((s) => (
                <option key={s.id} value={s.id}>{signatureLabel(s)}</option>
              ))}
            </select>
          </label>
          <button type="button" className="text-[12px] font-semibold text-[#9a7838] hover:underline" onClick={onManageSignatures}>Edit</button>
        </div>
        <button type="button" className="grid h-8 w-8 place-items-center rounded-md text-[#7b8492] hover:bg-black/[.05] hover:text-[#0a1728]" onClick={onDiscard} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div className="shrink-0 border-b border-[#e4dfd4] bg-white">
        <FieldRow label="From">
          <p className="px-1 py-2 font-serif text-[15px] text-[#0a1728]">Pinnacle Management Ventures</p>
        </FieldRow>
        <FieldRow label="To">
          <input
            className="min-h-9 min-w-0 flex-1 border-0 bg-transparent px-1 font-serif text-[15px] text-[#0a1728] outline-none placeholder:text-[#9aa3ae]"
            value={draft.to}
            onChange={(e) => onChange({ ...draft, to: e.target.value })}
            placeholder="name@example.com"
            readOnly={draft.mode === 'reply'}
          />
          <div className="flex shrink-0 gap-3 pr-1">
            {!showCc && <button type="button" className="text-[12px] font-semibold text-[#9a7838] hover:underline" onClick={() => setShowCc(true)}>Cc</button>}
            {!showBcc && <button type="button" className="text-[12px] font-semibold text-[#9a7838] hover:underline" onClick={() => setShowBcc(true)}>Bcc</button>}
          </div>
        </FieldRow>
        {showCc && (
          <FieldRow label="Cc">
            <input className="min-h-9 w-full border-0 bg-transparent px-1 font-serif text-[15px] text-[#0a1728] outline-none placeholder:text-[#9aa3ae]" value={draft.cc} onChange={(e) => onChange({ ...draft, cc: e.target.value })} placeholder="cc@example.com" />
          </FieldRow>
        )}
        {showBcc && (
          <FieldRow label="Bcc">
            <input className="min-h-9 w-full border-0 bg-transparent px-1 font-serif text-[15px] text-[#0a1728] outline-none placeholder:text-[#9aa3ae]" value={draft.bcc} onChange={(e) => onChange({ ...draft, bcc: e.target.value })} placeholder="bcc@example.com" />
          </FieldRow>
        )}
        <FieldRow label="Subject">
          <input className="min-h-9 w-full border-0 bg-transparent px-1 font-serif text-[15px] text-[#0a1728] outline-none placeholder:text-[#9aa3ae]" value={draft.subject} onChange={(e) => onChange({ ...draft, subject: e.target.value })} placeholder="Subject" />
        </FieldRow>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white">
        <div className="min-h-0 flex-1">
          <RichTextComposer
            fill
            surface="letter"
            value={draft.html}
            onChange={(html) => onChange({ ...draft, html })}
            placeholder="Start writing"
          />
        </div>
        {selected && (
          <div className="shrink-0 px-8 pb-10 pt-2">
            <SignaturePreview signature={selected} />
          </div>
        )}
      </div>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-[#eeeae2] px-4 last:border-b-0">
      <span className="w-[4.5rem] shrink-0 text-[11px] font-semibold uppercase tracking-[.14em] text-[#7b8492]">{label}</span>
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
    </div>
  )
}

function stripEditor(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim()
}
