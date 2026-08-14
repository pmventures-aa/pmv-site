import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

export interface Auth0Provider {
  key: 'google' | 'microsoft'
  label: string
  connection: string
}

interface Auth0ProvidersResponse {
  enabled: boolean
  providers: Auth0Provider[]
}

function providerLabel(provider: Auth0Provider): string {
  return provider.key === 'google' ? 'Continue with Google' : 'Continue with Microsoft'
}

function ProviderIcon({ provider }: { provider: Auth0Provider }) {
  if (provider.key === 'google') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
        <path fill="#EA4335" d="M12 10.2v3.84h5.38c-.23 1.24-.93 2.29-1.98 3.01l3.2 2.48C20.88 18.36 22 15.92 22 12c0-.68-.06-1.34-.18-1.98H12z" />
        <path fill="#34A853" d="M5.84 14.09l-.84.64-2.48 1.93C4.28 19.94 7.92 22 12 22c3.24 0 5.95-1.07 7.93-2.91l-3.2-2.48c-.89.6-2.04.95-3.73.95-2.86 0-5.29-1.93-6.16-4.53z" />
        <path fill="#4A90E2" d="M2.18 7.09C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.91l3.32-2.58C4.98 13.98 4.73 13.02 4.73 12s.25-1.98.77-2.91L2.18 7.09z" />
        <path fill="#FBBC05" d="M12 4.38c1.77 0 3.35.61 4.6 1.8l3.45-3.45C17.93 1.19 15.22 0 12 0 7.92 0 4.28 2.06 1.64 5.09l3.32 2.58C5.71 5.31 8.14 4.38 12 4.38z" />
      </svg>
    )
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M13 1h10v10H13z" />
      <path fill="#00A4EF" d="M1 13h10v10H1z" />
      <path fill="#FFB900" d="M13 13h10v10H13z" />
    </svg>
  )
}

export function Auth0Providers({
  mode = 'login',
  returnTo,
  disabled = false,
  onBusyChange,
}: {
  mode?: 'login' | 'link'
  returnTo?: string
  disabled?: boolean
  onBusyChange?: (busy: boolean) => void
}) {
  const [providers, setProviders] = useState<Auth0Provider[]>([])
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.get<Auth0ProvidersResponse>('/auth/auth0/providers')
      .then((data) => {
        if (cancelled) return
        setEnabled(data.enabled)
        setProviders(data.providers || [])
      })
      .catch(() => {
        if (!cancelled) {
          setEnabled(false)
          setProviders([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    onBusyChange?.(busyKey !== null)
  }, [busyKey, onBusyChange])

  if (loading || !enabled || providers.length === 0) return null

  async function start(provider: Auth0Provider) {
    if (disabled || busyKey) return
    setBusyKey(provider.key)
    try {
      if (mode === 'link') {
        const data = await api.post<{ ok: boolean; authorize_url: string }>('/auth/auth0/link', { provider: provider.key })
        window.location.assign(data.authorize_url)
        return
      }
      const params = new URLSearchParams({ provider: provider.key })
      if (returnTo) params.set('returnTo', returnTo)
      window.location.assign(`/api/auth/auth0/login?${params.toString()}`)
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="space-y-3">
      {providers.map((provider) => (
        <button
          key={provider.key}
          type="button"
          disabled={disabled || busyKey !== null}
          onClick={() => start(provider)}
          className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[.03] px-4 text-sm font-semibold text-white transition hover:border-gold/30 hover:bg-white/[.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ProviderIcon provider={provider} />
          <span>{busyKey === provider.key ? 'Redirecting…' : providerLabel(provider)}</span>
        </button>
      ))}
    </div>
  )
}

export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  sign_in_unavailable: 'Social sign-in is not available right now. Use your email and password, or try again later.',
  sign_in_failed: 'We could not complete that sign-in. Please try again or use your email and password.',
  account_not_linked: 'This sign-in method is not connected to a Pinnacle account yet. Sign in with your email and password, then connect it from Account Security.',
  account_inactive: 'This account is not active. Contact Pinnacle support if you need help.',
}
