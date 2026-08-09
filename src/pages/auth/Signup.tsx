import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, isApiError } from '../../lib/auth'
import { AuthLayout, Field, inputCls, ErrorBanner } from './AuthLayout'

const MIN_PASSWORD = 10

export default function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    business_name: '',
    password: '',
    confirm: '',
  })
  const [tosAccepted, setTosAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (form.password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`)
      return
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }
    if (!form.phone.trim()) {
      setError('A phone number is required.')
      return
    }
    if (!tosAccepted) {
      setError('You must accept the Terms of Service to create an account.')
      return
    }
    setBusy(true)
    try {
      await signup({
        email: form.email,
        password: form.password,
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone,
        business_name: form.business_name || undefined,
        tos_accepted: true,
      })
      navigate('..', { relative: 'path', replace: true })
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="Client portal"
      title="Create your account"
      subtitle="Basic info to get started — you can explore services and add details once you're in."
      footer={
        <>
          Already have an account?{' '}
          <Link to="../login" className="font-medium text-gold hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <ErrorBanner message={error} />
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name">
            <input className={inputCls} required value={form.first_name} onChange={(e) => set('first_name', e.target.value)} />
          </Field>
          <Field label="Last name">
            <input className={inputCls} required value={form.last_name} onChange={(e) => set('last_name', e.target.value)} />
          </Field>
        </div>
        <Field label="Email">
          <input
            className={inputCls}
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <input className={inputCls} type="tel" required value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Business name (optional)">
            <input className={inputCls} value={form.business_name} onChange={(e) => set('business_name', e.target.value)} />
          </Field>
        </div>
        <Field label={`Password (min ${MIN_PASSWORD} characters)`}>
          <input
            className={inputCls}
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
          />
        </Field>
        <Field label="Confirm password">
          <input
            className={inputCls}
            type="password"
            autoComplete="new-password"
            required
            value={form.confirm}
            onChange={(e) => set('confirm', e.target.value)}
          />
        </Field>
        <label className="flex items-start gap-2.5 text-xs text-slate-400">
          <input
            type="checkbox"
            required
            checked={tosAccepted}
            onChange={(e) => setTosAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/[0.04] accent-gold"
          />
          <span>
            I agree to the{' '}
            <a href="https://pinnaclemanagementventures.com/terms" target="_blank" rel="noreferrer" className="font-medium text-gold hover:underline">
              Terms of Service
            </a>{' '}
            and to be contacted by Pinnacle Management Ventures about my services.
          </span>
        </label>
        <button type="submit" disabled={busy} className="btn-gold w-full disabled:opacity-60">
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}
