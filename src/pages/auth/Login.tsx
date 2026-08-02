import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, isApiError } from '../../lib/auth'
import { AuthLayout, Field, inputCls, ErrorBanner } from './AuthLayout'

export default function Login({ surface }: { surface: 'client' | 'staff' }) {
  const { login } = useAuth()
  const navigate = useNavigate()
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
      if (surface === 'staff' && user.role === 'client') {
        setError('This console is for Pinnacle staff accounts. Use the client portal to sign in.')
        return
      }
      navigate('..', { relative: 'path', replace: true })
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      eyebrow={surface === 'staff' ? 'Staff console' : 'Client portal'}
      title="Sign in"
      subtitle={
        surface === 'staff'
          ? 'Access for Pinnacle team members only.'
          : 'Welcome back — sign in to your Pinnacle account.'
      }
      footer={
        surface === 'client' ? (
          <>
            New to Pinnacle?{' '}
            <Link to="../signup" className="font-medium text-gold hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <span className="text-slate-500">Staff and admin accounts are provisioned by Pinnacle.</span>
        )
      }
    >
      <ErrorBanner message={error} />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email">
          <input
            className={inputCls}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            className={inputCls}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button type="submit" disabled={busy} className="btn-gold w-full disabled:opacity-60">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  )
}
