import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { Card, PageHeader } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { inputCls } from '../auth/AuthLayout'
import { toast } from '../../components/kit/toast'
import { Avatar } from '../../components/kit/Avatar'
import { auth0ErrorMessage } from '../../components/auth/Auth0ProviderButtons'

interface LinkedIdentity {
  id: string
  provider: string
  connection_name: string | null
  provider_email: string | null
  email_verified: boolean
  created_at: string
  last_login_at: string | null
}

interface IdentitiesResponse {
  identities: LinkedIdentity[]
  has_password: boolean
  providers: Array<{ id: string; label: string }>
  auth0_enabled: boolean
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
}

export default function Security() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [identities, setIdentities] = useState<IdentitiesResponse | null>(null)
  const [identityBusy, setIdentityBusy] = useState<string | null>(null)
  const [identityMessage, setIdentityMessage] = useState<string | null>(() => auth0ErrorMessage(params.get('auth0')))

  const loadIdentities = useCallback(async () => {
    try {
      const data = await api.get<IdentitiesResponse>('/auth/identities')
      setIdentities(data)
    } catch {
      setIdentities(null)
    }
  }, [])

  useEffect(() => { loadIdentities() }, [loadIdentities])

  useEffect(() => {
    const message = auth0ErrorMessage(params.get('auth0'))
    if (message) setIdentityMessage(message)
    else if (params.get('auth0') === null && params.toString() === '') {
      // Linked successfully returns without auth0 param.
    }
  }, [params])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }
    if (newPassword.length < 10) {
      setError('New password must be at least 10 characters.')
      return
    }
    setBusy(true)
    try {
      await api.post('/portal/change-password', { current_password: currentPassword, new_password: newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success('Password updated.')
      await loadIdentities()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update password.')
    } finally {
      setBusy(false)
    }
  }

  async function connectProvider(providerId: string) {
    setIdentityMessage(null)
    setIdentityBusy(providerId)
    try {
      const data = await api.post<{ ok: boolean; authorize_url: string }>('/auth/auth0/link', {
        provider: providerId,
        returnTo: '/portal/security',
      })
      if (!data.authorize_url) throw new Error('missing authorize url')
      window.location.assign(data.authorize_url)
    } catch (err) {
      setIdentityMessage(err instanceof ApiError ? err.message : 'Could not start account linking.')
      setIdentityBusy(null)
    }
  }

  async function unlinkIdentity(identityId: string) {
    if (!window.confirm('Disconnect this sign-in method from your Pinnacle account?')) return
    setIdentityMessage(null)
    setIdentityBusy(identityId)
    try {
      await api.post('/auth/auth0/unlink', { identity_id: identityId })
      toast.success('Sign-in method disconnected.')
      await loadIdentities()
    } catch (err) {
      setIdentityMessage(err instanceof ApiError ? err.message : 'Could not disconnect that method.')
    } finally {
      setIdentityBusy(null)
    }
  }

  const connectedProviders = new Set((identities?.identities || []).map((row) => row.provider))
  const availableToConnect = (identities?.providers || []).filter((p) => !connectedProviders.has(p.id))

  return (
    <div>
      <PageHeader eyebrow="Account" title="Security" subtitle="Manage your login credentials and connected sign-in methods." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">Account</h2>
          {user && (
            <div className="mt-3 flex items-center gap-3">
              <Avatar userId={user.id} name={user.full_name} size={48} editable uploadPath="/me/avatar" />
              <p className="text-xs leading-5 text-slate-500">Click the photo to change it. Pinnacle staff can also update it from HQ.</p>
            </div>
          )}
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Email</dt>
              <dd className="mt-0.5 text-white">{user?.email}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">Change password</h2>
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Current password</span>
              <input
                className={inputCls}
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">New password</span>
              <input
                className={inputCls}
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Confirm new password</span>
              <input
                className={inputCls}
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <button type="submit" disabled={busy} className="btn-gold disabled:opacity-60">
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </Card>

        {identities?.auth0_enabled && (
          <Card className="lg:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">Connected sign-in methods</h2>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Connect Google or Microsoft for faster sign-in. Pinnacle still controls what you can access after you authenticate.
            </p>
            {identityMessage && <p className="mt-3 text-sm text-rose-300" role="alert">{identityMessage}</p>}

            <ul className="mt-4 divide-y divide-white/8 rounded-xl border border-white/10">
              <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">Email and password</p>
                  <p className="text-xs text-slate-500">{identities.has_password ? 'Available for this account' : 'Not set — keep at least one other method connected'}</p>
                </div>
              </li>
              {(identities.identities || []).map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{PROVIDER_LABELS[row.provider] || row.provider}</p>
                    <p className="text-xs text-slate-500">{row.provider_email || 'Connected'}{row.last_login_at ? ` · Last used ${new Date(row.last_login_at).toLocaleDateString()}` : ''}</p>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(identityBusy)}
                    onClick={() => unlinkIdentity(row.id)}
                    className="rounded-lg border border-white/12 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-rose-400/40 hover:text-rose-200 disabled:opacity-60"
                  >
                    {identityBusy === row.id ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </li>
              ))}
            </ul>

            {availableToConnect.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {availableToConnect.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    disabled={Boolean(identityBusy)}
                    onClick={() => connectProvider(provider.id)}
                    className="rounded-lg border border-gold/25 bg-gold/[.06] px-3.5 py-2 text-xs font-bold text-gold transition hover:bg-gold/[.12] disabled:opacity-60"
                  >
                    {identityBusy === provider.id ? 'Connecting…' : `Connect ${PROVIDER_LABELS[provider.id] || provider.label}`}
                  </button>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
