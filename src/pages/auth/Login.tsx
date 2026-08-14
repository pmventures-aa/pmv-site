import { Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth, isApiError } from '../../lib/auth'
import { api } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { playWelcomeSound, primeAudio } from '../../lib/sound'
import { AuthLayout, Field, inputCls, ErrorBanner } from './AuthLayout'
import { clientWorkspaceForWorld, hqWorkspaceCopy, rememberOperatingWorld, rememberedHqParty, rememberedWorld, worldFromServiceParam } from '../../lib/workspace'

type Auth0Provider = { id: string; label: string; button_label: string }

const AUTH0_ERROR_COPY: Record<string, string> = {
  start_failed: 'We could not start that sign-in method. Please try again or use your email and password.',
  provider_denied: 'Sign-in was cancelled. You can try again or use your email and password.',
  invalid_state: 'That sign-in link expired or was already used. Please try again.',
  nonce_invalid: 'We could not verify that sign-in attempt. Please try again.',
  token_invalid: 'We could not complete that sign-in. Please try again.',
  claims_invalid: 'We could not verify the sign-in response. Please try again.',
  email_unverified: 'Verify your email with Google or Microsoft, then try again.',
  account_exists: 'Sign in with your email and password, then connect Google or Microsoft from Account → Security.',
  account_unavailable: 'This account is not available for the Client Portal.',
  signin_failed: 'We could not complete sign-in. Please try again.',
  not_configured: 'External sign-in is not available right now. Use your email and password.',
  link_session: 'Sign in first, then connect Google or Microsoft from Account → Security.',
  link_conflict: 'That sign-in method is already connected to another account.',
  link_failed: 'We could not connect that sign-in method. Please try again.',
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48" className="shrink-0">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.1 4 9.2 8.5 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.1 39.4 16 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l.1.1 6.2 5.2C39.2 37.3 44 32 44 24c0-1.3-.1-2.5-.4-3.5z" />
    </svg>
  )
}

function MicrosoftMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 23 23" className="shrink-0">
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M12 1h10v10H12z" />
      <path fill="#00A4EF" d="M1 12h10v10H1z" />
      <path fill="#FFB900" d="M12 12h10v10H12z" />
    </svg>
  )
}

function providerIcon(id: string) {
  if (id === 'google-oauth2') return <GoogleMark />
  if (id === 'windowslive') return <MicrosoftMark />
  return null
}

export default function Login({ surface }: { surface: 'client' | 'staff' }) {
  const { login, logout, user, loading } = useAuth()
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
  const [auth0Busy, setAuth0Busy] = useState<string | null>(null)
  const [providers, setProviders] = useState<Auth0Provider[]>([])

  const clientWorld = useMemo(() => worldFromServiceParam(serviceKey) || rememberedWorld() || 'general', [serviceKey])
  const clientCopy = clientWorkspaceForWorld(clientWorld)
  const hqCopy = hqWorkspaceCopy(rememberedHqParty())

  useEffect(() => {
    if (surface === 'client' && clientWorld !== 'general') rememberOperatingWorld(clientWorld)
  }, [surface, clientWorld])

  useEffect(() => {
    const code = params.get('auth0_error')
    if (code) setError(AUTH0_ERROR_COPY[code] || 'We could not complete that sign-in. Please try again.')
  }, [params])

  useEffect(() => {
    if (surface !== 'client') return
    let cancelled = false
    api.get<{ enabled: boolean; providers: Auth0Provider[] }>('/auth/auth0/status')
      .then((data) => {
        if (!cancelled && data.enabled) setProviders(data.providers || [])
      })
      .catch(() => {
        if (!cancelled) setProviders([])
      })
    return () => { cancelled = true }
  }, [surface])

  useEffect(() => {
    if (loading || !user || surface !== 'client') return
    if (params.get('auth0_error')) return
    // Returning from Auth0 sets the session cookie; land in the portal.
    if (user.role === 'trusted_contact') navigate(p('trusted'), { replace: true })
    else if (serviceKey) {
      const offeringQuery = offeringId ? `?offering=${encodeURIComponent(offeringId)}` : ''
      navigate(`${p(`services/${encodeURIComponent(serviceKey)}/apply`)}${offeringQuery}`, { replace: true })
    } else navigate(p(), { replace: true })
  }, [loading, user, surface, navigate, p, serviceKey, offeringId, params])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || auth0Busy) return
    primeAudio()
    setError(null)
    setBusy(true)
    try {
      const nextUser = await login(email, password)
      const wrongStaffSurface = surface === 'staff' && (nextUser.role === 'client' || nextUser.role === 'trusted_contact')
      const wrongClientSurface = surface === 'client' && nextUser.role !== 'client' && nextUser.role !== 'trusted_contact'
      if (wrongStaffSurface || wrongClientSurface) {
        await logout().catch(() => {})
        setError(wrongStaffSurface
          ? 'This account belongs in the Client Portal. Please sign in there instead.'
          : 'This account belongs in Pinnacle HQ. Please sign in there instead.')
        return
      }

      playWelcomeSound(surface)
      if (surface === 'client' && nextUser.role === 'trusted_contact') {
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

  function startAuth0(providerId: string) {
    if (busy || auth0Busy) return
    setError(null)
    setAuth0Busy(providerId)
    const returnTo = serviceKey
      ? `${p(`services/${encodeURIComponent(serviceKey)}/apply`)}${offeringId ? `?offering=${encodeURIComponent(offeringId)}` : ''}`
      : p()
    const url = `/api/auth/auth0/login?connection=${encodeURIComponent(providerId)}&returnTo=${encodeURIComponent(returnTo)}`
    window.location.assign(url)
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

      {surface === 'client' && providers.length > 0 && (
        <div className="mb-6 space-y-3">
          {providers.map((provider) => (
            <button
              key={provider.id}
              type="button"
              disabled={Boolean(busy || auth0Busy)}
              onClick={() => startAuth0(provider.id)}
              className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/12 bg-white/[0.04] px-4 text-[15px] font-semibold text-white transition hover:border-gold/35 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/15 disabled:opacity-60"
            >
              {providerIcon(provider.id)}
              <span>{auth0Busy === provider.id ? 'Continuing…' : provider.button_label}</span>
            </button>
          ))}
          <div className="flex items-center gap-3 pt-1" role="separator" aria-label="Or continue with email">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[11px] font-semibold uppercase tracking-[.14em] text-slate-500">Or use email</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        <Field label="Email Address">
          <input className={inputCls} type="email" autoComplete="email" inputMode="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="Password" hint={<Link to={`../forgot-password${forgotQuery}`} className="font-semibold text-gold hover:text-gold-300">Forgot password?</Link>}>
          <div className="relative">
            <input className={`${inputCls} pr-12`} type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-slate-500 transition hover:text-gold" aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </Field>
        <button type="submit" disabled={busy || Boolean(auth0Busy)} className="btn-gold min-h-12 w-full text-[15px] disabled:opacity-60">{busy ? 'Signing In…' : surface === 'staff' ? 'Enter workspace' : 'Open my workspace'}</button>
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
