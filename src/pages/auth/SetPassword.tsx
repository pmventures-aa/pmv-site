import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useAuth, isApiError } from '../../lib/auth'
import { AuthLayout, Field, inputCls, ErrorBanner } from './AuthLayout'

const MIN_PASSWORD = 10

export default function SetPassword({ surface }: { surface: 'client' | 'staff' }) {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!token) {
      setError('This link is missing its setup token. Copy the full link from your invite exactly as sent.')
      return
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await api.post('/auth/set-password', { token, password })
      await refresh()
      setDone(true)
      setTimeout(() => navigate('..', { relative: 'path', replace: true }), 1200)
    } catch (err) {
      setError(isApiError(err) ? (err as ApiError).message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <AuthLayout eyebrow={surface === 'staff' ? 'Staff console' : 'Client portal'} title="Invalid setup link">
        <ErrorBanner message="This link is missing its setup token. Copy the full link from your invite exactly as sent, or ask an admin to send a new one." />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      eyebrow={surface === 'staff' ? 'Staff console' : 'Client portal'}
      title="Set your password"
      subtitle="Choose a password for your Pinnacle account. This link can only be used once."
    >
      {done ? (
        <p className="text-sm text-emerald-300">Password set: signing you in…</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <ErrorBanner message={error} />
          <Field label="New password">
            <input
              type="password"
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={MIN_PASSWORD}
              required
              autoFocus
            />
          </Field>
          <Field label="Confirm password">
            <input
              type="password"
              className={inputCls}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={MIN_PASSWORD}
              required
            />
          </Field>
          <button type="submit" disabled={busy} className="btn-gold w-full disabled:opacity-60">
            {busy ? 'Setting password…' : 'Set password & sign in'}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
