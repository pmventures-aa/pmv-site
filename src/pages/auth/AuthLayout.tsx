import { CheckCircle2, LockKeyhole, Sparkles } from 'lucide-react'
import { Crest } from '../../components/ui'
import { ThemeToggle } from '../../components/ThemeToggle'

interface AuthLayoutProps {
  eyebrow: string
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
  surface?: 'client' | 'staff' | 'general'
  sideTitle?: string
  sideBody?: string
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
    title: 'A focused operating workspace built for the work behind the relationship.',
    body: 'Manage clients, pipeline, communications, documents, reporting, field work, security, and follow-through from one controlled workspace.',
    points: ['Role-based access and audit history', 'Client and operational command center', 'Security controls built into the workflow'],
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
}: AuthLayoutProps) {
  const copy = surfaceCopy[surface]
  return (
    <div className="auth-shell min-h-screen bg-navy-950 text-slate-100">
      <div className="absolute right-4 top-4 z-30 sm:right-6 sm:top-6"><ThemeToggle compact /></div>

      <aside className="auth-brand-panel hidden lg:flex">
        <div className="auth-brand-glow" aria-hidden="true" />
        <div className="auth-brand-orbit auth-brand-orbit-one" aria-hidden="true" />
        <div className="auth-brand-orbit auth-brand-orbit-two" aria-hidden="true" />
        <div className="relative z-10 flex h-full w-full max-w-xl flex-col justify-between py-12">
          <a href="https://pinnaclemanagementventures.com" className="inline-flex w-fit items-center gap-3" aria-label="Pinnacle Management Ventures home">
            <span className="auth-crest-wrap"><Crest size={52} /></span>
            <span>
              <span className="block text-[10px] font-bold uppercase tracking-[.2em] text-gold">Pinnacle</span>
              <span className="mt-1 block text-sm font-semibold tracking-wide text-white">Management Ventures</span>
            </span>
          </a>

          <div className="py-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/[.06] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.16em] text-gold">
              <Sparkles size={13} /> {copy.label}
            </div>
            <h2 className="mt-6 max-w-lg font-display text-4xl font-semibold leading-[1.08] tracking-[-.025em] text-white xl:text-5xl">
              {sideTitle || copy.title}
            </h2>
            <p className="mt-5 max-w-lg text-[15px] leading-7 text-slate-300">{sideBody || copy.body}</p>
            <div className="mt-8 space-y-3">
              {copy.points.map((point) => (
                <div key={point} className="flex items-center gap-3 text-sm font-medium text-slate-200">
                  <CheckCircle2 size={17} className="text-gold" /> {point}
                </div>
              ))}
            </div>
          </div>

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
              <span className="auth-crest-wrap"><Crest size={48} /></span>
              <span>
                <span className="block text-[10px] font-bold uppercase tracking-[.2em] text-gold">Pinnacle</span>
                <span className="mt-1 block text-sm font-semibold text-white">Management Ventures</span>
              </span>
            </a>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.18em] text-gold">{eyebrow}</p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-[-.025em] text-white sm:text-[2.7rem]">{title}</h1>
            {subtitle && <p className="mt-3 max-w-md text-[15px] leading-7 text-slate-400">{subtitle}</p>}
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
