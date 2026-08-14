import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Card, PageHeader } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { inputCls } from '../auth/AuthLayout'
import { toast } from '../../components/kit/toast'
import { Avatar } from '../../components/kit/Avatar'

type LinkedIdentity = {
  id: string
  provider: string
  provider_email: string | null
  email_verified: boolean
  created_at: string
  last_login_at: string | null
}

type ProviderOption = {
  id: string
  connection: string
  label: string
}

type IdentitiesResponse = {
  ok: boolean
  auth0_enabled: boolean
  has_password: boolean
  can_unlink: boolean
  providers: ProviderOption[]
  identities: LinkedIdentity[]
}

function providerLabel(provider: string, options: ProviderOption[]): string {
  const match = options.find((entry) => entry.connection === provider || entry.id === provider)
  if (match) return match.label.replace(/^Continue with\s+/i, '')
  if (/google/i.test(provider)) return 'Google'
  if (/microsoft|windowslive|waad/i.test(provider)) return 'Microsoft'
  return provider
}

export default function Security() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [identities, setIdentities] = useState<IdentitiesResponse | null>(null)
  const [identityBusy, setIdentityBusy] = useState<string | null>(null)
  const [identityError, setIdentityError] = useState<string | null>(null)

  const loadIdentities = useCallback(async () => {
    try {
      const data = await api.get<IdentitiesResponse>('/auth/identities')
      setIdentities(data)
    } catch {
      setIdentities(null)
    }
  }, [])

  useEffect(() => {
    loadIdentities()
  }, [loadIdentities])

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

  async function connectProvider(provider: ProviderOption) {
    setIdentityError(null)
    setIdentityBusy(provider.id)
    try {
      const data = await api.post<{ ok: boolean; redirect: string }>('/auth/auth0/link', {
        connection: provider.connection,
        returnTo: '/portal/security',
      })
      window.location.assign(data.redirect)
    } catch (err) {
      setIdentityError(err instanceof ApiError ? err.message : 'Could not start account linking.')
      setIdentityBusy(null)
    }
  }

  async function unlinkIdentity(identity: LinkedIdentity) {
    if (!identities?.can_unlink) {
      setIdentityError('Keep at least one sign-in method on your account.')
      return
    }
    setIdentityError(null)
    setIdentityBusy(identity.id)
    try {
      await api.post('/auth/auth0/unlink', { identity_id: identity.id })
      toast.success('Sign-in method removed.')
      await loadIdentities()
    } catch (err) {
      setIdentityError(err instanceof ApiError ? err.message : 'Could not remove that sign-in method.')
    } finally {
      setIdentityBusy(null)
    }
  }

  const linkedConnections = new Set((identities?.identities || []).map((row) => row.provider))
  const availableProviders = (identities?.providers || []).filter(
    (provider) => !linkedConnections.has(provider.connection) && !linkedConnections.has(provider.id),
  )

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
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Connect Google or Microsoft to your existing Pinnacle account. Access to matters and documents still follows your Pinnacle permissions.
            </p>

            <div className="mt-5 space-y-3">
              {(identities.identities || []).length === 0 && (
                <p className="text-sm text-slate-500">No Google or Microsoft sign-in methods are connected yet.</p>
              )}
              {(identities.identities || []).map((identity) => (
                <div key={identity.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{providerLabel(identity.provider, identities.providers)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {identity.provider_email || 'Connected account'}
                      {identity.last_login_at ? ` · Last used ${new Date(identity.last_login_at).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(identityBusy) || !identities.can_unlink}
                    onClick={() => unlinkIdentity(identity)}
                    className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-rose-300/40 hover:text-rose-200 disabled:opacity-50"
                  >
                    {identityBusy === identity.id ? 'Removing…' : 'Disconnect'}
                  </button>
                </div>
              ))}
            </div>

            {availableProviders.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-3">
                {availableProviders.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    disabled={Boolean(identityBusy)}
                    onClick={() => connectProvider(provider)}
                    className="rounded-xl border border-gold/25 bg-gold/[.06] px-4 py-2.5 text-sm font-semibold text-gold transition hover:bg-gold/[.1] disabled:opacity-60"
                  >
                    {identityBusy === provider.id ? 'Connecting…' : `Connect ${providerLabel(provider.connection, [provider])}`}
                  </button>
                ))}
              </div>
            )}

            {identityError && <p className="mt-4 text-sm text-rose-300">{identityError}</p>}
            {!identities.has_password && (
              <p className="mt-4 text-xs leading-5 text-slate-500">
                This account signs in with a connected provider. Set a password if you want an email-and-password backup.
              </p>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
