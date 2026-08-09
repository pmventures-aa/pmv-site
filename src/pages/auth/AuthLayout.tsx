import { Crest } from '../../components/ui'
import { ThemeToggle } from '../../components/ThemeToggle'

export function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="relative grid min-h-screen place-items-center bg-navy-radial px-4 py-12">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6"><ThemeToggle compact /></div>
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <a href="https://pinnaclemanagementventures.com" className="inline-flex">
            <Crest size={58} />
          </a>
          <p className="eyebrow mt-4">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">{title}</h1>
          {subtitle && <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400">{subtitle}</p>}
        </div>
        <div className="glass-card p-6 sm:p-7">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-slate-400">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>{children}</label>
}

export const inputCls =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-gold/60 focus:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950'

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm text-rose-200">{message}</div>
}
