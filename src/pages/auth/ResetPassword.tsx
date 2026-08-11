import { CheckCircle2, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAppPath } from '../../lib/basePath'
import { playWelcomeSound, primeAudio } from '../../lib/sound'
import { AuthLayout, ErrorBanner, Field, inputCls } from './AuthLayout'

const MIN_PASSWORD = 10

export default function ResetPassword({ surface }: { surface: 'client' | 'staff' }) {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()
  const p = useAppPath()
  const { refresh } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(token ? null : 'This reset link is missing its secure token.')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    primeAudio()
    setError(null)
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters for your new password.`)
    if (password !== confirm) return setError('The passwords do not match.')
    if (!token) return setError('This reset link is incomplete. Request a new one from the sign-in page.')
    setBusy(true)
    try {
      await api.post('/auth/reset-password', { token, password })
      await refresh()
      setDone(true)
      playWelcomeSound(surface)
      window.setTimeout(() => navigate(p(), { replace: true }), 900)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'We could not reset your password. Request a new link and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      surface={surface}
      eyebrow="Account Security"
      title={done ? 'Password Updated' : 'Choose a New Password'}
      subtitle={done ? 'Your previous sessions have been signed out and this device is now secured with your new password.' : 'Create a new password for your Pinnacle account. Finishing this step signs out your other active sessions.'}
      sideTitle="A password reset should close the old door, not just create a new key."
      sideBody="Pinnacle invalidates existing sessions after a successful reset so a previously signed-in device cannot keep using the old session."
    >
      {done ? (
        <div className="py-3 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-emerald-400/25 bg-emerald-400/10 text-emerald-300"><CheckCircle2 size={24} /></span>
          <h2 className="mt-4 text-xl font-bold text-white">You Are Securely Signed In</h2>
          <p className="mt-2 text-sm text-slate-400">Opening your workspace now.</p>
        </div>
      ) : (
        <>
          <ErrorBanner message={error} />
          <form onSubmit={submit} className="space-y-5">
            <Field label="New Password" hint={`${MIN_PASSWORD}+ characters`}>
              <div className="relative">
                <input className={`${inputCls} pr-12`} type={show ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a strong password" />
                <button type="button" onClick={() => setShow((value) => !value)} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-slate-500 hover:text-gold" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </Field>
            <Field label="Confirm New Password">
              <input className={inputCls} type={show ? 'text' : 'password'} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Enter it again" />
            </Field>
            <div className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[.025] p-3 text-xs leading-5 text-slate-400"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-gold" /><span>After this reset, all other active sessions for your account will be revoked.</span></div>
            <button type="submit" disabled={busy || !token} className="btn-gold min-h-12 w-full text-[15px] disabled:opacity-60">{busy ? 'Securing Account…' : 'Update Password and Continue'}</button>
          </form>
        </>
      )}
    </AuthLayout>
  )
}
