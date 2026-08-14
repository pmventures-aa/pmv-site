import { Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth, isApiError } from '../../lib/auth'
import { useAppPath } from '../../lib/basePath'
import { api } from '../../lib/api'
import { playWelcomeSound, primeAudio } from '../../lib/sound'
import { AuthLayout, Field, inputCls, ErrorBanner } from './AuthLayout'
import { clientWorkspaceForWorld, hqWorkspaceCopy, rememberOperatingWorld, rememberedHqParty, rememberedWorld, worldFromServiceParam } from '../../lib/workspace'

type Auth0Provider = {
  id: string
  connection: string
  label: string
  loginPath: string
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#EA4335" d="M9 7.2v3.5h4.9c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.8-4.1 2.8-7 0-.7-.1-1.4-.2-2H9z" />
      <path fill="#34A853" d="M4.1 10.7l-.7.5-2.3 1.8C2.6 15.7 5.5 17.5 9 17.5c2.4 0 4.4-.8 5.9-2.2l-3.1-2.4c-.8.6-1.9.9-2.8.9-2.2 0-4-1.5-4.7-3.5z" />
      <path fill="#4A90E2" d="M1.1 5.4C.4 6.8 0 8.4 0 10s.4 3.2 1.1 4.6l3-2.3C3.8 11.5 3.6 10.8 3.6 10s.2-1.5.5-2.3l-3-2.3z" />
      <path fill="#FBBC05" d="M9 3.5c1.3 0 2.5.5 3.4 1.3l2.6-2.6C13.4.8 11.4 0 9 0 5.5 0 2.6 1.8 1.1 4.6l3 2.3C4.9 5 6.8 3.5 9 3.5z" />
    </svg>
  )
}

function MicrosoftMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="1" y="1" width="7.5" height="7.5" fill="#F25022" />
      <rect x="9.5" y="1" width="7.5" height="7.5" fill="#7FBA00" />
      <rect x="1" y="9.5" width="7.5" height="7.5" fill="#00A4EF" />
      <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#FFB900" />
    </svg>
  )
}

function ProviderIcon({ id }: { id: string }) {
  if (id === 'microsoft') return <MicrosoftMark />
  return <GoogleMark />
}

