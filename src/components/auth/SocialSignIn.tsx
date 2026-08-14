import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

export interface Auth0Connection {
  id: string
  label: string
}

interface Auth0Status {
  enabled: boolean
  connections: Auth0Connection[]
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.69 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}

function MicrosoftMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
      <path fill="#F25022" d="M0 0h8.6v8.6H0z" />
      <path fill="#7FBA00" d="M9.4 0H18v8.6H9.4z" />
      <path fill="#00A4EF" d="M0 9.4h8.6V18H0z" />
      <path fill="#FFB900" d="M9.4 9.4H18V18H9.4z" />
    </svg>
  )
}

function ProviderIcon({ id }: { id: string }) {
  if (id === 'google-oauth2') return <GoogleMark />
  return <MicrosoftMark />
}

export function useAuth0Status() {
  const [status, setStatus] = useState<Auth0Status>({ enabled: false, connections: [] })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.get<Auth0Status>('/auth/auth0/status')
      .then((data) => {
        if (!cancelled) setStatus({ enabled: !!data.enabled, connections: data.connections || [] })
      })
      .catch(() => {
        if (!cancelled) setStatus({ enabled: false, connections: [] })
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => { cancelled = true }
  }, [])

  return { ...status, loaded }
}

export function SocialSignIn({
  returnTo,
  intent = 'login',
  invite,
  disabled,
  onBusy,
}: {
  returnTo?: string
  intent?: 'login' | 'signup'
  invite?: string
  disabled?: boolean
  onBusy?: (busy: boolean) => void
}) {
  const { enabled, connections, loaded } = useAuth0Status()
  const [busyId, setBusyId] = useState<string | null>(null)

  if (!loaded || !enabled || connections.length === 0) return null

  function hrefFor(connection: string) {
    const params = new URLSearchParams({ connection, intent })
    if (returnTo) params.set('returnTo', returnTo)
    if (invite) params.set('invite', invite)
    return `/api/auth/auth0/login?${params.toString()}`
  }

  return (
    <div className="space-y-3">
      {connections.map((connection) => (
        <a
          key={connection.id}
          href={disabled || busyId ? undefined : hrefFor(connection.id)}
          aria-disabled={disabled || !!busyId}
          aria-busy={busyId === connection.id}
          onClick={(event) => {
            if (disabled || busyId) {
              event.preventDefault()
              return
            }
            setBusyId(connection.id)
            onBusy?.(true)
          }}
          className="btn-outline flex min-h-12 w-full items-center justify-center gap-3 text-[15px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/20 disabled:opacity-60"
        >
          <ProviderIcon id={connection.id} />
          <span>{busyId === connection.id ? 'Continuing…' : `Continue with ${connection.label}`}</span>
        </a>
      ))}
      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center" aria-hidden="true"><div className="w-full border-t border-white/10" /></div>
        <p className="relative mx-auto w-fit bg-transparent px-3 text-xs font-semibold uppercase tracking-[.14em] text-slate-500">or use email</p>
      </div>
    </div>
  )
}
