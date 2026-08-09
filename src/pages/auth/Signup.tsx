import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth, isApiError } from '../../lib/auth'
import { api, ApiError } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { services } from '../../data/services'
import { AuthLayout, Field, inputCls, ErrorBanner } from './AuthLayout'

const MIN_PASSWORD = 10
interface InviteResponse { invite: { invite_type:string; email:string; full_name:string|null; status:string; expires_at:string; metadata?:Record<string,unknown> } }

export default function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const p = useAppPath()
  const [params] = useSearchParams()
  const inviteToken = params.get('invite') || ''
  const serviceKey = params.get('service') || ''
  const requestedService = useMemo(() => services.find((service) => service.key === serviceKey), [serviceKey])
  const [invite, setInvite] = useState<InviteResponse['invite'] | null>(null)
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', business_name: '', password: '', confirm: '' })
  const [tosAccepted, setTosAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!inviteToken) return
    api.get<InviteResponse>(`/invite/${encodeURIComponent(inviteToken)}`)
      .then((r) => {
        if (r.invite.invite_type !== 'client') throw new Error('This is not a client invitation.')
        setInvite(r.invite)
        const parts = (r.invite.full_name || '').trim().split(/\s+/).filter(Boolean)
        setForm((current) => ({ ...current, first_name: parts[0] || current.first_name, last_name: parts.slice(1).join(' ') || current.last_name, email: r.invite.email || current.email }))
        if (r.invite.status !== 'pending') setError(`This invitation is ${r.invite.status}.`)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not load this invitation.'))
      .finally(() => setInviteLoading(false))
  }, [inviteToken])

  function set<K extends keyof typeof form>(key: K, value: string) { setForm((current) => ({ ...current, [key]: value })) }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null)
    if (form.password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters.`)
    if (form.password !== form.confirm) return setError('Passwords do not match.')
    if (!form.phone.trim()) return setError('A phone number is required.')
    if (!tosAccepted) return setError('You must accept the Terms of Service to create an account.')
    if (inviteToken && invite?.status !== 'pending') return setError('This invitation is no longer active.')
    setBusy(true)
    try {
      await signup({ email: form.email, password: form.password, first_name: form.first_name, last_name: form.last_name, phone: form.phone, business_name: form.business_name || undefined, tos_accepted: true })
      if (inviteToken) await api.post(`/invite/${encodeURIComponent(inviteToken)}/complete-existing`, {}).catch(() => {})
      const query = requestedService ? `?service=${encodeURIComponent(requestedService.key)}&welcome=1` : '?welcome=1'
      navigate(`${p('onboarding')}${query}`, { replace: true })
    } catch (err) { setError(isApiError(err) ? err.message : 'Something went wrong. Try again.') }
    finally { setBusy(false) }
  }

  return (
    <AuthLayout
      eyebrow={inviteToken ? 'Pinnacle invitation' : requestedService ? 'Your Pinnacle journey' : 'Client portal'}
      title={inviteToken ? 'Set up your Pinnacle account' : requestedService ? `Start with ${requestedService.title}` : 'Create your account'}
      subtitle={inviteToken ? 'Your private invitation connects this account to your existing conversation with Pinnacle and expires after 24 hours.' : requestedService ? 'Start with the basics. Once you’re inside, we’ll pick up where you left off and learn about your needs a little at a time.' : 'Start with the basics. You do not need to know every service you need before creating your account.'}
      footer={<>Already have an account? <Link to={`../login${requestedService ? `?service=${encodeURIComponent(requestedService.key)}` : ''}`} className="font-medium text-gold hover:underline">Sign in</Link></>}
    >
      {inviteLoading && <p className="mb-4 text-sm text-slate-400">Loading invitation…</p>}
      {requestedService && !inviteToken && <div className="mb-5 border-l-2 border-gold pl-4"><p className="text-sm font-medium text-white">We’ll remember what brought you here.</p><p className="mt-1 text-xs leading-5 text-slate-400">{requestedService.shortDescription}</p></div>}
      {inviteToken && invite?.status === 'pending' && <div className="mb-5 rounded-lg border border-gold/20 bg-gold/[0.05] p-4"><p className="text-sm font-semibold text-white">Invited by Pinnacle</p><p className="mt-1 text-xs text-slate-400">This private link expires {new Date(invite.expires_at).toLocaleString()}.</p></div>}
      <ErrorBanner message={error} />
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3"><Field label="First name"><input className={inputCls} required value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></Field><Field label="Last name"><input className={inputCls} required value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></Field></div>
        <Field label="Email"><input className={inputCls} type="email" autoComplete="email" required readOnly={!!inviteToken} value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Phone"><input className={inputCls} type="tel" required value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field><Field label="Business name (optional)"><input className={inputCls} value={form.business_name} onChange={(e) => set('business_name', e.target.value)} /></Field></div>
        <Field label={`Password (min ${MIN_PASSWORD} characters)`}><input className={inputCls} type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={form.password} onChange={(e) => set('password', e.target.value)} /></Field>
        <Field label="Confirm password"><input className={inputCls} type="password" autoComplete="new-password" required value={form.confirm} onChange={(e) => set('confirm', e.target.value)} /></Field>
        <label className="flex items-start gap-2.5 text-xs text-slate-400"><input type="checkbox" required checked={tosAccepted} onChange={(e) => setTosAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/[0.04] accent-gold"/><span>I agree to the <a href="https://pinnaclemanagementventures.com/terms" target="_blank" rel="noreferrer" className="font-medium text-gold hover:underline">Terms of Service</a> and to be contacted by Pinnacle Management Ventures about my services.</span></label>
        <button type="submit" disabled={busy || inviteLoading || (!!inviteToken && invite?.status !== 'pending')} className="btn-gold w-full disabled:opacity-60">{busy ? 'Creating account…' : 'Create my account'}</button>
      </form>
    </AuthLayout>
  )
}
