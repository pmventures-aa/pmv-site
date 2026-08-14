import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth, isApiError } from '../../lib/auth'
import { api, ApiError } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { services } from '../../data/services'
import { playWelcomeSound, primeAudio } from '../../lib/sound'
import { AuthLayout, Field, inputCls, ErrorBanner } from './AuthLayout'
import { clientTypeForWorld, clientWorkspaceForWorld, rememberedWorld, worldFromClientType, worldFromServiceParam } from '../../lib/workspace'
import { PUBLIC_SITE_URL } from '../../../shared/letterhead'

const MIN_PASSWORD = 10
type Step = 'contact' | 'business' | 'account'
interface InviteResponse { invite: { invite_type:string; email:string; full_name:string|null; status:string; expires_at:string; metadata?:Record<string,unknown> } }
interface ScopeResponse { request:{contact_name:string;email:string;phone:string|null;service_key:string|null;offering_id:string|null;job_type:string;timing:string;city:string|null;state:string|null};job_label:string }

export default function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const p = useAppPath()
  const [params] = useSearchParams()
  const inviteToken = params.get('invite') || ''
  const scopeToken = params.get('scope') || ''
  const directServiceKey = params.get('service') || ''
  const [scopeServiceKey,setScopeServiceKey]=useState('')
  const [scopeOfferingId,setScopeOfferingId]=useState('')
  const serviceKey = scopeServiceKey || directServiceKey
  const offeringId = scopeOfferingId || params.get('offering') || ''
  const requestedService = useMemo(() => services.find((service) => service.key === serviceKey), [serviceKey])
  const intentWorld = worldFromServiceParam(serviceKey) || rememberedWorld() || 'general'
  const [step, setStep] = useState<Step>('contact')
  const [invite, setInvite] = useState<InviteResponse['invite'] | null>(null)
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken)
  const [scopeLoading,setScopeLoading]=useState(!!scopeToken)
  const [scopeLabel,setScopeLabel]=useState('')
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', business_name: '', client_type: clientTypeForWorld(worldFromServiceParam(directServiceKey) || rememberedWorld() || 'general'), password: '', confirm: '' })
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

  useEffect(()=>{
    if(!scopeToken)return
    api.get<ScopeResponse>(`/scope-requests/${encodeURIComponent(scopeToken)}`).then(response=>{
      const full=response.request.contact_name.trim().split(/\s+/).filter(Boolean)
      const key=response.request.service_key||''
      setScopeServiceKey(key);setScopeOfferingId(response.request.offering_id||'');setScopeLabel(response.job_label)
      const clientType=clientTypeForWorld(worldFromServiceParam(key) || 'general') || (key==='property_management'||key==='property_inspections'?'property':key==='consulting'||key==='merchant_services'||key==='admin_support'?'business':'personal')
      setForm(current=>({...current,first_name:full[0]||current.first_name,last_name:full.slice(1).join(' ')||current.last_name,email:response.request.email||current.email,phone:response.request.phone||current.phone,client_type:clientType}))
    }).catch(err=>setError(err instanceof ApiError?err.message:'Could not load the request details.')).finally(()=>setScopeLoading(false))
  },[scopeToken])

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
    if (step === 'business' && next === 'account' && !form.client_type) return 'Choose the option that best describes what brought you to Pinnacle.'
    if (step === 'account') {
      if (form.password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`
      if (form.password !== form.confirm) return 'Passwords do not match.'
      if (!tosAccepted) return 'Please review and accept the account terms to continue.'
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
    primeAudio()
    setError(null)
    const message = validate()
    if (message) return setError(message)
    if (inviteToken && invite?.status !== 'pending') return setError('This invitation is no longer active.')
    setBusy(true)
    try {
      await signup({ email: form.email, password: form.password, first_name: form.first_name, last_name: form.last_name, phone: form.phone, business_name: form.business_name || undefined, tos_accepted: true })
      if (inviteToken) await api.post(`/invite/${encodeURIComponent(inviteToken)}/complete-existing`, {}).catch(() => {})
      if (scopeToken) await api.post(`/scope-requests/${encodeURIComponent(scopeToken)}/convert`, {}).catch(() => {})
      playWelcomeSound('client')
      const query = requestedService
        ? `?service=${encodeURIComponent(requestedService.key)}${offeringId ? `&offering=${encodeURIComponent(offeringId)}` : ''}&welcome=1`
        : '?welcome=1'
      navigate(`${p('onboarding')}${query}`, { replace: true })
    } catch (err) { setError(isApiError(err) ? err.message : 'We could not create your account. Please try again.') }
    finally { setBusy(false) }
  }

  const loginQuery = requestedService
    ? `?service=${encodeURIComponent(requestedService.key)}${offeringId ? `&offering=${encodeURIComponent(offeringId)}` : ''}`
    : ''

  const activeWorld = worldFromClientType(form.client_type) || intentWorld
  const copy = clientWorkspaceForWorld(activeWorld)
  const title = step === 'contact' ? 'Start this workspace' : step === 'business' ? 'Confirm the operating world' : 'Secure your account'
  const subtitle = step === 'contact'
    ? copy.loginBody
    : step === 'business'
      ? 'This choice shapes login, dashboard, and mobile tabs. You can add another world later without opening a new relationship.'
      : 'One final step. Then we continue into the workspace that matches the work in front of you.'
  const situationOptions:[string,string,string][] = [
    ['property','Property or field support','Inspections, cleaning, turnovers, vendors, access, and documented visits.'],
    ['business','Business or operations support','Capacity, systems, POS, project coordination, or funding navigation.'],
    ['personal','Documents, signing, or mobile work','Notary, RON, courier, filing, or another defined professional need.'],
  ]
  const preferredType = clientTypeForWorld(intentWorld)
  const orderedSituations = preferredType
    ? [...situationOptions.filter((item) => item[0] === preferredType), ...situationOptions.filter((item) => item[0] !== preferredType)]
    : situationOptions

  return (
    <AuthLayout
      surface="client"
      eyebrow={inviteToken ? 'Private Pinnacle invitation' : scopeToken ? 'Continue your request' : copy.loginEyebrow}
      title={title}
      subtitle={subtitle}
      sideLabel={copy.badge}
      sideTitle={copy.loginTitle}
      sideBody={copy.loginBody}
      sidePoints={copy.loginPoints}
      footer={<>Already have an account? <Link to={`../login${loginQuery}`} className="font-bold text-gold hover:text-gold-300">Sign In</Link></>}
    >
      <div className="mb-7">
        <div className="flex items-center justify-between text-xs"><span className="font-bold text-white">Step {index + 1} of {steps.length}</span><span className="font-semibold text-gold">{progress}% Complete</span></div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gold transition-all duration-300" style={{width:`${progress}%`}}/></div>
      </div>

      {inviteLoading && <p className="mb-4 text-sm text-slate-400">Loading your invitation…</p>}
      {scopeLoading && <p className="mb-4 text-sm text-slate-400">Connecting your request…</p>}
      {scopeToken&&!scopeLoading&&scopeLabel&&<div className="mb-5 rounded-xl border border-gold/20 bg-gold/[.05] p-4"><p className="text-sm font-bold text-white">Your request is already connected</p><p className="mt-1 text-xs leading-5 text-slate-400">We carried over your request for {scopeLabel}. This account gives you one place for updates, documents, estimates, and completion records.</p></div>}
      {requestedService && !inviteToken && <div className="mb-5 rounded-xl border border-gold/15 bg-gold/[.04] p-4"><p className="text-sm font-bold text-white">We Remember What Brought You Here</p><p className="mt-1 text-xs leading-5 text-slate-400">{requestedService.shortDescription}</p></div>}
      {inviteToken && invite?.status === 'pending' && <div className="mb-5 rounded-xl border border-gold/20 bg-gold/[0.05] p-3 text-xs text-slate-400">Connected to your private Pinnacle invitation. Expires {new Date(invite.expires_at).toLocaleString()}.</div>}
      <ErrorBanner message={error} />

      {step === 'contact' && <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="First Name"><input className={inputCls} autoComplete="given-name" value={form.first_name} onChange={(e)=>set('first_name',e.target.value)} placeholder="First name"/></Field><Field label="Last Name"><input className={inputCls} autoComplete="family-name" value={form.last_name} onChange={(e)=>set('last_name',e.target.value)} placeholder="Last name"/></Field></div>
        <Field label="Email Address"><input className={inputCls} type="email" autoComplete="email" readOnly={!!inviteToken} value={form.email} onChange={(e)=>set('email',e.target.value)} placeholder="you@example.com"/></Field>
        <Field label="Mobile Phone"><input className={inputCls} type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e)=>set('phone',e.target.value)} placeholder="(555) 555-5555"/></Field>
        <button type="button" className="btn-gold min-h-12 w-full" onClick={()=>go('business')}>Continue</button>
      </div>}

      {step === 'business' && <div>
        <p className="mb-3 text-sm font-bold text-slate-200">Which operating world are you in right now?</p>
        <div className="space-y-2">{orderedSituations.map(([value,itemTitle,body])=><button key={value} type="button" onClick={()=>set('client_type',value)} className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${form.client_type===value?'border-gold/45 bg-gold/[.07]':'border-white/10 bg-white/[.018] hover:border-white/20 hover:bg-white/[.035]'}`}><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold ${form.client_type===value?'border-gold bg-gold text-navy-950':'border-white/20 text-transparent'}`}>✓</span><span><span className="block text-sm font-bold text-white">{itemTitle}</span><span className="mt-1 block text-xs leading-5 text-slate-400">{body}</span></span></button>)}</div>
        {(form.client_type==='business'||form.client_type==='property')&&<div className="mt-5"><Field label="Business or Property Company Name" hint="Optional"><input className={inputCls} autoComplete="organization" value={form.business_name} onChange={(e)=>set('business_name',e.target.value)} placeholder="Company or property entity"/></Field></div>}
        <div className="mt-6 flex gap-3"><button type="button" className="btn-outline flex-1" onClick={()=>setStep('contact')}>Back</button><button type="button" className="btn-gold flex-[1.5]" onClick={()=>go('account')}>Continue</button></div>
      </div>}

      {step === 'account' && <div className="space-y-5">
        <div className="rounded-xl border border-white/10 bg-white/[.025] p-4 text-xs leading-5 text-slate-400"><strong className="font-bold text-white">What happens next:</strong> we will ask a few focused questions about {requestedService ? requestedService.title : copy.badge.toLowerCase()} and request documents only when the work actually needs them.</div>
        <Field label="Password" hint={`${MIN_PASSWORD}+ characters`}><input className={inputCls} type="password" autoComplete="new-password" value={form.password} onChange={(e)=>set('password',e.target.value)} placeholder="Create a strong password"/></Field>
        <Field label="Confirm Password"><input className={inputCls} type="password" autoComplete="new-password" value={form.confirm} onChange={(e)=>set('confirm',e.target.value)} placeholder="Enter it again"/></Field>
        <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[.018] p-3.5 text-xs leading-5 text-slate-400"><input type="checkbox" checked={tosAccepted} onChange={(e)=>setTosAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/[0.04] accent-gold"/><span>I agree to the <a href={`${PUBLIC_SITE_URL}/terms`} target="_blank" rel="noreferrer" className="font-bold text-gold hover:text-gold-300">Terms of Service</a>, acknowledge the <a href={`${PUBLIC_SITE_URL}/privacy`} target="_blank" rel="noreferrer" className="font-bold text-gold hover:text-gold-300">Privacy Policy</a>, and consent to the <a href={`${PUBLIC_SITE_URL}/electronic-communications`} target="_blank" rel="noreferrer" className="font-bold text-gold hover:text-gold-300">Electronic Communications Disclosure</a> for account and service-related communications.</span></label>
        <p className="text-[11px] leading-5 text-slate-500">Creating an account does not require consent to promotional marketing. Marketing messages, if offered, use separate opt-in and opt-out controls.</p>
        <div className="flex gap-3"><button type="button" className="btn-outline flex-1" onClick={()=>setStep('business')}>Back</button><button type="button" disabled={busy||inviteLoading||scopeLoading|| (!!inviteToken&&invite?.status!=='pending')} className="btn-gold flex-[1.5] disabled:opacity-60" onClick={()=>void submit()}>{busy?'Creating Your Workspace…':'Create My Account'}</button></div>
      </div>}
    </AuthLayout>
  )
}
