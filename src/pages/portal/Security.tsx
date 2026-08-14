import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Card, PageHeader } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { inputCls } from '../auth/AuthLayout'
import { toast } from '../../components/kit/toast'
import { Avatar } from '../../components/kit/Avatar'
import { Auth0Buttons, type Auth0ProviderId, type Auth0ProviderOption } from '../../components/auth/Auth0Buttons'

interface IdentityRow {
  id: string
  provider: string
  email: string | null
  email_verified: boolean
  created_at: string
  last_login_at: string | null
}

function providerLabel(provider: string): string {
  if (provider === 'google-oauth2' || provider === 'google') return 'Google'
  if (provider === 'windowslive' || provider === 'microsoft') return 'Microsoft'
  return provider
}

export default function Security() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [identities, setIdentities] = useState<IdentityRow[]>([])
  const [hasPassword, setHasPassword] = useState(true)
  const [providers, setProviders] = useState<Auth0ProviderOption[]>([])
  const [identityBusy, setIdentityBusy] = useState<string | null>(null)

  async function loadIdentities() {
    try {
      const data = await api.get<{ password: boolean; identities: IdentityRow[] }>('/auth/identities')
      setHasPassword(data.password)
      setIdentities(data.identities)
    } catch {
      setIdentities([])
    }
  }

  useEffect(() => {
    void loadIdentities()
    api.get<{ enabled: boolean; providers: Auth0ProviderOption[] }>('/auth/auth0/status')
      .then((data) => setProviders(data.enabled ? data.providers : []))
      .catch(() => setProviders([]))
  }, [])

  const connected = new Set(identities.map((row) => {
    if (row.provider === 'google-oauth2' || row.provider === 'google') return 'google'
    if (row.provider === 'windowslive' || row.provider === 'microsoft') return 'microsoft'
    return row.provider
  }))
  const available = providers.filter((provider) => !connected.has(provider.id))

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

  async function connect(id: Auth0ProviderId) {
    if (identityBusy) return
    setIdentityBusy(id)
    try {
      const result = await api.post<{ authorization_url: string }>('/auth/auth0/link', { connection: id })
      window.location.assign(result.authorization_url)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not start that connection.')
      setIdentityBusy(null)
    }
  }

  async function unlink(row: IdentityRow) {
    if (identityBusy) return
    if (!window.confirm(`Remove ${providerLabel(row.provider)} as a sign-in method?`)) return
    setIdentityBusy(row.id)
    try {
      await api.post('/auth/auth0/unlink', { identity_id: row.id })
      toast.success(`${providerLabel(row.provider)} disconnected.`)
      await loadIdentities()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove that sign-in method.')
    } finally {
      setIdentityBusy(null)
    }
  }

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
          {!hasPassword && (
            <p className="mt-3 text-xs leading-5 text-slate-400">This account signs in with a connected method. Use Forgot password on the sign-in page if you want to add a Pinnacle password.</p>
          )}
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
            <button type="submit" disabled={busy || !hasPassword} className="btn-gold disabled:opacity-60">
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </Card>

        {(providers.length > 0 || identities.length > 0) && (
          <Card className="lg:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">Connected sign-in methods</h2>
            <p className="mt-2 text-xs leading-5 text-slate-400">These methods identify you to Pinnacle. Access to matters, documents, and billing is still controlled by your Pinnacle account.</p>
            <ul className="mt-4 space-y-3">
              {identities.length === 0 && (
                <li className="text-sm text-slate-400">No connected Google or Microsoft sign-in methods yet.</li>
              )}
              {identities.map((row) => (
                <li key={row.id} className="flex flex-col gap-3 rounded-xl border border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{providerLabel(row.provider)}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{row.email || 'Connected'}{row.last_login_at ? ` · last used ${new Date(row.last_login_at).toLocaleString()}` : ''}</p>
                  </div>
                  <button
                    type="button"
                    className="min-h-11 rounded-lg border border-rose-400/20 px-3 text-xs font-semibold text-rose-200 transition hover:border-rose-300/40 focus-visible:ring-4 focus-visible:ring-rose-400/20 disabled:opacity-60"
                    disabled={identityBusy === row.id}
                    onClick={() => unlink(row)}
                  >
                    {identityBusy === row.id ? 'Removing…' : 'Remove'}
                  </button>
                </li>
              ))}
            </ul>
            {available.length > 0 && (
              <div className="mt-5 max-w-md">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Connect another method</p>
                <Auth0Buttons providers={available} busy={Boolean(identityBusy)} onStart={connect} prefix="Connect" />
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
