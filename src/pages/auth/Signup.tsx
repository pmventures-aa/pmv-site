import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth, isApiError } from '../../lib/auth'
import { api, ApiError } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { services } from '../../data/services'
import { AuthLayout, Field, inputCls, ErrorBanner } from './AuthLayout'

const MIN_PASSWORD = 10
type Step = 'contact' | 'business' | 'account'
interface InviteResponse { invite: { invite_type:string; email:string; full_name:string|null; status:string; expires_at:string; metadata?:Record<string,unknown> } }

export default function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const p = useAppPath()
  const [params] = useSearchParams()
  const inviteToken = params.get('invite') || ''
  const serviceKey = params.get('service') || ''
  const offeringId = params.get('offering') || ''
  const requestedService = useMemo(() => services.find((service) => service.key === serviceKey), [serviceKey])
  const [step, setStep] = useState<Step>('contact')
  const [invite, setInvite] = useState<InviteResponse['invite'] | null>(null)
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', business_name: '', client_type: '', password: '', confirm: '' })
  const [tosAccepted, setTosAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!inviteToken) return
    api.get<InviteResponse>(`/invite/${encodeURIComponent(inviteToken)}`)
      .then((response) => {
        if (response.invite.invite_type !== 'client') throw new Error('This is not a client invitation.')
        setInvite(response.invite)
        const parts = (response.invite.full_name || '').trim().split(/\s+/).filter(Boolean)
        setForm((current) => ({ ...current, first_name: parts[0] || current.first_name, last_name: parts.slice(1).join(' ') || current.last_name, email: response.invite.email || current.email }))
        if (response.invite.status !== 'pending') setError(`This invitation is ${response.invite.status}.`)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not load this invitation.'))
      .finally(() => setInviteLoading(false))
  }, [inviteToken])

  function set<K extends keyof typeof form>(key: K, value: string) { setForm((current) => ({ ...current, [key]: value })) }
  const steps: Step[] = ['contact','business','account']
  const index = steps.indexOf(step)
  const progress = Math.round(((index + 1) / steps.length) * 100)

  function validate(next?: Step) {
    if (step === 'contact') {
      if (!form.first_name.trim() || !form.last_name.trim()) return 'Enter your first and last name.'
      if (!form.email.includes('@')) return 'Enter a valid email address.'
      if (!form.phone.trim()) return 'Enter a phone number so your Pinnacle team can reach you.'
    }
    if (step === 'business' && next === 'account' && !form.client_type) return 'Choose the option that best describes you.'
    if (step === 'account') {
      if (form.password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`
      if (form.password !== form.confirm) return 'Passwords do not match.'
      if (!tosAccepted) return 'Accept the Terms of Service to create your account.'
    }
    return null
  }

  function go(next: Step) {
    setError(null)
    const message = validate(next)
    if (message) return setError(message)
    setStep(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submit() {
    setError(null)
    const message = validate()
    if (message) return setError(message)
    if (inviteToken && invite?.status !== 'pending') return setError('This invitation is no longer active.')
    setBusy(true)
    try {
      await signup({ email: form.email, password: form.password, first_name: form.first_name, last_name: form.last_name, phone: form.phone, business_name: form.business_name || undefined, tos_accepted: true })
      if (inviteToken) await api.post(`/invite/${encodeURIComponent(inviteToken)}/complete-existing`, {}).catch(() => {})
      const query = requestedService
        ? `?service=${encodeURIComponent(requestedService.key)}${offeringId ? `&offering=${encodeURIComponent(offeringId)}` : ''}&welcome=1`
        : '?welcome=1'
      navigate(`${p('onboarding')}${query}`, { replace: true })
    } catch (err) { setError(isApiError(err) ? err.message : 'Something went wrong. Try again.') }
    finally { setBusy(false) }
  }

  const loginQuery = requestedService
    ? `?service=${encodeURIComponent(requestedService.key)}${offeringId ? `&offering=${encodeURIComponent(offeringId)}` : ''}`
    : ''

  return (
    <AuthLayout
      eyebrow={inviteToken ? 'Pinnacle invitation' : requestedService ? 'Your Pinnacle journey' : 'Client portal'}
      title={step === 'contact' ? 'Start with you' : step === 'business' ? 'A little context' : 'Secure your account'}
      subtitle={step === 'contact' ? 'Just the basics. We’ll learn about the actual work after you’re inside.' : step === 'business' ? 'One quick choice helps us make the portal feel relevant from the start.' : 'Last step. Then we’ll pick up the service or situation that brought you here.'}
      footer={<>Already have an account? <Link to={`../login${loginQuery}`} className="font-medium text-gold hover:underline">Sign in</Link></>}
    >
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs"><span className="font-medium text-white">Step {index + 1} of {steps.length}</span><span className="text-gold">{progress}% complete</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gold transition-all" style={{width:`${progress}%`}}/></div>
        {progress >= 67 && <p className="mt-2 text-right text-[11px] text-emerald-300">Almost done</p>}
      </div>

      {inviteLoading && <p className="mb-4 text-sm text-slate-400">Loading invitation…</p>}
      {requestedService && !inviteToken && <div className="mb-5 border-l-2 border-gold pl-4"><p className="text-sm font-medium text-white">We’ll remember what brought you here.</p><p className="mt-1 text-xs leading-5 text-slate-400">{requestedService.shortDescription}</p></div>}
      {inviteToken && invite?.status === 'pending' && <div className="mb-5 rounded-lg border border-gold/20 bg-gold/[0.05] p-3 text-xs text-slate-400">Connected to your private Pinnacle invitation · expires {new Date(invite.expires_at).toLocaleString()}.</div>}
      <ErrorBanner message={error} />

      {step === 'contact' && <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3"><Field label="First name"><input className={inputCls} autoComplete="given-name" value={form.first_name} onChange={(e)=>set('first_name',e.target.value)}/></Field><Field label="Last name"><input className={inputCls} autoComplete="family-name" value={form.last_name} onChange={(e)=>set('last_name',e.target.value)}/></Field></div>
        <Field label="Email"><input className={inputCls} type="email" autoComplete="email" readOnly={!!inviteToken} value={form.email} onChange={(e)=>set('email',e.target.value)}/></Field>
        <Field label="Mobile phone"><input className={inputCls} type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e)=>set('phone',e.target.value)}/></Field>
        <button type="button" className="btn-gold w-full" onClick={()=>go('business')}>Continue</button>
      </div>}

      {step === 'business' && <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">What best describes you?</p>
        <div className="divide-y divide-white/10 border-y border-white/10">{[
          ['business','I’m here for a business','Consulting, payments/POS, funding, admin support, or another business need.'],
          ['property','I’m here for a property','Property coordination, inspection, vendor, field, or owner support.'],
          ['personal','I need a mobile/professional service','Notary, courier, document, or another defined personal/professional need.'],
        ].map(([value,title,body])=><button key={value} type="button" onClick={()=>set('client_type',value)} className={`flex w-full items-start gap-3 px-2 py-4 text-left transition ${form.client_type===value?'bg-gold/[.07]':'hover:bg-white/[.025]'}`}><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${form.client_type===value?'border-gold bg-gold text-navy-950':'border-white/20'}`}>{form.client_type===value?'✓':''}</span><span><span className="block text-sm font-medium text-white">{title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{body}</span></span></button>)}</div>
        {(form.client_type==='business'||form.client_type==='property')&&<div className="mt-5"><Field label="Business / property company name (optional)"><input className={inputCls} autoComplete="organization" value={form.business_name} onChange={(e)=>set('business_name',e.target.value)}/></Field></div>}
        <div className="mt-6 flex gap-2"><button type="button" className="btn-outline flex-1" onClick={()=>setStep('contact')}>Back</button><button type="button" className="btn-gold flex-[1.5]" onClick={()=>go('account')}>Continue</button></div>
      </div>}

      {step === 'account' && <div className="space-y-4">
        <div className="rounded-lg border border-white/10 bg-white/[.02] p-4 text-xs leading-5 text-slate-400"><strong className="text-white">Next:</strong> once your account is created, we’ll ask a few short questions about {requestedService ? requestedService.title : 'what brought you to Pinnacle'} and request documents only when that service actually needs them.</div>
        <Field label={`Password (at least ${MIN_PASSWORD} characters)`}><input className={inputCls} type="password" autoComplete="new-password" value={form.password} onChange={(e)=>set('password',e.target.value)}/></Field>
        <Field label="Confirm password"><input className={inputCls} type="password" autoComplete="new-password" value={form.confirm} onChange={(e)=>set('confirm',e.target.value)}/></Field>
        <label className="flex items-start gap-2.5 text-xs text-slate-400"><input type="checkbox" checked={tosAccepted} onChange={(e)=>setTosAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/[0.04] accent-gold"/><span>I agree to the <a href="https://pinnaclemanagementventures.com/terms" target="_blank" rel="noreferrer" className="font-medium text-gold hover:underline">Terms of Service</a> and to be contacted by Pinnacle Management Ventures about my services.</span></label>
        <div className="flex gap-2"><button type="button" className="btn-outline flex-1" onClick={()=>setStep('business')}>Back</button><button type="button" disabled={busy||inviteLoading|| (!!inviteToken&&invite?.status!=='pending')} className="btn-gold flex-[1.5] disabled:opacity-60" onClick={()=>void submit()}>{busy?'Creating account…':'Create my account'}</button></div>
      </div>}
    </AuthLayout>
  )
}
