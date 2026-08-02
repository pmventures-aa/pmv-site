import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { Card, StatusBadge, Crest } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'

interface Service {
  key: string
  name: string
  description: string
  category: string
}
interface Question {
  id: string
  service_key: string
  question_key: string
  label: string
  help_text: string | null
  input_type: 'text' | 'textarea' | 'select' | 'number' | 'date' | 'checkbox'
  options: string | null
  required: number
}

type Step = 'services' | 'questions' | 'review'

export default function OnboardingWizard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>('services')
  const [catalog, setCatalog] = useState<Service[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const [status, cat] = await Promise.all([
          api.get<{ completed: boolean; services: string[] }>('/portal/onboarding'),
          api.get<{ services: Service[] }>('/portal/services-catalog'),
        ])
        setCatalog(cat.services)
        if (status.completed) {
          navigate('..', { relative: 'path', replace: true })
          return
        }
        if (status.services?.length) setSelected(new Set(status.services))
      } catch {
        // ignore — fall through to empty state
      } finally {
        setLoading(false)
      }
    })()
  }, [navigate])

  const grouped = useMemo(() => {
    const byService = new Map<string, Question[]>()
    for (const q of questions) {
      if (!byService.has(q.service_key)) byService.set(q.service_key, [])
      byService.get(q.service_key)!.push(q)
    }
    return byService
  }, [questions])

  function toggleService(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function goToQuestions() {
    setError(null)
    if (selected.size === 0) {
      setError('Select at least one service to continue.')
      return
    }
    setBusy(true)
    try {
      const keys = Array.from(selected)
      const res = await api.get<{ questions: Question[] }>(`/portal/onboarding/questions?services=${keys.join(',')}`)
      setQuestions(res.questions)
      setStep('questions')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load questions.')
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      await api.post('/portal/onboarding', { services: Array.from(selected), answers })
      navigate('..', { relative: 'path', replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError('Please fill in all required fields before submitting.')
        setStep('questions')
      } else {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-navy-radial">
        <Crest size={64} className="animate-pulse" />
      </div>
    )
  }

  const steps: Step[] = ['services', 'questions', 'review']

  return (
    <div className="min-h-screen bg-navy-radial px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <Crest size={64} />
          <p className="eyebrow mt-4">Let's set up your account</p>
          <h1 className="mt-2 text-2xl font-bold text-white">Tell us what you need</h1>
          <p className="mt-2 text-sm text-slate-400">A few quick questions so we can route your work to the right specialists.</p>
        </div>

        <div className="mb-6 flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
                  step === s ? 'bg-gold text-navy-950' : steps.indexOf(step) > i ? 'bg-emerald-400/80 text-navy-950' : 'bg-white/10 text-slate-400'
                }`}
              >
                {i + 1}
              </div>
              {i < steps.length - 1 && <div className="h-px w-8 bg-white/10" />}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm text-rose-200">{error}</div>
        )}

        {step === 'services' && (
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-white">Which services are you interested in?</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {catalog.map((svc) => (
                <label
                  key={svc.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                    selected.has(svc.key) ? 'border-gold/60 bg-gold/10' : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(svc.key)}
                    onChange={() => toggleService(svc.key)}
                  />
                  <span>
                    <span className="block font-medium text-white">{svc.name}</span>
                    <span className="block text-xs text-slate-400">{svc.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={goToQuestions} disabled={busy} className="btn-gold disabled:opacity-60">
                {busy ? 'Loading…' : 'Continue'}
              </button>
            </div>
          </Card>
        )}

        {step === 'questions' && (
          <Card>
            {Array.from(grouped.entries()).map(([serviceKey, qs]) => {
              const svc = catalog.find((s) => s.key === serviceKey)
              return (
                <div key={serviceKey} className="mb-6 last:mb-0">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gold">
                    {svc?.name ?? serviceKey}
                  </h3>
                  <div className="space-y-4">
                    {qs.map((q) => {
                      const key = `${q.service_key}.${q.question_key}`
                      const opts: string[] = q.options ? JSON.parse(q.options) : []
                      return (
                        <label key={key} className="block">
                          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
                            {q.label} {q.required ? <span className="text-gold">*</span> : null}
                          </span>
                          {q.input_type === 'select' ? (
                            <select
                              className={inputCls}
                              required={!!q.required}
                              value={answers[key] ?? ''}
                              onChange={(e) => setAnswers((a) => ({ ...a, [key]: e.target.value }))}
                            >
                              <option value="">Select…</option>
                              {opts.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          ) : q.input_type === 'textarea' ? (
                            <textarea
                              className={`${inputCls} min-h-[90px]`}
                              required={!!q.required}
                              value={answers[key] ?? ''}
                              onChange={(e) => setAnswers((a) => ({ ...a, [key]: e.target.value }))}
                            />
                          ) : (
                            <input
                              className={inputCls}
                              type={q.input_type === 'number' ? 'number' : q.input_type === 'date' ? 'date' : 'text'}
                              required={!!q.required}
                              value={answers[key] ?? ''}
                              onChange={(e) => setAnswers((a) => ({ ...a, [key]: e.target.value }))}
                            />
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            <div className="mt-6 flex justify-between">
              <button onClick={() => setStep('services')} className="btn-outline">
                Back
              </button>
              <button onClick={() => setStep('review')} className="btn-gold">
                Review
              </button>
            </div>
          </Card>
        )}

        {step === 'review' && (
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-white">Review &amp; submit</h2>
            <div className="mb-6 flex flex-wrap gap-2">
              {Array.from(selected).map((key) => (
                <StatusBadge key={key} tone="gold">
                  {catalog.find((s) => s.key === key)?.name ?? key}
                </StatusBadge>
              ))}
            </div>
            <p className="mb-6 text-sm text-slate-400">
              We'll route these to the right team members and follow up to schedule an intro call. You can add more
              services anytime from the Services tab.
            </p>
            <div className="flex justify-between">
              <button onClick={() => setStep('questions')} className="btn-outline">
                Back
              </button>
              <button onClick={submit} disabled={busy} className="btn-gold disabled:opacity-60">
                {busy ? 'Submitting…' : 'Finish setup'}
              </button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
