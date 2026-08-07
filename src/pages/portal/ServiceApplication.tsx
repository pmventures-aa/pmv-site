import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { Card, PageHeader, StatusBadge } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'
import { useAppPath } from '../../lib/basePath'
import { InlineLoading } from '../../components/LoadingScreen'

interface CatalogItem {
  key: string
  name: string
  description: string
}
interface Question {
  id: string
  service_key: string
  question_key: string
  label: string
  help_text: string | null
  input_type: 'text' | 'textarea' | 'select' | 'number' | 'date'
  options: string | null
  required: number
  step_label: string | null
  step_order: number
}

// Services where we also collect ACH banking info as part of the application
// (never card data — see functions/_lib/crypto.ts for why).
const BANKING_SERVICES = new Set(['merchant_services', 'funding'])

type Page = { type: 'questions'; stepIndex: number } | { type: 'banking' } | { type: 'review' }

function Field({ q, value, onChange }: { q: Question; value: string; onChange: (v: string) => void }) {
  const opts: string[] = q.options ? JSON.parse(q.options) : []
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
        {q.label} {q.required ? <span className="text-gold">*</span> : null}
      </span>
      {q.help_text && <span className="mb-1.5 block text-xs text-slate-500">{q.help_text}</span>}
      {q.input_type === 'select' ? (
        <select className={inputCls} required={!!q.required} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : q.input_type === 'textarea' ? (
        <textarea className={`${inputCls} min-h-[90px]`} required={!!q.required} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          className={inputCls}
          type={q.input_type === 'number' ? 'number' : q.input_type === 'date' ? 'date' : 'text'}
          required={!!q.required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  )
}

export default function ServiceApplication() {
  const { key } = useParams<{ key: string }>()
  const navigate = useNavigate()
  const p = useAppPath()
  const [loading, setLoading] = useState(true)
  const [service, setService] = useState<CatalogItem | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [banking, setBanking] = useState({ account_holder_name: '', bank_name: '', account_type: 'checking', routing_number: '', account_number: '' })
  const [skipBanking, setSkipBanking] = useState(false)
  const [pageIdx, setPageIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!key) return
    ;(async () => {
      try {
        const [cat, qs] = await Promise.all([
          api.get<{ services: CatalogItem[] }>('/portal/services-catalog'),
          api.get<{ questions: Question[] }>(`/portal/onboarding/questions?services=${key}`),
        ])
        setService(cat.services.find((s) => s.key === key) ?? null)
        setQuestions(qs.questions)
      } finally {
        setLoading(false)
      }
    })()
  }, [key])

  const steps = useMemo(() => {
    const byStep = new Map<number, { label: string | null; questions: Question[] }>()
    for (const q of questions) {
      if (!byStep.has(q.step_order)) byStep.set(q.step_order, { label: q.step_label, questions: [] })
      byStep.get(q.step_order)!.questions.push(q)
    }
    return Array.from(byStep.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v)
  }, [questions])

  const needsBanking = key ? BANKING_SERVICES.has(key) : false
  const pages: Page[] = [
    ...steps.map((_, i) => ({ type: 'questions', stepIndex: i }) as const),
    ...(needsBanking ? [{ type: 'banking' } as const] : []),
    { type: 'review' as const },
  ]
  const page = pages[pageIdx]

  function validateCurrentPage(): string | null {
    if (page?.type === 'questions') {
      const step = steps[page.stepIndex]
      for (const q of step.questions) {
        if (q.required && !answers[q.question_key]?.trim()) return `Please fill in "${q.label}" before continuing.`
      }
    }
    if (page?.type === 'banking' && !skipBanking) {
      if (banking.account_holder_name && (!banking.routing_number || !banking.account_number)) {
        return 'Fill in both the routing and account number, or check "skip for now."'
      }
      if (banking.routing_number && !/^\d{9}$/.test(banking.routing_number.replace(/\s/g, ''))) {
        return 'Routing number must be 9 digits.'
      }
    }
    return null
  }

  function next() {
    const err = validateCurrentPage()
    if (err) {
      setError(err)
      return
    }
    setError(null)
    setPageIdx((i) => Math.min(i + 1, pages.length - 1))
  }
  function back() {
    setError(null)
    setPageIdx((i) => Math.max(i - 1, 0))
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { answers }
      if (needsBanking && !skipBanking && banking.account_holder_name && banking.routing_number && banking.account_number) {
        body.banking = banking
      }
      await api.post(`/portal/services/${key}/apply`, body)
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <InlineLoading />
  if (!service) return <p className="text-sm text-slate-400">Unknown service.</p>

  if (done) {
    return (
      <div>
        <PageHeader eyebrow="Application submitted" title={service.name} />
        <Card className="max-w-2xl text-center">
          <p className="text-xl font-semibold text-white">Thanks — we've got it.</p>
          <p className="mt-2 text-sm text-slate-300">
            Your {service.name} application has been sent to your Pinnacle team. They'll follow up shortly.
          </p>
          <Link to={p('services')} className="btn-gold mt-6 inline-block">
            Back to My Services
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader eyebrow="Start your journey" title={service.name} subtitle={service.description} />

      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-center gap-2">
          {pages.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
                  i === pageIdx ? 'bg-gold text-navy-950' : i < pageIdx ? 'bg-emerald-400/80 text-navy-950' : 'bg-white/10 text-slate-400'
                }`}
              >
                {i + 1}
              </div>
              {i < pages.length - 1 && <div className="h-px w-6 bg-white/10" />}
            </div>
          ))}
        </div>

        {error && <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm text-rose-200">{error}</div>}

        <Card>
          {page?.type === 'questions' && (
            <>
              <h2 className="mb-4 text-lg font-semibold text-white">{steps[page.stepIndex].label || 'Tell us more'}</h2>
              <div className="space-y-4">
                {steps[page.stepIndex].questions.map((q) => (
                  <Field
                    key={q.id}
                    q={q}
                    value={answers[q.question_key] ?? ''}
                    onChange={(v) => setAnswers((a) => ({ ...a, [q.question_key]: v }))}
                  />
                ))}
              </div>
            </>
          )}

          {page?.type === 'banking' && (
            <>
              <h2 className="mb-2 text-lg font-semibold text-white">Banking information</h2>
              <p className="mb-4 text-sm text-slate-400">
                Used to set up deposits for this service. Optional right now — you can skip and provide it later
                directly with your assigned specialist.
              </p>
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Account holder name</span>
                  <input
                    className={inputCls}
                    value={banking.account_holder_name}
                    onChange={(e) => setBanking((b) => ({ ...b, account_holder_name: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Bank name</span>
                  <input className={inputCls} value={banking.bank_name} onChange={(e) => setBanking((b) => ({ ...b, bank_name: e.target.value }))} />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Account type</span>
                    <select className={inputCls} value={banking.account_type} onChange={(e) => setBanking((b) => ({ ...b, account_type: e.target.value }))}>
                      <option value="checking">Checking</option>
                      <option value="savings">Savings</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Routing number</span>
                    <input
                      className={inputCls}
                      inputMode="numeric"
                      maxLength={9}
                      value={banking.routing_number}
                      onChange={(e) => setBanking((b) => ({ ...b, routing_number: e.target.value.replace(/\D/g, '') }))}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Account number</span>
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    value={banking.account_number}
                    onChange={(e) => setBanking((b) => ({ ...b, account_number: e.target.value.replace(/\D/g, '') }))}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={skipBanking} onChange={(e) => setSkipBanking(e.target.checked)} />
                  Skip for now — I'll provide this later
                </label>
                <p className="text-xs text-slate-500">
                  We never collect card numbers here. Payment processing setup uses a secure gateway your specialist will send you separately.
                </p>
              </div>
            </>
          )}

          {page?.type === 'review' && (
            <>
              <h2 className="mb-4 text-lg font-semibold text-white">Review &amp; submit</h2>
              <div className="mb-4 flex flex-wrap gap-2">
                <StatusBadge tone="gold">{service.name}</StatusBadge>
              </div>
              <p className="mb-6 text-sm text-slate-400">
                We'll route this application to the right specialist and follow up shortly. You can review or update
                details anytime from My Services.
              </p>
            </>
          )}

          <div className="mt-6 flex justify-between">
            {pageIdx > 0 ? (
              <button onClick={back} className="btn-outline">
                Back
              </button>
            ) : (
              <span />
            )}
            {page?.type === 'review' ? (
              <button onClick={submit} disabled={busy} className="btn-gold disabled:opacity-60">
                {busy ? 'Submitting…' : 'Submit application'}
              </button>
            ) : (
              <button onClick={next} className="btn-gold">
                Continue
              </button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
