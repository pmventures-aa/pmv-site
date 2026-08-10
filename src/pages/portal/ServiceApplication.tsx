import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { Card, PageHeader, StatusBadge } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'
import { useAppPath } from '../../lib/basePath'
import { InlineLoading } from '../../components/LoadingScreen'
import {
  displayValue,
  hasAnswer,
  parseOptions,
  questionVisible,
  type AnswerMap,
  type IntakeQuestion,
  type IntakeValue,
} from '../../lib/intake'

interface ServiceRow {
  key: string
  name: string
  description: string | null
  category: string | null
  intake_intro: string | null
  estimated_minutes: number
}

interface ApplicationRow {
  id: string
  service_key: string
  status: string
  current_step: number
  submission_source: string
  created_at: string
  updated_at: string
}

interface Attachment {
  id: string
  document_id: string
  question_key: string | null
  file_name: string | null
  content_type: string | null
  size_bytes: number | null
  visibility: string
  created_at: string
}

interface StartResponse {
  application: ApplicationRow
  service: ServiceRow
  questions: IntakeQuestion[]
  answers: AnswerMap
  prefill: AnswerMap
  attachments: Attachment[]
  client: { name: string; email: string; phone: string | null; business_name: string | null }
  banking_supported: boolean
}

interface CopyResponse {
  service_application_disclaimer: string
  eviction_scope_disclaimer: string
  service_application_contact_line: string
}

type WizardPage =
  | { type: 'intro' }
  | { type: 'questions'; stepOrder: number; label: string; questions: IntakeQuestion[] }
  | { type: 'banking' }
  | { type: 'review' }

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const TIME_WINDOWS = ['Morning (8am–12pm)', 'Afternoon (12pm–5pm)', 'Evening (5pm–8pm)', 'Flexible']

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function splitDateWindow(value: IntakeValue | undefined): [string, string] {
  const raw = typeof value === 'string' ? value : ''
  const [date = '', window = ''] = raw.split('|')
  return [date, window]
}

