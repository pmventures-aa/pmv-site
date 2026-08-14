import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { toast } from '../kit/toast'
import { Auth0Providers } from './Auth0Providers'

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

export function ConnectedSignInMethods({
  tone = 'portal',
  description,
}: {
  tone?: 'portal' | 'hq'
  description?: string
}) {
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
  const copy = description || (tone === 'hq'
    ? 'Link Google or Microsoft after signing in with your Pinnacle email and password. HQ and provider access still follow your role and permissions.'
    : 'Link Google or Microsoft after you are signed in with your Pinnacle email and password. Pinnacle still controls what you can access.')

  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">Connected sign-in methods</h2>
      <p className="mt-2 text-xs leading-5 text-slate-500">{copy}</p>
      {auth0Enabled && (
        <div className="mt-4 max-w-md">
          <Auth0Providers mode="link" disabled={oauthBusy || unlinkingId !== null} onBusyChange={setOauthBusy} compact />
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
    </div>
  )
}
