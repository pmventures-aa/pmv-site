import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { AuthLayout, ErrorBanner, Field, inputCls } from './AuthLayout'

interface InviteResponse {
  invite: {
    invite_type: string
    email: string
    full_name: string | null
    status: string
    expires_at: string
    client_name: string | null
    metadata?: { relationship_label?: string; permissions?: Record<string, string> }
  }
}

const labels: Record<string, string> = {
  business_profile: 'Business Profile', services: 'Services & Applications', documents: 'Documents', billing: 'Billing',
  tasks: 'Tasks', calendar: 'Calendar', messages: 'Messages', support: 'Support',
}

export default function TrustedInvite() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [invite, setInvite] = useState<InviteResponse['invite'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<InviteResponse>(`/invite/${encodeURIComponent(token)}`)
      .then((r) => {
        if (r.invite.invite_type !== 'trusted_contact') throw new Error('This is not a Trusted Contact invitation.')
        setInvite(r.invite)
        setFullName(r.invite.full_name || '')
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not load invitation.'))
      .finally(() => setLoading(false))
  }, [token])

  async function accept(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 10) return setError('Password must be at least 10 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setBusy(true)
    try {
      await api.post(`/invite/${encodeURIComponent(token)}/accept-trusted`, { full_name: fullName, password })
      await refresh()
      navigate('../trusted', { relative: 'path', replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not accept this invitation.')
    } finally { setBusy(false) }
  }

  const grants = Object.entries(invite?.metadata?.permissions || {}).filter(([, mode]) => mode === 'view' || mode === 'edit')

  return (
    <AuthLayout eyebrow="Trusted Contact invitation" title={invite?.client_name ? `${invite.client_name} invited you` : 'You were invited as a Trusted Contact'} subtitle="A Trusted Contact can access only the sections the client explicitly chooses.">
      {loading ? <p className="text-sm text-slate-400">Loading invitation…</p> : (
        <>
          <ErrorBanner message={error} />
          {invite && invite.status === 'pending' && (
            <>
              <div className="mb-5 rounded-xl border border-gold/20 bg-gold/[0.05] p-4">
                <p className="text-sm font-semibold text-white">Access being shared with you</p>
                <p className="mt-1 text-xs text-slate-400">Invitation for {invite.email}. Expires {new Date(invite.expires_at).toLocaleString()}.</p>
                {invite.metadata?.relationship_label && <p className="mt-2 text-xs text-slate-300">Relationship: {invite.metadata.relationship_label}</p>}
                <div className="mt-3 flex flex-wrap gap-2">{grants.map(([key, mode]) => <span key={key} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-slate-300">{labels[key] || key}: <strong className="text-gold">{mode}</strong></span>)}</div>
              </div>
              <form onSubmit={accept} className="space-y-4">
                <Field label="Full name"><input className={inputCls} required value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
                <Field label="Email"><input className={inputCls} value={invite.email} readOnly /></Field>
                <Field label="Create password"><input className={inputCls} type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
                <Field label="Confirm password"><input className={inputCls} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
                <button className="btn-gold w-full disabled:opacity-60" disabled={busy}>{busy ? 'Activating…' : 'Accept invitation & activate access'}</button>
              </form>
            </>
          )}
          {invite && invite.status !== 'pending' && <div className="rounded-xl border border-white/10 p-4 text-sm text-slate-300">This invitation is {invite.status}. Ask the client to send a new invitation if you still need access.</div>}
        </>
      )}
    </AuthLayout>
  )
}
