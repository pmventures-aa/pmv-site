import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CalendarDays, CheckSquare, FileUp, PenLine, Plus, Send, Trash2, Type, UserPlus } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, Tag, EmptyState, inputCls, btnPrimary, btnOutline, btnSecondary } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { useAppPath } from '../../lib/basePath'
import { FieldPlacementCanvas } from '../../components/admin/FieldPlacementCanvas'

// A guided, DocHub-style "send a document for signature" flow that hides the
// enterprise envelope machinery behind four plain steps: the document, the
// signers, where they sign, and review + send. It orchestrates the existing
// envelope APIs so nothing new is needed on the server.
type Recipient = { id: string; name: string; email: string }
type Field = { id: string; page_number: number; field_type: string; x: number; y: number; width: number; height: number; recipient_id: string; label?: string | null }
type SignerDraft = { name: string; email: string }
const FIELD_TYPES: { key: string; label: string; icon: typeof PenLine }[] = [
  { key: 'signature', label: 'Signature', icon: PenLine },
  { key: 'initial', label: 'Initials', icon: PenLine },
  { key: 'date', label: 'Date', icon: CalendarDays },
  { key: 'text', label: 'Text', icon: Type },
  { key: 'checkbox', label: 'Checkbox', icon: CheckSquare },
]
const STEPS = ['Document', 'Signers', 'Place fields', 'Review & send']
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())

