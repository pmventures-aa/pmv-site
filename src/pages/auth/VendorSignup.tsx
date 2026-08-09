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
      .then((response) => {
        if (response.invite.invite_type !== 'vendor') throw new Error('This is not a provider invitation.')
        setInvite(response.invite)
        setForm((current) => ({
          ...current,
          full_name: response.invite.full_name || current.full_name,
          email: response.invite.email || current.email,
          company_name: response.invite.metadata?.company_name || current.company_name,
          vendor_category: response.invite.metadata?.vendor_category || current.vendor_category,
        }))
        if (response.invite.status !== 'pending') setError(`This invitation is ${response.invite.status}.`)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not load this invitation.'))
      .finally(() => setInviteLoading(false))
  }, [inviteToken])

  function set<K extends keyof typeof form>(key: K, value: string) { setForm((current) => ({ ...current, [key]: value })) }

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
      if (inviteToken) await api.post(`/invite/${encodeURIComponent(inviteToken)}/complete-existing`, {}).catch(() => {})
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthLayout eyebrow="Pinnacle Professional Network" title="Application received" subtitle="Your profile is in review. Approval happens before portal access or client assignments are available.">
        <div className="border-l-2 border-gold pl-4 text-sm leading-6 text-slate-300">
          If Pinnacle needs additional qualifications, insurance, licensing, references, work samples, or service-area information for your specialty, we’ll reach out before approval.
        </div>
        <p className="mt-5 text-xs leading-5 text-slate-500">Joining the network does not create an employment relationship or guarantee assignment volume. Approved providers may be contacted when a defined client need matches their services and availability.</p>
        <Link to="../login" className="btn-outline mt-6 inline-block w-full text-center">Back to sign in</Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      eyebrow={inviteToken ? 'Pinnacle provider invitation' : 'Pinnacle Professional Network'}
      title={inviteToken ? 'Complete your provider profile' : 'Apply to join the network'}
      subtitle={inviteToken ? 'You were invited to complete a professional-provider profile. This private link expires after 24 hours.' : 'For independent professionals and service providers who may support Pinnacle clients on defined assignments.'}
      footer={<>Already approved? <Link to="../login" className="font-medium text-gold hover:underline">Sign in</Link></>}
    >
      <div className="mb-5 border-l-2 border-gold pl-4">
        <p className="text-sm font-medium text-white">How the network works</p>
        <p className="mt-1 text-xs leading-5 text-slate-400">Pinnacle reviews providers before approval. When a client need matches your expertise, location, qualifications, and availability, we may send a defined assignment for you to review. Client access is limited to the work you are assigned.</p>
      </div>
      {inviteLoading && <p className="mb-4 text-sm text-slate-400">Loading your invitation…</p>}
      {inviteToken && invite?.status === 'pending' && (
        <div className="mb-5 rounded-lg border border-gold/20 bg-gold/[0.05] p-4">
          <p className="text-sm font-semibold text-white">Invited by Pinnacle</p>
          <p className="mt-1 text-xs text-slate-400">This application is connected to your private invitation. Expires {new Date(invite.expires_at).toLocaleString()}.</p>
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
        <Field label="Professional service / specialty"><input className={inputCls} required placeholder="e.g. Eviction attorney, general contractor, bookkeeper" value={form.vendor_category} onChange={(e) => set('vendor_category', e.target.value)} /></Field>
        <Field label="Experience, service area, credentials, or anything else we should know (optional)"><textarea className={`${inputCls} min-h-24`} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <Field label={`Password (min ${MIN_PASSWORD} characters)`}><input className={inputCls} type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={form.password} onChange={(e) => set('password', e.target.value)} /></Field>
        <Field label="Confirm password"><input className={inputCls} type="password" autoComplete="new-password" required value={form.confirm} onChange={(e) => set('confirm', e.target.value)} /></Field>
        <button type="submit" disabled={busy || inviteLoading || (!!inviteToken && invite?.status !== 'pending')} className="btn-gold w-full disabled:opacity-60">{busy ? 'Submitting…' : 'Submit for review'}</button>
      </form>
      <p className="mt-5 text-xs leading-5 text-slate-500">Submitting a profile is the start of review, not automatic network approval. It does not create an employment relationship or guarantee assignments.</p>
    </AuthLayout>
  )
}
