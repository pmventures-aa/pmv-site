import type { ReactNode } from 'react'
import { LockKeyhole } from 'lucide-react'
import { Crest } from '../../components/ui'
import { ThemeToggle } from '../../components/ThemeToggle'
import { AuthAtmosphere, AuthRotatingCopy, AuthRotatingLine } from '../../components/auth/AuthAtmosphere'
import { authMomentsFor } from '../../data/authMoments'

interface AuthLayoutProps {
  eyebrow: string
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  surface?: 'client' | 'staff' | 'general'
  sideTitle?: string
  sideBody?: string
  sideLabel?: string
  sidePoints?: string[]
  liveCopy?: boolean
}

const surfaceCopy = {
  client: {
    label: 'Pinnacle Client Workspace',
    title: 'Your work with Pinnacle, organized in one secure place.',
    body: 'Continue a service request, review documents, message your team, track next steps, and keep the engagement moving without chasing updates.',
    points: ['Secure documents and messages', 'Clear next steps and service status', 'One relationship across the work'],
  },
  staff: {
    label: 'Pinnacle HQ',
    title: 'Sign in to continue.',
    body: 'Every sign-in is encrypted in transit, logged with IP and device, and expires automatically.',
    points: [] as string[],
  },
  general: {
    label: 'Pinnacle Secure Access',
    title: 'Professional support should feel clear from the first click.',
    body: 'Pinnacle keeps communication, documents, next steps, and the work itself connected in one secure experience.',
    points: ['Secure account access', 'Clear communication', 'Practical follow-through'],
  },
} as const

export function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  surface = 'general',
  sideTitle,
  sideBody,
  sideLabel,
  sidePoints,
  liveCopy = false,
}: AuthLayoutProps) {
  const copy = surfaceCopy[surface]
  const moments = authMomentsFor(surface)
  const points = liveCopy ? [] : (sidePoints ?? copy.points)
  const live = liveCopy && moments.length > 0

  return (
    <div className={`auth-shell auth-shell-${surface} min-h-screen bg-navy-950 text-slate-100`}>
      <div className="absolute right-4 top-4 z-30 sm:right-6 sm:top-6"><ThemeToggle compact /></div>

      <aside className={`auth-brand-panel auth-brand-panel-${surface} hidden lg:flex`}>
        <AuthAtmosphere surface={surface} />
        <div className="relative z-10 flex h-full w-full max-w-xl flex-col justify-between py-10">
          <a href="https://pinnaclemanagementventures.com" className="inline-flex w-fit items-center gap-4" aria-label="Pinnacle Management Ventures home">
            <Crest size={72} tone="light" className="pmv-auth-crest shrink-0" />
            <span>
              <span className="block text-xs font-bold uppercase tracking-[.2em] text-gold">Pinnacle</span>
              <span className="mt-1 block text-base font-semibold tracking-wide text-white">Management Ventures</span>
            </span>
          </a>

          {live ? (
            <AuthRotatingCopy moments={moments} />
          ) : (
            <div className="py-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/[.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.14em] text-gold">
                {sideLabel || copy.label}
              </div>
              <h2 className="mt-6 max-w-lg font-display text-4xl font-semibold leading-[1.08] tracking-[-.025em] text-white xl:text-5xl">
                {sideTitle || copy.title}
              </h2>
              <p className="mt-5 max-w-lg text-[15px] leading-7 text-slate-300">{sideBody || copy.body}</p>
              <div className="mt-8 space-y-3">
                {points.map((point) => (
                  <div key={point} className="flex items-center gap-3 text-sm font-medium text-slate-200">
                    <span className="h-1 w-1 rounded-full bg-gold" /> {point}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <LockKeyhole size={14} className="text-gold/70" />
            <span>Encrypted in transit. Access is logged and session controlled.</span>
          </div>
        </div>
      </aside>

      <main className="auth-form-panel relative flex min-h-screen items-center justify-center px-5 py-20 sm:px-8 lg:px-12">
        <div className="w-full max-w-[520px]">
          <div className="mb-8 lg:hidden">
            <a href="https://pinnaclemanagementventures.com" className="inline-flex items-center gap-3">
              <Crest size={54} className="pmv-auth-crest shrink-0" />
              <span>
                <span className="block text-[10px] font-bold uppercase tracking-[.2em] text-gold">Pinnacle</span>
                <span className="mt-1 block text-sm font-semibold text-white">Management Ventures</span>
              </span>
            </a>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.18em] text-gold">{eyebrow}</p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-[-.025em] text-white sm:text-[2.7rem]">{title}</h1>
            {live ? (
              <AuthRotatingLine lines={moments.map((moment) => moment.line)} />
            ) : (
              subtitle && <p className="mt-3 max-w-md text-[15px] leading-7 text-slate-400">{subtitle}</p>
            )}
          </div>

          <div className="auth-card mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm leading-6 text-slate-400">{footer}</div>}
        </div>
      </main>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-200">{label}</span>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

export const inputCls =
  'pmv-form-control w-full rounded-xl border border-white/12 bg-white/[0.045] px-4 py-3 text-[15px] font-medium text-white placeholder:font-normal placeholder:text-slate-500 outline-none transition focus:border-gold/60 focus:bg-white/[0.065] focus-visible:ring-4 focus-visible:ring-gold/10'

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return <div className="mb-5 rounded-xl border border-rose-400/25 bg-rose-400/[.08] px-4 py-3 text-sm font-medium leading-6 text-rose-100">{message}</div>
}
