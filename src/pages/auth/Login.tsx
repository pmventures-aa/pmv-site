import { Eye, EyeOff, LockKeyhole, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth, isApiError } from '../../lib/auth'
import { useAppPath } from '../../lib/basePath'
import { playWelcomeSound, primeAudio } from '../../lib/sound'
import { AuthLayout, Field, inputCls, ErrorBanner } from './AuthLayout'
import { clientWorkspaceForWorld, hqWorkspaceCopy, rememberOperatingWorld, rememberedHqParty, rememberedWorld, worldFromServiceParam } from '../../lib/workspace'

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

  const clientWorld = useMemo(() => worldFromServiceParam(serviceKey) || rememberedWorld() || 'general', [serviceKey])
  const clientCopy = clientWorkspaceForWorld(clientWorld)
  const hqCopy = hqWorkspaceCopy(rememberedHqParty())

  useEffect(() => {
    if (surface === 'client' && clientWorld !== 'general') rememberOperatingWorld(clientWorld)
  }, [surface, clientWorld])

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

  const signupQuery = serviceKey
    ? `?service=${encodeURIComponent(serviceKey)}${offeringId ? `&offering=${encodeURIComponent(offeringId)}` : ''}`
    : ''
  const forgotQuery = `?surface=${surface}${email ? `&email=${encodeURIComponent(email)}` : ''}`

  return (
    <AuthLayout
      surface={surface}
      eyebrow={surface === 'staff' ? hqCopy.loginEyebrow : clientCopy.loginEyebrow}
      title="Welcome back"
      subtitle={surface === 'staff'
        ? hqCopy.loginBody
        : serviceKey
          ? 'Sign in and we will return you to the service you were exploring.'
          : clientCopy.loginBody}
      sideLabel={surface === 'staff' ? hqCopy.badge : clientCopy.badge}
      sideTitle={surface === 'staff' ? hqCopy.loginTitle : clientCopy.loginTitle}
      sideBody={surface === 'staff' ? hqCopy.loginBody : clientCopy.loginBody}
      sidePoints={surface === 'staff' ? undefined : clientCopy.loginPoints}
      footer={surface === 'client'
        ? <span>New to Pinnacle? <Link to={`../signup${signupQuery}`} className="font-bold text-gold transition hover:text-gold-300">Start your workspace</Link></span>
        : <span className="text-slate-500">HQ and provider access is provisioned by Pinnacle.</span>}
    >
      <ErrorBanner message={error} />
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
        <button type="submit" disabled={busy} className="btn-gold min-h-12 w-full text-[15px] disabled:opacity-60">{busy ? 'Signing In…' : surface === 'staff' ? 'Enter workspace' : 'Open my workspace'}</button>
      </form>

      {surface === 'client' && (
        <div className="mt-6 rounded-xl border border-gold/15 bg-gold/[.045] p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gold/10 text-gold"><Sparkles size={16} /></span>
            <div>
              <p className="text-sm font-bold text-white">Need a different kind of help?</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Property, documents, operations, and funding each have their own workspace. Start from the work in front of you.</p>
              <Link to={`../signup${signupQuery}`} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-gold hover:text-gold-300"><LockKeyhole size={13} /> Start your workspace</Link>
            </div>
          </div>
        </div>
      )}
    </AuthLayout>
  )
}
