import type { ReactNode } from 'react'

// Shared presentational primitives for the staff console only — mirrors the
// design language used on the public site (src/components/public/ui.tsx):
// sharp corners, no backdrop-blur "glass" panels, no rounded-full pill
// buttons. Deliberately separate from ../ui.tsx (used by the client portal)
// so nothing here ripples into the logged-in client experience.

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy-950 transition hover:bg-gold-400 disabled:opacity-60'
export const btnOutline =
  'inline-flex items-center justify-center gap-2 rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-gold hover:text-gold disabled:opacity-60'
export const panelCls = 'rounded-md border border-white/10 bg-white/[0.02]'
export const inputCls =
  'w-full rounded-md border border-white/10 bg-navy-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-gold/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950'

export function PageIntro({
  kicker,
  title,
  subtitle,
  action,
  leading,
}: {
  kicker: string
  title: string
  subtitle?: string
  action?: ReactNode
  leading?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        {leading}
        <div>
          <p className="eyebrow">{kicker}</p>
          <h1 className="mt-2 font-display text-3xl font-medium text-white">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

export function Panel({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`${panelCls} p-5 ${className}`}>{children}</div>
}

export function EmptyState({ label }: { label: string }) {
  return <div className="rounded-md border border-dashed border-white/10 py-10 text-center text-sm text-slate-500">{label}</div>
}

// Shown instead of a blank/broken page when a staff member hits a
// capability-gated route (Users, Assignments, Settings) without the grant —
// e.g. an old bookmark, or before an admin has granted them access.
export function NoAccess({ label = 'this section' }: { label?: string }) {
  return (
    <Panel className="max-w-lg">
      <p className="text-sm font-medium text-white">You don't have access to {label}.</p>
      <p className="mt-2 text-sm text-slate-400">
        Ask an admin to grant you access from Settings → Staff &amp; Permissions.
      </p>
    </Panel>
  )
}

export type Tone = 'gold' | 'green' | 'blue' | 'slate' | 'red'
const toneMap: Record<Tone, string> = {
  gold: 'bg-gold/10 text-gold border-gold/25',
  green: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/25',
  blue: 'bg-sky-400/10 text-sky-300 border-sky-400/25',
  slate: 'bg-white/5 text-slate-300 border-white/15',
  red: 'bg-rose-400/10 text-rose-300 border-rose-400/25',
}

export function Tag({ children, tone = 'slate' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneMap[tone]}`}>
      {children}
    </span>
  )
}

export function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Panel className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 font-display text-3xl font-medium text-white">{value}</p>
    </Panel>
  )
}