export default function EnvelopeCreateWizard() {
  const p = useAppPath()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState('')

  // Step 1
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [envelopeId, setEnvelopeId] = useState('')

  // Step 2
  const [signers, setSigners] = useState<SignerDraft[]>([{ name: '', email: '' }])
  const [recipients, setRecipients] = useState<Recipient[]>([])

  // Step 3
  const [fields, setFields] = useState<Field[]>([])
  const [activeRecipient, setActiveRecipient] = useState('')
  const [activeType, setActiveType] = useState('signature')
  const [page, setPage] = useState(1)

  const refreshDetail = useCallback(async (id: string) => {
    const d = await api.get<{ recipients: Recipient[]; fields: Field[] }>(`/admin/envelopes/${id}`)
    setRecipients(d.recipients || [])
    setFields(d.fields || [])
    if (!activeRecipient && d.recipients?.[0]) setActiveRecipient(d.recipients[0].id)
  }, [activeRecipient])

  useEffect(() => { if (recipients[0] && !activeRecipient) setActiveRecipient(recipients[0].id) }, [recipients, activeRecipient])

  // Step 1 -> create the draft envelope from the uploaded PDF.
  async function createEnvelope() {
    if (!title.trim()) return toast.error('Give the document a title.')
    if (!file) return toast.error('Upload the PDF to send.')
    setBusy('create')
    try {
      const up = await api.upload<{ file: { id: string } }>('/admin/documents/upload', file)
      const env = await api.post<{ id: string }>('/admin/envelopes', { title: title.trim(), message: message.trim() || undefined, source_file_id: up.file.id })
      setEnvelopeId(env.id)
      setStep(1)
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not start the signature request.') }
    finally { setBusy('') }
  }

  // Step 2 -> persist any signers that are not saved yet, then advance.
  async function saveSigners() {
    const valid = signers.filter((s) => s.name.trim() && emailOk(s.email))
    if (!valid.length) return toast.error('Add at least one signer with a valid email.')
    setBusy('signers')
    try {
      const existing = new Set(recipients.map((r) => r.email.toLowerCase()))
      for (const s of valid) {
        if (existing.has(s.email.trim().toLowerCase())) continue
        await api.post(`/admin/envelopes/${envelopeId}/recipients`, { name: s.name.trim(), email: s.email.trim() })
      }
      await refreshDetail(envelopeId)
      setStep(2)
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not save the signers.') }
    finally { setBusy('') }
  }

  async function placeField(pos: { x: number; y: number; width: number; height: number }) {
    if (!activeRecipient) return
    try {
      await api.post(`/admin/envelopes/${envelopeId}/fields`, { recipient_id: activeRecipient, field_type: activeType, page_number: page, ...pos })
      await refreshDetail(envelopeId)
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not place the field.') }
  }
  async function removeField(id: string) {
    try {
      await api.del(`/admin/document-ops/envelopes/${envelopeId}/fields/${id}`)
      await refreshDetail(envelopeId)
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not remove the field.') }
  }

  async function send() {
    setBusy('send')
    try {
      await api.post(`/admin/envelopes/${envelopeId}/send`, {})
      toast.success('Sent. Each signer gets a secure link by email.')
      navigate(p('envelopes'))
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not send for signature.') }
    finally { setBusy('') }
  }

  const fieldsByRecipient = useMemo(() => {
    const map = new Map<string, number>()
    for (const f of fields) map.set(f.recipient_id, (map.get(f.recipient_id) || 0) + 1)
    return map
  }, [fields])
  const everyoneHasField = recipients.length > 0 && recipients.every((r) => (fieldsByRecipient.get(r.id) || 0) > 0)

  return <div className="mx-auto max-w-5xl">
    <PageIntro kicker="Signed Documents" title="New signature request" subtitle="Upload a document, add who signs it, drop the fields where they sign, and send. Each signer gets a secure link by email." action={<button className={btnOutline} onClick={() => navigate(p('envelopes'))}>Cancel</button>} />

    {/* Step rail */}
    <ol className="mb-6 grid grid-cols-4 gap-2">{STEPS.map((label, i) => (
      <li key={label} className={`rounded-lg border px-3 py-2 text-center text-[11px] font-semibold ${i === step ? 'border-gold/40 bg-gold/[.08] text-gold' : i < step ? 'border-emerald-400/30 bg-emerald-400/[.06] text-emerald-200' : 'border-white/10 text-slate-500'}`}>
        <span className="tabular-nums">{i + 1}</span> · {label}
      </li>
    ))}</ol>

    {step === 0 && <Panel className="space-y-4">
      <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-400">Document title</span><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Service Agreement - Northstar Group" /></label>
      <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-400">Message to signers <span className="font-normal text-slate-600">(optional)</span></span><textarea className={`${inputCls} min-h-20`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="A short note shown in the signature request email." /></label>
      <div>
        <span className="mb-1.5 block text-xs font-bold text-slate-400">Document (PDF)</span>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-white/15 bg-white/[.02] px-4 py-6 text-sm text-slate-400 transition hover:border-gold/40">
          <FileUp size={18} className="text-gold" />
          <span>{file ? file.name : 'Choose a PDF to send for signature'}</span>
          <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
      </div>
      <div className="flex justify-end"><button className={btnPrimary} disabled={busy === 'create'} onClick={() => void createEnvelope()}>{busy === 'create' ? 'Uploading…' : <>Continue <ArrowRight size={15} /></>}</button></div>
    </Panel>}

    {step === 1 && <Panel className="space-y-4">
      <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-white">Who needs to sign?</h2><Tag>{signers.filter((s) => s.name && emailOk(s.email)).length} ready</Tag></div>
      <div className="space-y-2">{signers.map((s, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input className={inputCls} value={s.name} onChange={(e) => setSigners((v) => v.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Full name" />
          <input className={inputCls} value={s.email} onChange={(e) => setSigners((v) => v.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} placeholder="email@example.com" type="email" />
          <button className={btnSecondary} onClick={() => setSigners((v) => v.length > 1 ? v.filter((_, j) => j !== i) : v)} aria-label="Remove signer" disabled={signers.length === 1}><Trash2 size={14} /></button>
        </div>
      ))}</div>
      <button className={btnOutline} onClick={() => setSigners((v) => [...v, { name: '', email: '' }])}><UserPlus size={14} /> Add another signer</button>
      <div className="flex justify-between border-t border-white/10 pt-4"><button className={btnOutline} onClick={() => setStep(0)}><ArrowLeft size={15} /> Back</button><button className={btnPrimary} disabled={busy === 'signers'} onClick={() => void saveSigners()}>{busy === 'signers' ? 'Saving…' : <>Continue <ArrowRight size={15} /></>}</button></div>
    </Panel>}

    {step === 2 && <div className="space-y-4">
      <Panel className="space-y-3">
        <h2 className="text-sm font-bold text-white">Drop where each person signs</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Signer</span>
          {recipients.map((r) => <button key={r.id} onClick={() => setActiveRecipient(r.id)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${activeRecipient === r.id ? 'border-gold/50 bg-gold/10 text-gold' : 'border-white/10 text-slate-400 hover:text-white'}`}>{r.name}<span className="ml-1.5 text-[10px] text-slate-500">{fieldsByRecipient.get(r.id) || 0}</span></button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Field</span>
          {FIELD_TYPES.map((t) => <button key={t.key} onClick={() => setActiveType(t.key)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${activeType === t.key ? 'border-gold/50 bg-gold/10 text-gold' : 'border-white/10 text-slate-400 hover:text-white'}`}><t.icon size={12} /> {t.label}</button>)}
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-slate-500">Page <input type="number" min={1} value={page} onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))} className="w-14 rounded border border-white/10 bg-white/[.04] px-1.5 py-0.5 text-center text-slate-200" /></span>
        </div>
      </Panel>
      <Panel>
        {envelopeId ? <FieldPlacementCanvas envelopeId={envelopeId} page={page} recipientId={activeRecipient} fieldType={activeType} fields={fields} recipients={recipients} onPlace={placeField} /> : <EmptyState label="Upload a document first." />}
      </Panel>
      {fields.length > 0 && <Panel className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Placed fields</p>
        {fields.map((f) => { const who = recipients.find((r) => r.id === f.recipient_id); return <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2 text-xs"><span className="text-slate-300">{FIELD_TYPES.find((t) => t.key === f.field_type)?.label || f.field_type} · {who?.name || 'Signer'} · page {f.page_number}</span><button className="text-rose-300 hover:underline" onClick={() => void removeField(f.id)}>Remove</button></div> })}
      </Panel>}
      <div className="flex justify-between"><button className={btnOutline} onClick={() => setStep(1)}><ArrowLeft size={15} /> Back</button><button className={btnPrimary} disabled={fields.length === 0} onClick={() => setStep(3)}>Review <ArrowRight size={15} /></button></div>
    </div>}

    {step === 3 && <Panel className="space-y-4">
      <h2 className="text-sm font-bold text-white">Review and send</h2>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Document</dt><dd className="text-right text-slate-200">{title}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Signers</dt><dd className="text-right text-slate-200">{recipients.map((r) => r.name).join(', ')}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Fields placed</dt><dd className="text-right text-slate-200">{fields.length}</dd></div>
      </dl>
      {!everyoneHasField && <p className="rounded-lg border border-amber-400/25 bg-amber-400/[.05] px-4 py-3 text-xs leading-5 text-amber-200/90">Some signers have no fields yet. They can still receive the document, but add at least a signature field for anyone who must sign.</p>}
      <p className="text-xs leading-5 text-slate-500">Sending emails each signer a secure link that expires in 7 days and moves this document to your Signed Documents list.</p>
      <div className="flex justify-between border-t border-white/10 pt-4"><button className={btnOutline} onClick={() => setStep(2)}><ArrowLeft size={15} /> Back</button><button className={btnPrimary} disabled={busy === 'send'} onClick={() => void send()}>{busy === 'send' ? 'Sending…' : <><Send size={15} /> Send for signature</>}</button></div>
    </Panel>}
  </div>
}
