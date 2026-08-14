import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Card, PageHeader } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { inputCls } from '../auth/AuthLayout'
import { toast } from '../../components/kit/toast'
import { Avatar } from '../../components/kit/Avatar'
import { ProviderMark } from '../../components/auth/ProviderMarks'

interface IdentityRow {
  id: string
  provider: string
  label: string
  email: string | null
  email_verified: boolean
  created_at: string
  last_login_at: string | null
  can_unlink: boolean
}

interface IdentityResponse {
  password: { enabled: boolean }
  identities: IdentityRow[]
  providers: { enabled: boolean; connections: Array<{ id: string; label: string }> }
}

export default function Security() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [identities, setIdentities] = useState<IdentityResponse | null>(null)
  const [identityBusy, setIdentityBusy] = useState<string | null>(null)

  async function loadIdentities() {
    try {
      setIdentities(await api.get<IdentityResponse>('/auth/identities'))
    } catch {
      setIdentities({ password: { enabled: true }, identities: [], providers: { enabled: false, connections: [] } })
    }
  }

  useEffect(() => { void loadIdentities() }, [])

  const passwordEnabled = identities?.password.enabled !== false
  const connected = new Set((identities?.identities || []).map((row) => row.provider))
  const available = (identities?.providers.enabled ? identities.providers.connections : []).filter((row) => !connected.has(row.id))

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
      if (passwordEnabled) {
        await api.post('/portal/change-password', { current_password: currentPassword, new_password: newPassword })
      } else {
        await api.post('/portal/set-initial-password', { new_password: newPassword })
      }
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success(passwordEnabled ? 'Password updated.' : 'Password created.')
      await loadIdentities()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update password.')
    } finally {
      setBusy(false)
    }
  }

  async function connect(connection: string) {
    if (identityBusy) return
    setIdentityBusy(connection)
    try {
      const result = await api.post<{ ok: boolean; url: string }>('/auth/auth0/link', { connection })
      window.location.assign(result.url)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not start that connection.')
      setIdentityBusy(null)
    }
  }

  async function unlink(row: IdentityRow) {
    if (!row.can_unlink || identityBusy) return
    if (!window.confirm(`Remove ${row.label} as a sign-in method? You will still be able to sign in with another method on this account.`)) return
    setIdentityBusy(row.id)
    try {
      await api.post('/auth/auth0/unlink', { identity_id: row.id })
      toast.success(`${row.label} disconnected.`)
      await loadIdentities()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not disconnect that sign-in method.')
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">{passwordEnabled ? 'Change password' : 'Create a password'}</h2>
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            {passwordEnabled && (
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
            )}
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">{passwordEnabled ? 'New password' : 'Password'}</span>
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
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Confirm password</span>
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
              {busy ? 'Updating…' : passwordEnabled ? 'Update password' : 'Create password'}
            </button>
          </form>
        </Card>
      </div>

      <Card className="mt-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">Sign-in methods</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">Connect Google or Microsoft as another way to sign in. Pinnacle still decides what you can access after you authenticate.</p>
        <ul className="mt-4 space-y-3">
          <li className="flex flex-col gap-2 rounded-md border border-white/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Email and password</p>
              <p className="text-xs text-slate-500">{passwordEnabled ? 'Available for this account' : 'Not created yet'}</p>
            </div>
          </li>
          {(identities?.identities || []).map((row) => (
            <li key={row.id} className="flex flex-col gap-3 rounded-md border border-white/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5"><ProviderMark provider={row.provider} /></span>
                <div>
                  <p className="text-sm font-semibold text-white">{row.label}</p>
                  <p className="text-xs text-slate-500">{row.email || 'Connected'}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={!row.can_unlink || identityBusy === row.id}
                onClick={() => void unlink(row)}
                className="btn-outline !px-3 !py-2 text-xs disabled:opacity-50"
              >
                {row.can_unlink ? (identityBusy === row.id ? 'Removing…' : 'Disconnect') : 'Required sign-in method'}
              </button>
            </li>
          ))}
        </ul>
        {available.length > 0 && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {available.map((connection) => (
              <button
                key={connection.id}
                type="button"
                disabled={!!identityBusy}
                onClick={() => void connect(connection.id)}
                className="btn-outline min-h-11 flex-1 text-sm disabled:opacity-60"
                aria-label={`Connect ${connection.label}`}
              >
                <ProviderMark provider={connection.id} />
                {identityBusy === connection.id ? 'Connecting…' : `Connect ${connection.label}`}
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
