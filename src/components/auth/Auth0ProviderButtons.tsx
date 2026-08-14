import { useEffect, useState } from 'react'

type Provider = { id: 'google' | 'microsoft'; label: string }

const LABELS: Record<string, string> = {
  google: 'Continue with Google',
  microsoft: 'Continue with Microsoft',
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

function MicrosoftMark({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  )
}

export function Auth0ProviderButtons({
  returnTo = '/portal',
  disabled = false,
}: {
  returnTo?: string
  disabled?: boolean
}) {
  const [providers, setProviders] = useState<Provider[]>([])
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/auth0/providers', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('unavailable')
        return res.json() as Promise<{ enabled?: boolean; providers?: Provider[] }>
      })
      .then((data) => {
        if (cancelled) return
        setEnabled(Boolean(data.enabled))
        setProviders(Array.isArray(data.providers) ? data.providers : [])
      })
      .catch(() => {
        if (!cancelled) {
          setEnabled(false)
          setProviders([])
          setLoadError(true)
        }
      })
    return () => { cancelled = true }
  }, [])

  if (loadError || !enabled || providers.length === 0) return null

  function start(providerId: string) {
    if (disabled || busy) return
    setBusy(providerId)
    const params = new URLSearchParams({
      provider: providerId,
      returnTo,
    })
    window.location.assign(`/api/auth/auth0/login?${params.toString()}`)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2.5">
        {providers.map((provider) => {
          const label = LABELS[provider.id] || provider.label
          const isBusy = busy === provider.id
          return (
            <button
              key={provider.id}
              type="button"
              disabled={disabled || Boolean(busy)}
              onClick={() => start(provider.id)}
              aria-label={label}
              className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/12 bg-white/[.04] px-4 text-sm font-semibold text-white transition hover:border-gold/35 hover:bg-white/[.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {provider.id === 'microsoft' ? <MicrosoftMark /> : <GoogleMark />}
              <span>{isBusy ? 'Redirecting…' : label}</span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-3 py-1" aria-hidden="true">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-[11px] font-semibold uppercase tracking-[.14em] text-slate-500">or</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
    </div>
  )
}

export function auth0ErrorMessage(code: string | null): string | null {
  if (!code) return null
  switch (code) {
    case 'unlinked':
      return 'No Pinnacle account is connected to that sign-in method. Sign in with email and password, then connect it from Account → Security.'
    case 'disabled':
      return 'This account cannot sign in right now. Contact Pinnacle if you need help.'
    case 'email_unverified':
      return 'That sign-in method needs a verified email before it can be used here.'
    case 'invalid_state':
    case 'invalid_token':
    case 'expired':
    case 'denied':
    case 'failed':
    case 'unavailable':
      return 'We could not complete that sign-in. Please try again or use your email and password.'
    case 'already_linked':
      return 'That sign-in method is already connected to another Pinnacle account.'
    case 'link_session':
    case 'link_failed':
      return 'We could not connect that sign-in method. Sign in again and try from Account → Security.'
    default:
      return 'We could not complete that sign-in. Please try again.'
  }
}
