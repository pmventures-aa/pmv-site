import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { AuthLayout, Field, inputCls, ErrorBanner } from './AuthLayout'

const MIN_PASSWORD = 10

interface InviteData {
  invite: {
    id: string
    invite_type: string
    email: string
    full_name: string | null
    status: string
    expires_at: string
    metadata?: { vendor_category?: string; company_name?: string }
  }
}

export default function VendorSignup() {
  const [params] = useSearchParams()
  const inviteToken = params.get('invite') || ''
  const [invite, setInvite] = useState<InviteData['invite'] | null>(null)
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', company_name: '', vendor_category: '', notes: '', password: '', confirm: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!inviteToken) return
    api.get<InviteData>(`/invite/${encodeURIComponent(inviteToken)}`)
      .then((r) => {
        if (r.invite.invite_type !== 'vendor') throw new Error('This is not a provider invitation.')
        setInvite(r.invite)
        setForm((f) => ({
          ...f,
          full_name: r.invite.full_name || f.full_name,
          email: r.invite.email || f.email,
          company_name: r.invite.metadata?.company_name || f.company_name,
          vendor_category: r.invite.metadata?.vendor_category || f.vendor_category,
        }))
        if (r.invite.status !== 'pending') setError(`This invitation is ${r.invite.status}.`)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not load this invitation.'))
      .finally(() => setInviteLoading(false))
  }, [inviteToken])

  function set<K extends keyof typeof form>(key: K, value: string) { setForm((f) => ({ ...f, [key]: value })) }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (form.password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters.`)
    if (form.password !== form.confirm) return setError('Passwords do not match.')
    if (inviteToken && invite?.status !== 'pending') return setError('This invitation is no longer active.')
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
      if (inviteToken) {
        await api.post(`/invite/${encodeURIComponent(inviteToken)}/complete-existing`, {}).catch(() => {})
      }
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthLayout eyebrow="Professional provider onboarding" title="Application received" subtitle="Thanks for applying to work with Pinnacle Management Ventures.">
        <div className="rounded-xl border border-gold/20 bg-gold/[0.05] p-4 text-sm leading-relaxed text-slate-300">
          Your provider profile is now pending Pinnacle review. Approval is required before you can sign in or receive client assignments.
        </div>
        <Link to="../login" className="btn-outline mt-6 inline-block w-full text-center">Back to sign in</Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      eyebrow={inviteToken ? 'Pinnacle invitation' : 'Professional provider onboarding'}
      title={inviteToken ? 'Complete your provider onboarding' : 'Apply to work with Pinnacle'}
      subtitle={inviteToken ? 'Pinnacle invited you to complete a provider profile. Your private invitation expires after 24 hours.' : 'For independent professionals and service providers. Applications are reviewed before portal access is approved.'}
      footer={<>Already approved? <Link to="../login" className="font-medium text-gold hover:underline">Sign in</Link></>}
    >
      {inviteLoading && <p className="mb-4 text-sm text-slate-400">Loading your invitation…</p>}
      {inviteToken && invite?.status === 'pending' && (
        <div className="mb-5 rounded-xl border border-gold/20 bg-gold/[0.05] p-4">
          <p className="text-sm font-semibold text-white">Invited by Pinnacle</p>
          <p className="mt-1 text-xs text-slate-400">This onboarding record is connected to your invitation. Expires {new Date(invite.expires_at).toLocaleString()}.</p>
        </div>
      )}
      <ErrorBanner message={error} />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Full name"><input className={inputCls} required value={form.full_name} onChange={(e) => set('full_name', e.target.value)} /></Field>
        <Field label="Email"><input className={inputCls} type="email" autoComplete="email" required readOnly={!!inviteToken} value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone (optional)"><input className={inputCls} type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Company (optional)"><input className={inputCls} value={form.company_name} onChange={(e) => set('company_name', e.target.value)} /></Field>
        </div>
        <Field label="Professional service / specialty">
          <input className={inputCls} required placeholder="e.g. Eviction attorney, general contractor, funding partner" value={form.vendor_category} onChange={(e) => set('vendor_category', e.target.value)} />
        </Field>
        <Field label="Anything else we should know? (optional)"><textarea className={`${inputCls} min-h-20`} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <Field label={`Password (min ${MIN_PASSWORD} characters)`}><input className={inputCls} type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={form.password} onChange={(e) => set('password', e.target.value)} /></Field>
        <Field label="Confirm password"><input className={inputCls} type="password" autoComplete="new-password" required value={form.confirm} onChange={(e) => set('confirm', e.target.value)} /></Field>
        <button type="submit" disabled={busy || inviteLoading || (!!inviteToken && invite?.status !== 'pending')} className="btn-gold w-full disabled:opacity-60">{busy ? 'Submitting…' : 'Submit provider application'}</button>
      </form>
      <p className="mt-5 text-xs leading-relaxed text-slate-500">Submitting an application does not create an employment relationship or guarantee assignments. Pinnacle reviews providers based on current and anticipated client needs.</p>
    </AuthLayout>
  )
}
