import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { Card, StatusBadge, Logo } from '../../components/ui'
import { ThemeToggle } from '../../components/ThemeToggle'
import { inputCls } from '../auth/AuthLayout'
import { LoadingScreen } from '../../components/LoadingScreen'
import { useAppPath } from '../../lib/basePath'
import { clientWorkspace, onboardingWorldCopy, resolveWorld, worldFromServiceParam } from '../../lib/workspace'

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
  const p = useAppPath()
  const [params] = useSearchParams()
  const intentService = params.get('service') || ''
  const intentOffering = params.get('offering') || ''
  const welcome = params.get('welcome') === '1'
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>('services')
  const [catalog, setCatalog] = useState<Service[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [questions, setQuestions] = useState<Question[]>([])
  const [questionServiceIndex, setQuestionServiceIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function destination() {
    if (intentService && intentOffering) return `${p(`services/${encodeURIComponent(intentService)}/apply`)}?offering=${encodeURIComponent(intentOffering)}`
    return p()
  }

  useEffect(() => {
    ;(async () => {
      try {
        const [status, cat] = await Promise.all([
          api.get<{ completed: boolean; services: string[] }>('/portal/onboarding'),
          api.get<{ services: Service[] }>('/portal/services-catalog'),
        ])
        setCatalog(cat.services)
        if (status.completed) {
          if (intentService && intentOffering) navigate(`${p(`services/${encodeURIComponent(intentService)}/apply`)}?offering=${encodeURIComponent(intentOffering)}`, { replace: true })
          else navigate(p(), { replace: true })
          return
        }
        const initial = new Set(status.services || [])
        if (intentService && cat.services.some((service) => service.key === intentService)) initial.add(intentService)
        setSelected(initial)
      } catch {
        setError('We could not load your welcome setup. You can return to the portal and try again.')
      } finally {
        setLoading(false)
      }
    })()
  }, [intentService, intentOffering, navigate, p])

  const grouped = useMemo(() => {
    const map = new Map<string, Question[]>()
    for (const question of questions) {
      if (!map.has(question.service_key)) map.set(question.service_key, [])
      map.get(question.service_key)!.push(question)
    }
    return map
  }, [questions])

  const selectedServices = useMemo(() => catalog.filter((service) => selected.has(service.key)), [catalog, selected])
  const currentService = selectedServices[questionServiceIndex]
  const currentQuestions = currentService ? grouped.get(currentService.key) || [] : []
  const totalJourneySteps = Math.max(3, selectedServices.length + 2)
  const progressStep = step === 'services' ? 1 : step === 'review' ? totalJourneySteps : Math.min(totalJourneySteps - 1, questionServiceIndex + 2)
  const intentWorld = worldFromServiceParam(intentService) || resolveWorld(Array.from(selected))
  const worldCopy = onboardingWorldCopy(intentWorld)
  const catalogByWorld = useMemo(() => {
    const buckets: Record<string, Service[]> = { property: [], documents: [], business: [], funding: [], other: [] }
    for (const service of catalog) {
      const world = resolveWorld([service.key])
      if (world === 'general') buckets.other.push(service)
      else buckets[world].push(service)
    }
    return [
      { key: 'property', label: 'Property & field', items: buckets.property },
      { key: 'documents', label: 'Documents & signing', items: buckets.documents },
      { key: 'business', label: 'Business operations', items: buckets.business },
      { key: 'funding', label: 'Funding', items: buckets.funding },
      { key: 'other', label: 'Other', items: buckets.other },
    ].filter((group) => group.items.length)
      .sort((a, b) => Number(b.key === intentWorld) - Number(a.key === intentWorld))
  }, [catalog, intentWorld])

  function toggleService(key: string) {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function goToQuestions() {
    setError(null)
    if (selected.size === 0) return setError('Choose the area that feels closest to what brought you here. You can change it later.')
    setBusy(true)
    try {
      const keys = Array.from(selected)
      const response = await api.get<{ questions: Question[] }>(`/portal/onboarding/questions?services=${keys.join(',')}`)
      setQuestions(response.questions)
      setQuestionServiceIndex(0)
      setStep(response.questions.length ? 'questions' : 'review')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the next step.')
    } finally {
      setBusy(false)
    }
  }

  function questionKey(question: Question) {
    return `${question.service_key}.${question.question_key}`
  }

  function nextQuestionGroup() {
    setError(null)
    const missing = currentQuestions.filter((question) => question.required && !String(answers[questionKey(question)] || '').trim())
    if (missing.length) return setError(`Please complete ${missing.length === 1 ? 'the required field' : 'the required fields'} before continuing.`)
    if (questionServiceIndex < selectedServices.length - 1) setQuestionServiceIndex((index) => index + 1)
    else setStep('review')
  }

  function previousQuestionGroup() {
    setError(null)
    if (questionServiceIndex > 0) setQuestionServiceIndex((index) => index - 1)
    else setStep('services')
  }

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      await api.post('/portal/onboarding', { services: Array.from(selected), answers })
      navigate(destination(), { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError('A required detail is still missing. We brought you back so you can finish it.')
        setQuestionServiceIndex(0)
        setStep('questions')
      } else setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="min-h-screen bg-navy-radial px-4 py-7 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Logo />
          <ThemeToggle compact />
        </div>

        <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
          <aside className="lg:pt-3">
            <p className="eyebrow">{clientWorkspace([intentService].filter(Boolean)).badge}</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">{welcome ? 'Welcome. ' : ''}{worldCopy.title}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">{worldCopy.body}</p>
            <div className="mt-6 border-l border-white/10 pl-4">
              <p className="text-xs font-semibold text-white">Step {progressStep} of {totalJourneySteps}</p>
              <p className="mt-1 text-xs text-slate-500">{step === 'services' ? 'What brought you here' : step === 'questions' ? `A little about ${currentService?.name || 'your needs'}` : 'Confirm and enter your portal'}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gold transition-all" style={{ width: `${Math.round((progressStep / totalJourneySteps) * 100)}%` }} /></div>
            </div>
          </aside>

          <main>
            {error && <div className="mb-4 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

            {step === 'services' && (
              <Card className="!p-0">
                <div className="border-b border-white/10 px-5 py-5 sm:px-6">
                  <h2 className="text-lg font-semibold text-white">Which operating world are you in right now?</h2>
                  <p className="mt-1 text-sm text-slate-400">Choose the work in front of you. Your portal, mobile tabs, and next steps will follow that world.</p>
                </div>
                <div className="divide-y divide-white/10">
                  {catalogByWorld.map((group) => (
                    <div key={group.key}>
                      <p className="px-5 pt-4 text-[10px] font-semibold uppercase tracking-[.16em] text-gold/80 sm:px-6">{group.label}</p>
                      {group.items.map((service) => {
                        const checked = selected.has(service.key)
                        return (
                          <label key={service.key} className={`flex cursor-pointer items-start gap-4 px-5 py-4 transition sm:px-6 ${checked ? 'bg-gold/[0.06]' : 'hover:bg-white/[0.025]'}`}>
                            <input type="checkbox" className="mt-1 h-4 w-4 accent-gold" checked={checked} onChange={() => toggleService(service.key)} />
                            <span className="flex-1">
                              <span className="flex flex-wrap items-center gap-2"><span className="font-medium text-white">{service.name}</span>{service.key === intentService && <span className="text-[10px] font-semibold uppercase tracking-wide text-gold">What brought you here</span>}</span>
                              <span className="mt-1 block text-xs leading-5 text-slate-400">{service.description}</span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4 sm:px-6">
                  <button type="button" onClick={() => navigate(p(), { replace: true })} className="text-sm text-slate-400 hover:text-white">Explore the portal first</button>
                  <button onClick={goToQuestions} disabled={busy} className="btn-gold disabled:opacity-60">{busy ? 'Loading…' : 'Continue'}</button>
                </div>
              </Card>
            )}

            {step === 'questions' && currentService && (
              <Card>
                <p className="eyebrow">{currentService.category || 'Your needs'}</p>
                <h2 className="mt-2 text-xl font-semibold text-white">A little about {currentService.name}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">Share what you know today. Your Pinnacle team can clarify the rest with you later.</p>

                {currentQuestions.length === 0 ? <p className="mt-6 text-sm text-slate-400">No additional details are needed for this area right now.</p> : (
                  <div className="mt-6 space-y-5">
                    {currentQuestions.map((question) => {
                      const key = questionKey(question)
                      let options: string[] = []
                      try { options = question.options ? JSON.parse(question.options) as string[] : [] } catch { options = [] }
                      return (
                        <label key={key} className="block">
                          <span className="mb-1.5 block text-sm font-medium text-white">{question.label} {question.required ? <span className="text-gold">*</span> : null}</span>
                          {question.help_text && <span className="mb-2 block text-xs leading-5 text-slate-500">{question.help_text}</span>}
                          {question.input_type === 'select' ? (
                            <select className={inputCls} required={!!question.required} value={answers[key] ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))}><option value="">Choose an option…</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                          ) : question.input_type === 'textarea' ? (
                            <textarea className={`${inputCls} min-h-[100px]`} required={!!question.required} value={answers[key] ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))} />
                          ) : question.input_type === 'checkbox' ? (
                            <span className="flex items-center gap-3 rounded-lg border border-white/10 px-4 py-3"><input type="checkbox" className="h-4 w-4 accent-gold" checked={answers[key] === 'true'} onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.checked ? 'true' : '' }))} /><span className="text-sm text-slate-300">Yes</span></span>
                          ) : (
                            <input className={inputCls} type={question.input_type === 'number' ? 'number' : question.input_type === 'date' ? 'date' : 'text'} required={!!question.required} value={answers[key] ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))} />
                          )}
                        </label>
                      )
                    })}
                  </div>
                )}

                <div className="mt-7 flex items-center justify-between gap-3"><button onClick={previousQuestionGroup} className="btn-outline">Back</button><button onClick={nextQuestionGroup} className="btn-gold">{questionServiceIndex < selectedServices.length - 1 ? 'Next' : 'Review'}</button></div>
              </Card>
            )}

            {step === 'review' && (
              <Card>
                <p className="eyebrow">Ready for the portal</p>
                <h2 className="mt-2 text-xl font-semibold text-white">We have enough to start the conversation.</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">Your selections help Pinnacle understand where to begin. They do not lock you into a package. From here you can message us, upload documents, track work, and discover other support only when it becomes useful.</p>
                <div className="mt-5 flex flex-wrap gap-2">{selectedServices.map((service) => <StatusBadge key={service.key} tone="gold">{service.name}</StatusBadge>)}</div>
                <div className="mt-7 border-l-2 border-gold pl-4"><p className="text-sm font-medium text-white">What happens next</p><p className="mt-1 text-xs leading-5 text-slate-400">We will review what you shared, route it appropriately, and follow up if anything needs clarification. {intentService && intentOffering ? 'Next, we will open the exact service option you selected so you can complete its specific requirements.' : 'Your dashboard will keep the next action visible without making you learn the whole portal at once.'}</p></div>
                <div className="mt-7 flex items-center justify-between gap-3"><button onClick={() => { setQuestionServiceIndex(Math.max(0, selectedServices.length - 1)); setStep(questions.length ? 'questions' : 'services') }} className="btn-outline">Back</button><button onClick={submit} disabled={busy} className="btn-gold disabled:opacity-60">{busy ? 'Saving…' : intentService && intentOffering ? 'Continue to my service' : 'Enter my portal'}</button></div>
              </Card>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
