import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { AuthLayout, Field, inputCls, ErrorBanner } from './AuthLayout'

const MIN_PASSWORD = 10

export default function VendorSignup() {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    company_name: '',
    vendor_category: '',
    notes: '',
    password: '',
    confirm: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

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
    setBusy(true)
    try {
      await api.post('/auth/vendor-signup', {
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || undefined,
        company_name: form.company_name || undefined,
        vendor_category: form.vendor_category,
        notes: form.notes || undefined,
        password: form.password,
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthLayout eyebrow="Vendor / provider signup" title="Application received" subtitle="Thanks for applying to work with Pinnacle Management Ventures.">
        <p className="text-sm leading-relaxed text-slate-300">
          Your account is pending review. Once approved, you'll be able to sign in here with the email and password you just set.
        </p>
        <Link to="../login" className="btn-outline mt-6 inline-block w-full text-center">
          Back to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      eyebrow="Vendor / provider signup"
      title="Apply to work with Pinnacle"
      subtitle="For outside vendors and service providers — attorneys, contractors, funding partners, and other providers. Your account is reviewed before you can sign in."
      footer={
        <>
          Already approved?{' '}
          <Link to="../login" className="font-medium text-gold hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <ErrorBanner message={error} />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Full name">
          <input className={inputCls} required value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
        </Field>
        <Field label="Email">
          <input className={inputCls} type="email" autoComplete="email" required value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone (optional)">
            <input className={inputCls} type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Company (optional)">
            <input className={inputCls} value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
          </Field>
        </div>
        <Field label="What do you provide?">
          <input
            className={inputCls}
            required
            placeholder="e.g. Eviction attorney, general contractor, funding partner…"
            value={form.vendor_category}
            onChange={(e) => set('vendor_category', e.target.value)}
          />
        </Field>
        <Field label="Anything else we should know? (optional)">
          <textarea className={`${inputCls} min-h-20`} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
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
          <input className={inputCls} type="password" autoComplete="new-password" required value={form.confirm} onChange={(e) => set('confirm', e.target.value)} />
        </Field>
        <button type="submit" disabled={busy} className="btn-gold w-full disabled:opacity-60">
          {busy ? 'Submitting…' : 'Submit application'}
        </button>
      </form>
    </AuthLayout>
  )
}