export default function Login({ surface }: { surface: 'client' | 'staff' }) {
  const { login, logout } = useAuth()
  const navigate = useNavigate()
  const p = useAppPath()
  const [params] = useSearchParams()
  const serviceKey = params.get('service') || ''
  const offeringId = params.get('offering') || ''
  const authError = params.get('auth_error') || ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(authError || null)
  const [busy, setBusy] = useState(false)
  const [providerBusy, setProviderBusy] = useState<string | null>(null)
  const [providers, setProviders] = useState<Auth0Provider[]>([])

  const clientWorld = useMemo(() => worldFromServiceParam(serviceKey) || rememberedWorld() || 'general', [serviceKey])
  const clientCopy = clientWorkspaceForWorld(clientWorld)
  const hqCopy = hqWorkspaceCopy(rememberedHqParty())

  useEffect(() => {
    if (surface === 'client' && clientWorld !== 'general') rememberOperatingWorld(clientWorld)
  }, [surface, clientWorld])

  useEffect(() => {
    if (surface !== 'client') return
    let cancelled = false
    api.get<{ enabled: boolean; providers: Auth0Provider[] }>('/auth/auth0/providers')
      .then((data) => {
        if (!cancelled && data.enabled && Array.isArray(data.providers)) setProviders(data.providers)
      })
      .catch(() => {
        if (!cancelled) setProviders([])
      })
    return () => { cancelled = true }
  }, [surface])

  useEffect(() => {
    if (authError) setError(authError)
  }, [authError])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    primeAudio()
    setError(null)
    setBusy(true)
    try {
      const user = await login(email, password)
      const wrongStaffSurface = surface === 'staff' && (user.role === 'client' || user.role === 'trusted_contact')
      const wrongClientSurface = surface === 'client' && user.role !== 'client' && user.role !== 'trusted_contact'
      if (wrongStaffSurface || wrongClientSurface) {
        await logout().catch(() => {})
        setError(wrongStaffSurface
          ? 'This account belongs in the Client Portal. Please sign in there instead.'
          : 'This account belongs in Pinnacle HQ. Please sign in there instead.')
        return
      }

      playWelcomeSound(surface)
      if (surface === 'client' && user.role === 'trusted_contact') {
        navigate(p('trusted'), { replace: true })
        return
      }
      if (surface === 'client' && serviceKey) {
        const offeringQuery = offeringId ? `?offering=${encodeURIComponent(offeringId)}` : ''
        navigate(`${p(`services/${encodeURIComponent(serviceKey)}/apply`)}${offeringQuery}`, { replace: true })
        return
      }
      navigate(p(), { replace: true })
    } catch (err) {
      setError(isApiError(err) ? err.message : 'We could not sign you in. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function startProviderLogin(provider: Auth0Provider) {
    if (providerBusy || busy) return
    setError(null)
    setProviderBusy(provider.id)
    const returnTo = serviceKey
      ? `/portal/services/${encodeURIComponent(serviceKey)}/apply${offeringId ? `?offering=${encodeURIComponent(offeringId)}` : ''}`
      : '/portal'
    const url = `${provider.loginPath}&returnTo=${encodeURIComponent(returnTo)}&surface=client`
    window.location.assign(url)
  }

  const forgotQuery = `?surface=${surface}${email ? `&email=${encodeURIComponent(email)}` : ''}`
  const formLocked = busy || Boolean(providerBusy)

  return (
    <AuthLayout
      surface={surface}
      liveCopy
      eyebrow={surface === 'staff' ? hqCopy.loginEyebrow : clientCopy.loginEyebrow}
      title={surface === 'staff' ? 'Come back in' : 'Welcome Back to Pinnacle'}
      subtitle={surface === 'client' ? 'Access your matters, documents, agreements, billing, and updates.' : undefined}
      sideLabel={surface === 'staff' ? hqCopy.badge : clientCopy.badge}
      footer={surface === 'client'
        ? <span>Not a client yet? <a href="/scope-request?source=login" className="font-bold text-gold transition hover:text-gold-300">Start a Request</a></span>
        : <span className="text-slate-500">HQ and provider access is provisioned by Pinnacle.</span>}
    >
      <ErrorBanner message={error} />
      {serviceKey && surface === 'client' && (
        <p className="mb-4 text-xs leading-5 text-slate-400">After you sign in, we will return you to the service you were exploring.</p>
      )}

      {surface === 'client' && providers.length > 0 && (
        <div className="mb-6 space-y-3">
          {providers.map((provider) => (
            <button
              key={provider.id}
              type="button"
              disabled={formLocked}
              onClick={() => startProviderLogin(provider)}
              className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/12 bg-white/[.04] px-4 text-[15px] font-semibold text-white transition hover:border-gold/35 hover:bg-white/[.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-60"
              aria-label={provider.label}
            >
              <ProviderIcon id={provider.id} />
              <span>{providerBusy === provider.id ? 'Continuing…' : provider.label}</span>
            </button>
          ))}
          <div className="relative py-1 text-center">
            <span className="relative z-10 bg-transparent px-3 text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500">or continue with email</span>
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" aria-hidden="true" />
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        <Field label="Email Address">
          <input className={inputCls} type="email" autoComplete="email" inputMode="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" disabled={formLocked} />
        </Field>
        <Field label="Password" hint={<Link to={`../forgot-password${forgotQuery}`} className="font-semibold text-gold hover:text-gold-300">Forgot password?</Link>}>
          <div className="relative">
            <input className={`${inputCls} pr-12`} type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" disabled={formLocked} />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-slate-500 transition hover:text-gold" aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </Field>
        <button type="submit" disabled={formLocked} className="btn-gold min-h-12 w-full text-[15px] disabled:opacity-60">{busy ? 'Signing In…' : surface === 'staff' ? 'Enter workspace' : 'Open my workspace'}</button>
      </form>

      {surface === 'client' && (
        <div className="mt-6 rounded-xl border border-gold/15 bg-gold/[.045] p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-gold/20 bg-gold/[.06] text-gold"><LockKeyhole size={15} /></span>
            <div>
              <p className="text-sm font-bold text-white">Not a client yet?</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Start with the situation. We will help determine the next step.</p>
              <a href="/scope-request?source=login" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-gold hover:text-gold-300">Start a Request</a>
            </div>
          </div>
        </div>
      )}
    </AuthLayout>
  )
}
