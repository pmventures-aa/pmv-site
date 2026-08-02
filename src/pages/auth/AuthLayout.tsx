import { Crest } from '../../components/ui'

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
    <div className="grid min-h-screen place-items-center bg-navy-radial px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <a href="https://pinnaclemanagementventures.com">
            <Crest size={72} />
          </a>
          <p className="eyebrow mt-5">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-bold text-white">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-400">{subtitle}</p>}
        </div>
        <div className="glass-card p-7">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-slate-400">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  )
}

export const inputCls =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-gold/60 focus:bg-white/[0.06]'

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm text-rose-200">
      {message}
    </div>
  )
}