function QuestionField({
  q,
  value,
  attachments,
  onChange,
  onUpload,
  onRemoveFile,
  uploading,
}: {
  q: IntakeQuestion
  value: IntakeValue | undefined
  attachments: Attachment[]
  onChange: (value: IntakeValue) => void
  onUpload: (files: File[]) => Promise<void>
  onRemoveFile: (documentId: string) => Promise<void>
  uploading: boolean
}) {
  const options = parseOptions(q.options)
  const helpId = `${q.id}-help`
  const label = (
    <div className="mb-4">
      <label htmlFor={q.id} className="block text-lg font-semibold leading-snug text-white sm:text-xl">
        {q.label} {q.required ? <span className="text-gold" aria-label="required">*</span> : null}
      </label>
      {q.help_text && <p id={helpId} className="mt-1.5 text-sm leading-relaxed text-slate-400">{q.help_text}</p>}
    </div>
  )

  if (q.input_type === 'single_select') {
    const selected = typeof value === 'string' ? value : ''
    return (
      <fieldset>
        <legend className="sr-only">{q.label}</legend>
        {label}
        <div className={`grid gap-2.5 ${options.some((o) => o.description) ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
          {options.map((option) => {
            const active = selected === option.value
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(option.value)}
                className={`rounded-xl border p-4 text-left transition-all focus:outline-none focus:ring-2 focus:ring-gold/70 ${
                  active
                    ? 'border-gold/70 bg-gold/10 shadow-[0_0_0_1px_rgba(212,175,55,.15)]'
                    : 'border-white/10 bg-white/[0.025] hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.05]'
                }`}
              >
                <span className={`block text-sm font-semibold ${active ? 'text-gold' : 'text-white'}`}>{option.label}</span>
                {option.description && <span className="mt-1.5 block text-sm leading-relaxed text-slate-400">{option.description}</span>}
                {option.meta && <span className="mt-2 block text-xs font-medium uppercase tracking-wide text-slate-500">{option.meta}</span>}
              </button>
            )
          })}
        </div>
      </fieldset>
    )
  }

  if (q.input_type === 'multi_select') {
    const selected = Array.isArray(value) ? value : []
    return (
      <fieldset>
        <legend className="sr-only">{q.label}</legend>
        {label}
        <div className="flex flex-wrap gap-2.5">
          {options.map((option) => {
            const active = selected.includes(option.value)
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(active ? selected.filter((v) => v !== option.value) : [...selected, option.value])}
                className={`rounded-full border px-4 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-gold/70 ${
                  active ? 'border-gold/70 bg-gold/15 text-gold' : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-white/25 hover:bg-white/[0.06]'
                }`}
              >
                {active ? '✓ ' : ''}{option.label}
              </button>
            )
          })}
        </div>
      </fieldset>
    )
  }

  if (q.input_type === 'toggle') {
    const answered = typeof value === 'boolean'
    return (
      <fieldset>
        <legend className="sr-only">{q.label}</legend>
        {label}
        <div className="grid max-w-sm grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-1.5">
          {([true, false] as const).map((choice) => {
            const active = answered && value === choice
            return (
              <button
                type="button"
                key={String(choice)}
                aria-pressed={active}
                onClick={() => onChange(choice)}
                className={`rounded-lg px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-gold/70 ${
                  active ? 'bg-gold text-navy-950' : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {choice ? 'Yes' : 'No'}
              </button>
            )
          })}
        </div>
      </fieldset>
    )
  }

  if (q.input_type === 'file') {
    const files = attachments.filter((a) => a.question_key === q.question_key)
    const canAdd = !!q.allow_multiple || files.length === 0
    return (
      <div>
        {label}
        <div className="rounded-xl border border-dashed border-white/20 bg-white/[0.025] p-4 sm:p-5">
          {files.length > 0 && (
            <ul className="mb-4 space-y-2">
              {files.map((file) => (
                <li key={file.document_id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-navy-950/60 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{file.file_name || 'Uploaded file'}</p>
                    <p className="text-xs text-slate-500">{formatBytes(file.size_bytes)}</p>
                  </div>
                  <button type="button" onClick={() => onRemoveFile(file.document_id)} className="shrink-0 text-xs font-medium text-slate-400 hover:text-rose-300">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {canAdd && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-gold/40 hover:bg-gold/5 focus-within:ring-2 focus-within:ring-gold/70">
              <span>{uploading ? 'Uploading…' : files.length ? 'Add another file' : 'Choose file'}</span>
              <input
                id={q.id}
                className="sr-only"
                type="file"
                disabled={uploading}
                multiple={!!q.allow_multiple}
                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? [])
                  e.currentTarget.value = ''
                  if (picked.length) void onUpload(picked)
                }}
              />
            </label>
          )}
          <p className="mt-3 text-xs text-slate-500">PDF, images, Word, Excel, text, or CSV. Up to 20 MB per file.</p>
        </div>
      </div>
    )
  }

  if (q.input_type === 'datetime_window') {
    const [date, window] = splitDateWindow(value)
    return (
      <div>
        {label}
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            id={q.id}
            aria-describedby={q.help_text ? helpId : undefined}
            className={inputCls}
            type="date"
            value={date}
            onChange={(e) => onChange(`${e.target.value}|${window}`)}
          />
          <select
            aria-label="Time window"
            className={inputCls}
            value={window}
            onChange={(e) => onChange(`${date}|${e.target.value}`)}
          >
            <option value="">Choose a time window…</option>
            {TIME_WINDOWS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
      </div>
    )
  }

  if (q.input_type === 'textarea') {
    return (
      <div>
        {label}
        <textarea
          id={q.id}
          aria-describedby={q.help_text ? helpId : undefined}
          className={`${inputCls} min-h-[130px] resize-y`}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Tell us what would be helpful to know…"
        />
      </div>
    )
  }

  const inputType = q.input_type === 'number' || q.input_type === 'currency' ? 'number' : q.input_type === 'date' ? 'date' : 'text'
  return (
    <div>
      {label}
      <div className={q.input_type === 'currency' ? 'relative' : undefined}>
        {q.input_type === 'currency' && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>}
        <input
          id={q.id}
          aria-describedby={q.help_text ? helpId : undefined}
          className={`${inputCls} ${q.input_type === 'currency' ? '!pl-7' : ''}`}
          type={inputType}
          inputMode={q.input_type === 'number' || q.input_type === 'currency' ? 'decimal' : undefined}
          step={q.input_type === 'currency' ? '0.01' : q.input_type === 'number' ? '1' : undefined}
          min={q.input_type === 'number' || q.input_type === 'currency' ? '0' : undefined}
          autoComplete={q.input_type === 'address' ? 'street-address' : undefined}
          value={typeof value === 'string' || typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.input_type === 'address' ? 'Street address, city, state, ZIP' : undefined}
        />
      </div>
    </div>
  )
}

export default function ServiceApplication() {
  const { key } = useParams<{ key: string }>()
  const navigate = useNavigate()
  const p = useAppPath()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const hydrated = useRef(false)
  const saveTimer = useRef<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [application, setApplication] = useState<ApplicationRow | null>(null)
  const [service, setService] = useState<ServiceRow | null>(null)
  const [questions, setQuestions] = useState<IntakeQuestion[]>([])
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [client, setClient] = useState<StartResponse['client'] | null>(null)
  const [bankingSupported, setBankingSupported] = useState(false)
  const [banking, setBanking] = useState({ account_holder_name: '', bank_name: '', account_type: 'checking', routing_number: '', account_number: '' })
  const [skipBanking, setSkipBanking] = useState(true)
  const [copy, setCopy] = useState<CopyResponse | null>(null)
  const [pageIdx, setPageIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [done, setDone] = useState(false)
  const [signedName, setSignedName] = useState('')
  const [signatureAck, setSignatureAck] = useState(false)

  useEffect(() => {
    if (!key) return
    hydrated.current = false
    ;(async () => {
      try {
        const [started, copyResult] = await Promise.all([
          api.post<StartResponse>(`/portal/service-applications/${key}/start`),
          api.get<CopyResponse>('/portal/application-copy'),
        ])
        setApplication(started.application)
        setService(started.service)
        setQuestions(started.questions)
        setAnswers({ ...started.prefill, ...started.answers })
        setAttachments(started.attachments)
        setClient(started.client)
        setSignedName(started.client.name)
        setBankingSupported(started.banking_supported)
        setCopy(copyResult)
        setPageIdx(Math.max(0, started.application.current_step || 0))
        hydrated.current = true
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not start this application.')
      } finally {
        setLoading(false)
      }
    })()
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [key])

  const visibleQuestions = useMemo(() => questions.filter((q) => questionVisible(q, answers)), [questions, answers])

  const pages = useMemo<WizardPage[]>(() => {
    const groups = new Map<number, { label: string; questions: IntakeQuestion[] }>()
    for (const q of visibleQuestions) {
      if (!groups.has(q.step_order)) groups.set(q.step_order, { label: q.step_label || 'A few details', questions: [] })
      groups.get(q.step_order)!.questions.push(q)
    }
    const questionPages: WizardPage[] = Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([stepOrder, group]) => ({ type: 'questions', stepOrder, label: group.label, questions: group.questions }))
    return [
      { type: 'intro' },
      ...questionPages,
      ...(bankingSupported ? [{ type: 'banking' } as const] : []),
      { type: 'review' },
    ]
  }, [visibleQuestions, bankingSupported])

  const page = pages[Math.min(pageIdx, Math.max(0, pages.length - 1))]

  useEffect(() => {
    if (pageIdx > pages.length - 1) setPageIdx(Math.max(0, pages.length - 1))
  }, [pageIdx, pages.length])

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [pageIdx])

  useEffect(() => {
    if (!hydrated.current || !application || done) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = window.setTimeout(() => {
      api.patch(`/portal/service-applications/${application.id}`, { answers, current_step: pageIdx })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }, 650)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [answers, pageIdx, application, done])

  function questionComplete(q: IntakeQuestion): boolean {
    if (q.input_type === 'file') return attachments.some((a) => a.question_key === q.question_key)
    if (q.input_type === 'datetime_window') {
      const [date, window] = splitDateWindow(answers[q.question_key])
      return !!date && !!window
    }
    if (q.question_key.endsWith('_ack')) return answers[q.question_key] === true
    return hasAnswer(answers[q.question_key])
  }

  function validateCurrent(): string | null {
    if (page?.type === 'questions') {
      for (const q of page.questions) {
        if (q.required && !questionComplete(q)) return `Please answer “${q.label}” before continuing.`
      }
    }
    if (page?.type === 'banking' && !skipBanking) {
      const started = banking.account_holder_name || banking.routing_number || banking.account_number || banking.bank_name
      if (started && (!banking.account_holder_name || !banking.routing_number || !banking.account_number)) {
        return 'Complete the account holder, routing number, and account number — or choose “Provide later.”'
      }
      if (banking.routing_number && !/^\d{9}$/.test(banking.routing_number)) return 'Routing number must be 9 digits.'
    }
    return null
  }

  async function saveNow(nextPage = pageIdx) {
    if (!application) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    setSaveState('saving')
    try {
      await api.patch(`/portal/service-applications/${application.id}`, { answers, current_step: nextPage })
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  async function next() {
    const validation = validateCurrent()
    if (validation) {
      setError(validation)
      return
    }
    setError(null)
    const nextPage = Math.min(pageIdx + 1, pages.length - 1)
    await saveNow(nextPage)
    setPageIdx(nextPage)
  }

  async function back() {
    setError(null)
    const nextPage = Math.max(pageIdx - 1, 0)
    await saveNow(nextPage)
    setPageIdx(nextPage)
  }

  async function uploadFiles(q: IntakeQuestion, files: File[]) {
    if (!application) return
    setUploadingKey(q.question_key)
    setError(null)
    try {
      const picked = q.allow_multiple ? files : files.slice(0, 1)
      for (const file of picked) {
        const res = await api.upload<{ document?: Attachment }>(`/portal/service-applications/${application.id}/files/${q.question_key}`, file)
        if (res.document) {
          setAttachments((cur) => [...cur, res.document!])
          setAnswers((cur) => {
            const existing = Array.isArray(cur[q.question_key]) ? cur[q.question_key] as string[] : []
            return { ...cur, [q.question_key]: [...existing, res.document!.file_name || file.name] }
          })
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload that file.')
    } finally {
      setUploadingKey(null)
    }
  }

  async function removeFile(q: IntakeQuestion, documentId: string) {
    if (!application) return
    try {
      const removed = attachments.find((a) => a.document_id === documentId)
      await api.del(`/portal/service-applications/${application.id}/files/${documentId}`)
      setAttachments((cur) => cur.filter((a) => a.document_id !== documentId))
      if (removed?.file_name) {
        setAnswers((cur) => {
          const current = Array.isArray(cur[q.question_key]) ? cur[q.question_key] as string[] : []
          return { ...cur, [q.question_key]: current.filter((name) => name !== removed.file_name) }
        })
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove that file.')
    }
  }

  async function submit() {
    if (!application) return
    const allMissing = visibleQuestions.filter((q) => q.required && !questionComplete(q))
    if (allMissing.length) {
      const first = allMissing[0]
      const editIndex = pages.findIndex((candidate) => candidate.type === 'questions' && candidate.stepOrder === first.step_order)
      setError(`Please finish “${first.label}” before submitting.`)
      if (editIndex >= 0) setPageIdx(editIndex)
      return
    }
    if (signedName.trim().length < 2 || !signatureAck) {
      setError('Type your full name and confirm the certification statement to sign and submit.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = { answers, current_step: pageIdx, signed_name: signedName.trim(), signature_ack: signatureAck }
      if (bankingSupported && !skipBanking && banking.account_holder_name && banking.routing_number && banking.account_number) payload.banking = banking
      await api.post(`/portal/service-applications/${application.id}/submit`, payload)
      setDone(true)
      setSaveState('saved')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong while submitting. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <InlineLoading />
  if (!service || !application) {
    return (
      <div>
        <PageHeader eyebrow="Service application" title="We couldn't open this application" />
        <Card className="max-w-2xl">
          <p className="text-sm text-slate-300">{error || 'This service is unavailable right now.'}</p>
          <Link to={p('services')} className="btn-outline mt-5 inline-block">Back to My Services</Link>
        </Card>
      </div>
    )
  }

  if (done) {
    return (
      <div>
        <PageHeader eyebrow="Application received" title={service.name} />
        <Card className="mx-auto max-w-2xl overflow-hidden !p-0 text-center">
          <div className="border-b border-white/10 bg-gradient-to-br from-gold/10 via-white/[0.025] to-transparent px-6 py-10 sm:px-10">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-2xl text-emerald-300">✓</div>
            <h2 className="mt-5 text-2xl font-semibold text-white">You're all set.</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-300">
              We received your {service.name} application and your Pinnacle team has been notified. We'll review the details and follow up with the right next step.
            </p>
            <div className="mt-5 flex justify-center"><StatusBadge tone="blue">Application received / in review</StatusBadge></div>
          </div>
          <div className="px-6 py-6">
            <p className="text-xs text-slate-500">Application ID: {application.id}</p>
            <Link to={p('services')} className="btn-gold mt-5 inline-block">Back to My Services</Link>
          </div>
        </Card>
      </div>
    )
  }

  const progress = Math.round(((pageIdx + 1) / pages.length) * 100)

  return (
    <div>
      <PageHeader eyebrow="Start your journey" title={service.name} subtitle={service.description || undefined} />

      <div className="mx-auto max-w-3xl">
        <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold uppercase tracking-wide text-slate-300">Step {pageIdx + 1} of {pages.length}</span>
            <span className={saveState === 'error' ? 'text-rose-300' : saveState === 'saving' ? 'text-slate-400' : 'text-emerald-300'}>
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Progress saved' : saveState === 'error' ? 'Could not autosave' : 'Save & resume enabled'}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <div className="h-full rounded-full bg-gold transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

        <Card className="relative overflow-hidden !p-0">
          <div className="px-5 py-6 sm:px-8 sm:py-8">
            {page?.type === 'intro' && (
              <div>
                <p className="eyebrow">Before we get started</p>
                <h2 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-semibold text-white outline-none sm:text-3xl">A few details, then we'll take it from here.</h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
                  {service.intake_intro || 'Answer a few questions so we can understand what you need and route your request to the right person.'}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold">
                    About {service.estimated_minutes || 3} minutes
                  </div>
                  {application.submission_source === 'staff_assigned' && (
                    <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1.5 text-xs font-medium text-sky-300">
                      Started for you by your Pinnacle team — review and sign to submit
                    </div>
                  )}
                </div>

                {client && (
                  <div className="mt-7 rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">We already have</p>
                        <p className="mt-1 text-base font-semibold text-white">{client.name}</p>
                        {client.business_name && <p className="text-sm text-slate-300">{client.business_name}</p>}
                      </div>
                      <button type="button" onClick={() => navigate(p('profile'))} className="text-xs font-medium text-gold hover:underline">Update profile →</button>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
                      <p>{client.email}</p>
                      <p>{client.phone || 'No phone on profile'}</p>
                    </div>
                  </div>
                )}
                <p className="mt-5 text-xs leading-relaxed text-slate-500">Your answers save automatically so you can leave and come back without starting over.</p>
              </div>
            )}

            {page?.type === 'questions' && (
              <div>
                <p className="eyebrow">{service.name}</p>
                <h2 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-semibold text-white outline-none">{page.label}</h2>
                <div className="mt-7 space-y-8">
                  {page.questions.map((q) => (
                    <QuestionField
                      key={q.id}
                      q={q}
                      value={answers[q.question_key]}
                      attachments={attachments}
                      onChange={(value) => {
                        setError(null)
                        setAnswers((cur) => ({ ...cur, [q.question_key]: value }))
                      }}
                      onUpload={(files) => uploadFiles(q, files)}
                      onRemoveFile={(documentId) => removeFile(q, documentId)}
                      uploading={uploadingKey === q.question_key}
                    />
                  ))}
                </div>
                {service.key === 'property_management' && page.label.toLowerCase().includes('eviction') && copy?.eviction_scope_disclaimer && (
                  <div className="mt-8 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-xs leading-relaxed text-amber-100/80">
                    <p className="font-semibold text-amber-100">Scope &amp; legal coordination</p>
                    <p className="mt-1.5">{copy.eviction_scope_disclaimer}</p>
                  </div>
                )}
              </div>
            )}

            {page?.type === 'banking' && (
              <div>
                <p className="eyebrow">Optional setup detail</p>
                <h2 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-semibold text-white outline-none">Banking information</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  If deposit/setup banking is relevant to this service, you can provide it now. This sensitive information is encrypted and is never included in the application PDF. You can also provide it later to your assigned specialist.
                </p>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Account holder name</span>
                    <input className={inputCls} disabled={skipBanking} value={banking.account_holder_name} onChange={(e) => setBanking((b) => ({ ...b, account_holder_name: e.target.value }))} />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Bank name</span>
                    <input className={inputCls} disabled={skipBanking} value={banking.bank_name} onChange={(e) => setBanking((b) => ({ ...b, bank_name: e.target.value }))} />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Account type</span>
                    <select className={inputCls} disabled={skipBanking} value={banking.account_type} onChange={(e) => setBanking((b) => ({ ...b, account_type: e.target.value }))}>
                      <option value="checking">Checking</option>
                      <option value="savings">Savings</option>
                    </select>
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Routing number</span>
                    <input className={inputCls} disabled={skipBanking} inputMode="numeric" maxLength={9} value={banking.routing_number} onChange={(e) => setBanking((b) => ({ ...b, routing_number: e.target.value.replace(/\D/g, '') }))} />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Account number</span>
                    <input className={inputCls} disabled={skipBanking} inputMode="numeric" value={banking.account_number} onChange={(e) => setBanking((b) => ({ ...b, account_number: e.target.value.replace(/\D/g, '') }))} />
                  </label>
                </div>
                <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-slate-200">
                  <input type="checkbox" checked={skipBanking} onChange={(e) => setSkipBanking(e.target.checked)} />
                  <span><strong className="font-semibold text-white">Provide later.</strong> My Pinnacle representative can collect this when needed.</span>
                </label>
              </div>
            )}

            {page?.type === 'review' && (
              <div>
                <p className="eyebrow">Almost there</p>
                <h2 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-semibold text-white outline-none">Review your application</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">Make sure everything looks right. You can jump back to any section before submitting.</p>

                <div className="mt-7 space-y-4">
                  {pages.filter((candidate): candidate is Extract<WizardPage, { type: 'questions' }> => candidate.type === 'questions').map((section) => (
                    <div key={section.stepOrder} className="rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-white">{section.label}</h3>
                        <button type="button" onClick={() => setPageIdx(pages.findIndex((candidate) => candidate.type === 'questions' && candidate.stepOrder === section.stepOrder))} className="text-xs font-medium text-gold hover:underline">Edit</button>
                      </div>
                      <dl className="mt-4 space-y-3">
                        {section.questions.map((q) => (
                          <div key={q.question_key} className="grid gap-0.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:gap-4">
                            <dt className="text-xs text-slate-500">{q.label}</dt>
                            <dd className="whitespace-pre-wrap text-sm text-slate-200">{q.input_type === 'datetime_window' ? displayValue(answers[q.question_key]).replace('|', ' · ') : displayValue(answers[q.question_key])}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>

                {copy?.service_application_disclaimer && (
                  <div className="mt-6 rounded-xl border border-white/10 bg-navy-950/50 p-4 text-xs leading-relaxed text-slate-500">
                    {copy.service_application_disclaimer}
                  </div>
                )}

                <div className="mt-6 rounded-xl border border-gold/20 bg-gold/[0.04] p-4 sm:p-5">
                  <h3 className="text-sm font-semibold text-white">Sign to submit</h3>
                  <label className="mt-3 block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Type your full legal name</span>
                    <input className={inputCls} value={signedName} onChange={(e) => setSignedName(e.target.value)} placeholder="Full name" />
                  </label>
                  <p className="mt-1.5 text-xs text-slate-500">Signing today, {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  <label className="mt-4 flex items-start gap-2.5 text-xs text-slate-300">
                    <input type="checkbox" checked={signatureAck} onChange={(e) => setSignatureAck(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/[0.04] accent-gold" />
                    <span>I certify the information in this application is accurate to the best of my knowledge, and I am electronically signing this form.</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-white/10 bg-navy-950/45 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            {pageIdx > 0 ? (
              <button type="button" onClick={() => void back()} disabled={busy || !!uploadingKey} className="btn-outline disabled:opacity-50">Back</button>
            ) : <span />}
            {page?.type === 'review' ? (
              <button type="button" onClick={() => void submit()} disabled={busy || !!uploadingKey || signedName.trim().length < 2 || !signatureAck} className="btn-gold disabled:opacity-60">
                {busy ? 'Submitting…' : 'Sign & submit application'}
              </button>
            ) : (
              <button type="button" onClick={() => void next()} disabled={busy || !!uploadingKey} className="btn-gold disabled:opacity-60">
                {page?.type === 'intro' ? 'Start application' : 'Continue'}
              </button>
            )}
          </div>
        </Card>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-600">
          <span>You can save and resume from My Services.</span>
          <Link to={p('services')} className="hover:text-gold">Exit application</Link>
        </div>
      </div>
    </div>
  )
}
