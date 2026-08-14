import type { ReactElement } from 'react'

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]">
      <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.8-4.1 2.8-7 0-.7-.1-1.4-.2-2H12z" />
      <path fill="#34A853" d="M6.6 14.3l-.9.7-3.1 2.4C4.5 20.5 8 22.5 12 22.5c2.7 0 5-.9 6.7-2.4l-3.1-2.4c-.9.6-2 .9-3.6.9-2.7 0-5-1.8-5.8-4.3z" />
      <path fill="#4A90E2" d="M2.6 7.6A10.4 10.4 0 0 0 2 12c0 1.6.4 3.1 1.1 4.4l4.4-3.4c-.2-.7-.4-1.4-.4-2.1 0-.7.1-1.4.3-2z" />
      <path fill="#FBBC05" d="M12 5.3c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 2.4 14.7 1.5 12 1.5 8 1.5 4.5 3.5 2.6 7.6l4.4 3.4C7.9 8.5 9.3 5.3 12 5.3z" />
    </svg>
  )
}

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]">
      <path fill="#F25022" d="M3 3h8.5v8.5H3z" />
      <path fill="#7FBA00" d="M12.5 3H21v8.5h-8.5z" />
      <path fill="#00A4EF" d="M3 12.5h8.5V21H3z" />
      <path fill="#FFB900" d="M12.5 12.5H21V21h-8.5z" />
    </svg>
  )
}

export type Auth0ProviderId = 'google' | 'microsoft'

export interface Auth0ProviderOption {
  id: Auth0ProviderId
  label: string
}

const MARK: Record<Auth0ProviderId, () => ReactElement> = {
  google: GoogleMark,
  microsoft: MicrosoftMark,
}

export function Auth0Buttons({
  providers,
  busy,
  onStart,
  prefix = 'Continue with',
}: {
  providers: Auth0ProviderOption[]
  busy: boolean
  onStart: (id: Auth0ProviderId) => void
  prefix?: string
}) {
  if (providers.length === 0) return null
  return (
    <div className="space-y-3">
      {providers.map((provider) => {
        const Icon = MARK[provider.id]
        return (
          <button
            key={provider.id}
            type="button"
            disabled={busy}
            onClick={() => onStart(provider.id)}
            aria-label={`${prefix} ${provider.label}`}
            className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/12 bg-white/[0.045] px-4 text-[15px] font-semibold text-white outline-none transition hover:border-gold/40 hover:bg-white/[0.07] focus-visible:ring-4 focus-visible:ring-gold/15 disabled:opacity-60"
          >
            <Icon />
            {prefix} {provider.label}
          </button>
        )
      })}
    </div>
  )
}

export function AuthDivider({ label = 'or continue with email' }: { label?: string }) {
  return (
    <p className="my-6 text-center text-[11px] font-semibold uppercase tracking-[.14em] text-slate-500">{label}</p>
  )
}
