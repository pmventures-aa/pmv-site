import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth, isApiError } from '../../lib/auth'
import { useAppPath } from '../../lib/basePath'
import { AuthLayout, Field, inputCls, ErrorBanner } from './AuthLayout'

export default function Login({ surface }: { surface: 'client' | 'staff' }) {
  const { login } = useAuth()
  const navigate = useNavigate()
  const p = useAppPath()
  const [params] = useSearchParams()
  const serviceKey = params.get('service') || ''
  const offeringId = params.get('offering') || ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const user = await login(email, password)
      if (surface === 'staff' && (user.role === 'client' || user.role === 'trusted_contact')) {
        setError('This console is for Pinnacle staff accounts. Use the client portal to sign in.')
        return
      }
      if (surface === 'client' && user.role === 'trusted_contact') {
        navigate(p('trusted'), { replace: true })
        return
      }
      if (surface === 'client' && user.role !== 'client') {
        setError('This portal is for client and Trusted Contact accounts. Use Pinnacle HQ to sign in.')
        return
      }
      if (surface === 'client' && serviceKey) {
        const offeringQuery = offeringId ? `?offering=${encodeURIComponent(offeringId)}` : ''
        navigate(`${p(`services/${encodeURIComponent(serviceKey)}/apply`)}${offeringQuery}`, { replace: true })
        return
      }
      navigate(p(), { replace: true })
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const signupQuery = serviceKey
    ? `?service=${encodeURIComponent(serviceKey)}${offeringId ? `&offering=${encodeURIComponent(offeringId)}` : ''}`
    : ''

  return (
    <AuthLayout
      eyebrow={surface === 'staff' ? 'Staff console' : serviceKey ? 'Continue your Pinnacle journey' : 'Client portal'}
      title="Sign in"
      subtitle={surface === 'staff' ? 'Access for Pinnacle team members only.' : serviceKey ? 'Sign in and we’ll take you back to the service you were exploring.' : 'Welcome back. Sign in to your Pinnacle account.'}
      footer={surface === 'client' ? <>New to Pinnacle? <Link to={`../signup${signupQuery}`} className="font-medium text-gold hover:underline">Create an account</Link></> : <span className="text-slate-500">Staff and admin accounts are provisioned by Pinnacle.</span>}
    >
      <ErrorBanner message={error} />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email"><input className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><input className={inputCls} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <button type="submit" disabled={busy} className="btn-gold w-full disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </AuthLayout>
  )
}
