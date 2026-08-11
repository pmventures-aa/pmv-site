import { CheckCircle2, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { AuthLayout, ErrorBanner, Field, inputCls } from './AuthLayout'

export default function ForgotPassword({ surface }: { surface: 'client' | 'staff' }) {
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') || '')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/auth/forgot-password', { email, surface })
      setSent(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'We could not process that request. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      surface={surface}
      eyebrow="Account Recovery"
      title="Reset Your Password"
      subtitle="Enter the email connected to your Pinnacle account. If it matches an active account, we will send a secure one-time reset link."
      footer={<Link to="../login" className="font-bold text-gold hover:text-gold-300">Back to Sign In</Link>}
      sideTitle="Secure recovery without putting your account details on display."
      sideBody="Reset links expire quickly, work once, and never reveal whether an email is registered on the platform."
    >
      {sent ? (
        <div className="py-2 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-emerald-400/25 bg-emerald-400/10 text-emerald-300"><CheckCircle2 size={24} /></span>
          <h2 className="mt-4 text-xl font-bold text-white">Check Your Email</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">If an active Pinnacle account matches <strong className="font-semibold text-slate-200">{email}</strong>, a reset link is on the way. The link expires in 30 minutes.</p>
          <button type="button" onClick={() => setSent(false)} className="mt-5 text-sm font-semibold text-gold hover:text-gold-300">Try another email</button>
        </div>
      ) : (
        <>
          <ErrorBanner message={error} />
          <form onSubmit={submit} className="space-y-5">
            <Field label="Email Address">
              <div className="relative">
                <Mail size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input className={`${inputCls} pl-11`} type="email" autoComplete="email" inputMode="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
            </Field>
            <button type="submit" disabled={busy} className="btn-gold min-h-12 w-full text-[15px] disabled:opacity-60">{busy ? 'Sending Secure Link…' : 'Send Reset Link'}</button>
          </form>
          <p className="mt-5 text-xs leading-5 text-slate-500">For your security, Pinnacle gives the same response whether or not an account exists for the email entered.</p>
        </>
      )}
    </AuthLayout>
  )
}
