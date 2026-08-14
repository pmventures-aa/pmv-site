import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { Card, PageHeader } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { inputCls } from '../auth/AuthLayout'
import { toast } from '../../components/kit/toast'
import { Avatar } from '../../components/kit/Avatar'
import { useAppPath } from '../../lib/basePath'

type IdentityRow = {
  id: string
  provider: string
  connection_name: string | null
  provider_email: string | null
  email_verified: boolean
  created_at: string
  last_login_at: string | null
  label: string
}

type Auth0Provider = { id: string; label: string; button_label: string }

export default function Security() {
  const { user } = useAuth()
  const p = useAppPath()
  const [params] = useSearchParams()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [identities, setIdentities] = useState<IdentityRow[]>([])
  const [hasPassword, setHasPassword] = useState(true)
  const [providers, setProviders] = useState<Auth0Provider[]>([])
  const [auth0Enabled, setAuth0Enabled] = useState(false)
  const [identityBusy, setIdentityBusy] = useState<string | null>(null)

  const loadIdentities = useCallback(async () => {
    try {
      const data = await api.get<{
        password: boolean
        identities: IdentityRow[]
        auth0: { enabled: boolean; providers: Auth0Provider[] }
      }>('/auth/identities')
      setHasPassword(Boolean(data.password))
      setIdentities(data.identities || [])
      setAuth0Enabled(Boolean(data.auth0?.enabled))
      setProviders(data.auth0?.providers || [])
    } catch {
      /* keep prior state */
    }
  }, [])

  useEffect(() => {
    loadIdentities()
  }, [loadIdentities])

  useEffect(() => {
    const linked = params.get('auth0_linked')
    if (linked) {
      toast.success(`${linked === 'google-oauth2' ? 'Google' : linked === 'windowslive' ? 'Microsoft' : 'Sign-in method'} connected.`)
      loadIdentities()
    }
    const err = params.get('auth0_error')
    if (err === 'link_conflict') toast.error('That sign-in method is already connected to another account.')
    if (err === 'link_failed') toast.error('We could not connect that sign-in method.')
  }, [params, loadIdentities])

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

  function connectProvider(providerId: string) {
    if (identityBusy) return
    setIdentityBusy(providerId)
    const returnTo = p('security')
    window.location.assign(
      `/api/auth/auth0/login?connection=${encodeURIComponent(providerId)}&mode=link&returnTo=${encodeURIComponent(returnTo)}`,
    )
  }

  async function unlinkIdentity(identityId: string, label: string) {
    if (identityBusy) return
    const methods = (hasPassword ? 1 : 0) + identities.length
    if (methods <= 1) {
      toast.error('Keep at least one sign-in method on your account.')
      return
    }
    setIdentityBusy(identityId)
    try {
      await api.post('/auth/auth0/unlink', { identity_id: identityId })
      toast.success(`${label} disconnected.`)
      await loadIdentities()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not disconnect that method.')
    } finally {
      setIdentityBusy(null)
    }
  }

  const connectedIds = new Set(identities.map((row) => row.provider))
  const availableToConnect = auth0Enabled
    ? providers.filter((provider) => !connectedIds.has(provider.id))
    : []

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
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
                {hasPassword ? 'Current password' : 'Current password (not set)'}
              </span>
              <input
                className={inputCls}
                type="password"
                required={hasPassword}
                disabled={!hasPassword}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={hasPassword ? undefined : 'Not required for Auth0-only accounts'}
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

        <Card className="lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">Sign-in methods</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Connect Google or Microsoft for faster access. Pinnacle still controls what you can see in the portal.
          </p>

          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">Email and password</p>
                <p className="mt-0.5 text-xs text-slate-500">{hasPassword ? 'Password is set on this account.' : 'No password set yet — add one above.'}</p>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{hasPassword ? 'Available' : 'Not set'}</span>
            </div>

            {identities.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">{row.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{row.provider_email || 'Connected'}</p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(identityBusy)}
                  onClick={() => unlinkIdentity(row.id, row.label)}
                  className="rounded-lg border border-white/12 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-rose-300/40 hover:text-rose-100 disabled:opacity-60"
                >
                  {identityBusy === row.id ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
            ))}

            {availableToConnect.map((provider) => (
              <div key={provider.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-gold/25 bg-gold/[0.03] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">{provider.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">Not connected</p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(identityBusy)}
                  onClick={() => connectProvider(provider.id)}
                  className="btn-gold px-3 py-2 text-xs disabled:opacity-60"
                >
                  {identityBusy === provider.id ? 'Connecting…' : `Connect ${provider.label}`}
                </button>
              </div>
            ))}

            {!auth0Enabled && (
              <p className="text-sm text-slate-500">External sign-in methods are not enabled for this environment.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
