import { Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth, isApiError } from '../../lib/auth'
import { api } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { playWelcomeSound, primeAudio } from '../../lib/sound'
import { AuthLayout, Field, inputCls, ErrorBanner } from './AuthLayout'
import { Auth0Buttons, AuthDivider, type Auth0ProviderId, type Auth0ProviderOption } from '../../components/auth/Auth0Buttons'
import { clientWorkspaceForWorld, hqWorkspaceCopy, rememberOperatingWorld, rememberedHqParty, rememberedWorld, worldFromServiceParam } from '../../lib/workspace'

const AUTH_ERROR_COPY: Record<string, string> = {
  signin: 'We could not complete sign-in. If you already have a Pinnacle account, sign in with your email and password, then connect this method from Account Security.',
  link: 'If this sign-in method can be connected to your Pinnacle account, check your email for a confirmation link. You can also sign in with your password and connect it from Account Security.',
  unavailable: 'This sign-in method is unavailable right now. Please use your email and password.',
}

export default function Login({ surface }: { surface: 'client' | 'staff' }) {
  const { login, logout } = useAuth()
  const navigate = useNavigate()
  const p = useAppPath()
  const [params] = useSearchParams()
  const serviceKey = params.get('service') || ''
  const offeringId = params.get('offering') || ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [providers, setProviders] = useState<Auth0ProviderOption[]>([])

  const clientWorld = useMemo(() => worldFromServiceParam(serviceKey) || rememberedWorld() || 'general', [serviceKey])
  const clientCopy = clientWorkspaceForWorld(clientWorld)
  const hqCopy = hqWorkspaceCopy(rememberedHqParty())
  const showAuth0 = surface === 'client' && providers.length > 0

  useEffect(() => {
    if (surface === 'client' && clientWorld !== 'general') rememberOperatingWorld(clientWorld)
  }, [surface, clientWorld])

  useEffect(() => {
    const code = params.get('auth_error')
    if (code && AUTH_ERROR_COPY[code]) setError(AUTH_ERROR_COPY[code])
  }, [params])

  useEffect(() => {
    if (surface !== 'client') return
    api.get<{ enabled: boolean; providers: Auth0ProviderOption[] }>('/auth/auth0/status')
      .then((data) => setProviders(data.enabled ? data.providers : []))
      .catch(() => setProviders([]))
  }, [surface])

  function returnToPath() {
    if (serviceKey) {
      const offeringQuery = offeringId ? `?offering=${encodeURIComponent(offeringId)}` : ''
      return `${p(`services/${encodeURIComponent(serviceKey)}/apply`)}${offeringQuery}`
    }
    return p()
  }

  function startProvider(id: Auth0ProviderId) {
    if (busy) return
    primeAudio()
    setBusy(true)
    setError(null)
    const returnTo = encodeURIComponent(returnToPath())
    window.location.assign(`/api/auth/auth0/login?connection=${encodeURIComponent(id)}&returnTo=${returnTo}`)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
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

  const forgotQuery = `?surface=${surface}${email ? `&email=${encodeURIComponent(email)}` : ''}`

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

      {showAuth0 && (
        <>
          <Auth0Buttons providers={providers} busy={busy} onStart={startProvider} />
          <p className="mt-3 text-center text-[11px] leading-5 text-slate-500">
            By continuing with Google or Microsoft, you agree to the <a href="/terms" className="font-semibold text-gold hover:text-gold-300">Terms of Service</a> and <a href="/privacy" className="font-semibold text-gold hover:text-gold-300">Privacy Policy</a>.
          </p>
          <AuthDivider />
        </>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        <Field label="Email Address">
          <input className={inputCls} type="email" autoComplete="email" inputMode="email" required autoFocus={!showAuth0} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="Password" hint={<Link to={`../forgot-password${forgotQuery}`} className="font-semibold text-gold hover:text-gold-300">Forgot password?</Link>}>
          <div className="relative">
            <input className={`${inputCls} pr-12`} type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-slate-500 transition hover:text-gold focus-visible:text-gold" aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </Field>
        <button type="submit" disabled={busy} aria-busy={busy} className="btn-gold min-h-12 w-full text-[15px] disabled:opacity-60">{busy ? 'Signing In…' : surface === 'staff' ? 'Enter workspace' : 'Open my workspace'}</button>
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
