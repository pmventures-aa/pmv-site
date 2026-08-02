import React from 'react'

export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`glass-card p-6 ${className}`}>{children}</div>
}

type Tone = 'gold' | 'green' | 'blue' | 'slate' | 'red'
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

export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-gold text-navy-950 font-extrabold">P</div>
      <div className="leading-tight">
        <div className="text-sm font-bold tracking-tight text-white">PINNACLE</div>
        <div className="text-[10px] font-medium uppercase tracking-[0.25em] text-gold">Management Ventures</div>
      </div>
    </div>
  )
}
