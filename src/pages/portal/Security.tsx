import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Card, PageHeader } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { inputCls } from '../auth/AuthLayout'
import { toast } from '../../components/kit/toast'
import { Avatar } from '../../components/kit/Avatar'

interface Auth0ConnectionStatus {
  id: string
  label: string
  linked: boolean
  identity_id: string | null
  email: string | null
  can_unlink: boolean
}

interface IdentitiesResponse {
  enabled: boolean
  has_password: boolean
  connections: Auth0ConnectionStatus[]
}

export default function Security() {
  const { user, refresh } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [identities, setIdentities] = useState<IdentitiesResponse | null>(null)
  const [identityBusy, setIdentityBusy] = useState<string | null>(null)
  const [createPassword, setCreatePassword] = useState('')
  const [createConfirm, setCreateConfirm] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function loadIdentities() {
    try {
      const data = await api.get<IdentitiesResponse>('/auth/identities')
      setIdentities(data)
    } catch {
      setIdentities(null)
    }
  }

  useEffect(() => { void loadIdentities() }, [])

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

  async function onCreatePassword(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    if (createPassword !== createConfirm) {
      setCreateError('Passwords do not match.')
      return
    }
    if (createPassword.length < 10) {
      setCreateError('Password must be at least 10 characters.')
      return
    }
    setCreateBusy(true)
    try {
      await api.post('/auth/password', { password: createPassword })
      setCreatePassword('')
      setCreateConfirm('')
      toast.success('Password added to your account.')
      await loadIdentities()
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Could not add a password.')
    } finally {
      setCreateBusy(false)
    }
  }

  async function connect(connection: string) {
    if (identityBusy) return
    setIdentityBusy(connection)
    try {
      const data = await api.post<{ authorization_url: string }>('/auth/auth0/link', { connection, returnTo: window.location.pathname })
      window.location.assign(data.authorization_url)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not start that connection.')
      setIdentityBusy(null)
    }
  }

  async function unlink(identityId: string) {
    if (identityBusy) return
    setIdentityBusy(identityId)
    try {
      await api.post('/auth/auth0/unlink', { identity_id: identityId })
      toast.success('Sign-in method removed.')
      await loadIdentities()
      await refresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove that sign-in method.')
    } finally {
      setIdentityBusy(null)
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Account" title="Security" subtitle="Manage your login credentials." />

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

        {!identities || identities.has_password ? (
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
        ) : (
          <Card>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">Add a password</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">You currently sign in with a connected account. Adding a password gives you another way to reach this workspace.</p>
            <form onSubmit={onCreatePassword} className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">New password</span>
                <input className={inputCls} type="password" required minLength={10} autoComplete="new-password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Confirm password</span>
                <input className={inputCls} type="password" required autoComplete="new-password" value={createConfirm} onChange={(e) => setCreateConfirm(e.target.value)} />
              </label>
              {createError && <p className="text-sm text-rose-300">{createError}</p>}
              <button type="submit" disabled={createBusy} className="btn-gold disabled:opacity-60">
                {createBusy ? 'Saving…' : 'Add password'}
              </button>
            </form>
          </Card>
        )}
      </div>

      {identities?.enabled && identities.connections.length > 0 && (
        <Card className="mt-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">Connected sign-in methods</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Connect Google or Microsoft to this Pinnacle account. Permissions still come from your Pinnacle workspace, not from the identity provider.</p>
          <ul className="mt-4 space-y-3">
            {identities.connections.map((connection) => (
              <li key={connection.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{connection.label}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{connection.linked ? (connection.email ? `Connected as ${connection.email}` : 'Connected') : 'Not connected'}</p>
                </div>
                {connection.linked ? (
                  <button
                    type="button"
                    disabled={!!identityBusy || !connection.can_unlink}
                    onClick={() => connection.identity_id && unlink(connection.identity_id)}
                    className="btn-outline min-h-11 px-4 text-sm disabled:opacity-60"
                  >
                    {identityBusy === connection.identity_id ? 'Removing…' : connection.can_unlink ? `Disconnect ${connection.label}` : 'Keep at least one method'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!!identityBusy}
                    onClick={() => connect(connection.id)}
                    className="btn-gold min-h-11 px-4 text-sm disabled:opacity-60"
                  >
                    {identityBusy === connection.id ? 'Continuing…' : `Connect ${connection.label}`}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
