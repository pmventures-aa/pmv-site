import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Card, PageHeader } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { inputCls } from '../auth/AuthLayout'
import { toast } from '../../components/kit/toast'
import { Avatar } from '../../components/kit/Avatar'
import { Auth0Providers } from '../../components/auth/Auth0Providers'

interface ExternalIdentity {
  id: string
  provider: string
  connection: string
  email: string | null
  email_verified: boolean
  created_at: string
  last_login_at: string | null
  label: string
}

interface IdentitiesResponse {
  identities: ExternalIdentity[]
  has_password: boolean
  auth0_enabled: boolean
}

export default function Security() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [identities, setIdentities] = useState<ExternalIdentity[]>([])
  const [hasPassword, setHasPassword] = useState(true)
  const [auth0Enabled, setAuth0Enabled] = useState(false)
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null)
  const [oauthBusy, setOauthBusy] = useState(false)

  const refreshIdentities = useCallback(async () => {
    try {
      const data = await api.get<IdentitiesResponse>('/auth/identities')
      setIdentities(data.identities || [])
      setHasPassword(!!data.has_password)
      setAuth0Enabled(!!data.auth0_enabled)
    } catch {
      setIdentities([])
    }
  }, [])

  useEffect(() => {
    refreshIdentities()
  }, [refreshIdentities])

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
      setHasPassword(true)
      toast.success('Password updated.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update password.')
    } finally {
      setBusy(false)
    }
  }

  async function unlinkIdentity(identityId: string) {
    setUnlinkingId(identityId)
    try {
      await api.post('/auth/auth0/unlink', { identity_id: identityId })
      toast.success('Sign-in method removed.')
      await refreshIdentities()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove that sign-in method.')
    } finally {
      setUnlinkingId(null)
    }
  }

  const canUnlink = hasPassword || identities.length > 1

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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">Connected sign-in methods</h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Link Google or Microsoft after you are signed in with your Pinnacle email and password. Pinnacle still controls what you can access.
          </p>
          {auth0Enabled && (
            <div className="mt-4">
              <Auth0Providers mode="link" disabled={oauthBusy || unlinkingId !== null} onBusyChange={setOauthBusy} />
            </div>
          )}
          {identities.length > 0 && (
            <ul className="mt-4 space-y-3">
              {identities.map((identity) => (
                <li key={identity.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.02] px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{identity.label}</p>
                    <p className="text-xs text-slate-500">{identity.email || 'Connected account'}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!canUnlink || unlinkingId === identity.id || oauthBusy}
                    onClick={() => unlinkIdentity(identity.id)}
                    className="text-xs font-semibold text-rose-300 transition hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {unlinkingId === identity.id ? 'Removing…' : 'Remove'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!canUnlink && identities.length > 0 && (
            <p className="mt-3 text-xs leading-5 text-slate-500">Set a password before removing your only other sign-in method.</p>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">Change password</h2>
          <form onSubmit={onSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Current password</span>
              <input
                className={inputCls}
                type="password"
                required={hasPassword}
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
            {error && <p className="text-sm text-rose-300 md:col-span-2">{error}</p>}
            <div className="md:col-span-2">
              <button type="submit" disabled={busy} className="btn-gold disabled:opacity-60">
                {busy ? 'Updating…' : hasPassword ? 'Update password' : 'Set password'}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
