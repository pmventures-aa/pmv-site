import React from 'react'

export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`glass-card p-6 ${className}`}>{children}</div>
}

export type Tone = 'gold' | 'green' | 'blue' | 'slate' | 'red'
const toneMap: Record<Tone, string> = {
  gold: 'bg-gold/15 text-gold border-gold/30',
  green: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  blue: 'bg-sky-400/15 text-sky-300 border-sky-400/30',
  slate: 'bg-white/10 text-slate-300 border-white/20',
  red: 'bg-rose-400/15 text-rose-300 border-rose-400/30',
}

export function StatusBadge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${toneMap[tone]}`}>
      {children}
    </span>
  )
}

export function Logo({ className = '', showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-white shadow-glass ring-1 ring-white/20">
        <img src="/logo-crest.png" alt="Pinnacle Management Ventures crest" className="h-9 w-9 object-contain" />
      </div>
      {showText && (
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-tight text-white">PINNACLE</div>
          <div className="text-[10px] font-medium uppercase tracking-[0.25em] text-gold">Management Ventures</div>
        </div>
      )}
    </div>
  )
}

// Large centered crest for hero / login screens
export function Crest({ size = 96, className = '' }: { size?: number; className?: string }) {
  return (
    <div
      className={`grid place-items-center overflow-hidden rounded-full bg-white shadow-glass ring-1 ring-white/20 ${className}`}
      style={{ width: size, height: size }}
    >
      <img src="/logo-crest.png" alt="Pinnacle Management Ventures crest" style={{ width: size * 0.82, height: size * 0.82 }} className="object-contain" />
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 py-10 text-center text-sm text-slate-500">
      {label}
    </div>
  )
}

export function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-white">{value}</p>
    </Card>
  )
}
