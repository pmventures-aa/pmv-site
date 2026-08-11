import React from 'react'

export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-lg border border-white/10 bg-navy-900/70 p-6 ${className}`}>{children}</div>
}

export type Tone = 'gold' | 'green' | 'blue' | 'slate' | 'red'
const toneMap: Record<Tone, string> = {
  gold: 'bg-gold/10 text-gold border-gold/25',
  green: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/25',
  blue: 'bg-sky-400/10 text-sky-300 border-sky-400/25',
  slate: 'bg-white/5 text-slate-300 border-white/15',
  red: 'bg-rose-400/10 text-rose-300 border-rose-400/25',
}

export function StatusBadge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${toneMap[tone]}`}>{children}</span>
}

const crestClass = 'pmv-crest-adaptive object-contain'

export function Logo({ className = '', showText = true, markSize = 62 }: { className?: string; showText?: boolean; markSize?: number }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <BrandMark3D size={markSize} decorative className="shrink-0" />
      {showText && <div className="leading-tight"><div className="text-[15px] font-bold tracking-[.025em] text-white">PINNACLE</div><div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">Management Ventures</div></div>}
    </div>
  )
}

export function Crest({ size = 96, className = '' }: { size?: number; className?: string }) {
  return <img src="/logo-crest-transparent.png" alt="Pinnacle Management Ventures crest" style={{ width: size, height: size }} className={`${crestClass} ${className}`} />
}

export function BrandMark3D({ size = 120, className = '', decorative = false }: { size?: number; className?: string; decorative?: boolean }) {
  const shadows = Array.from({ length: 7 })
  return (
    <div className={`relative [perspective:800px] ${className}`} style={{ width: size, height: size }} aria-hidden={decorative || undefined}>
      <div className="pmv-brand-stage absolute inset-[-14%] rounded-full" aria-hidden="true" />
      <div className="brand-mark-3d relative h-full w-full [transform-style:preserve-3d] will-change-transform">
        {shadows.map((_, i) => <img key={i} src="/logo-crest-transparent.png" alt="" aria-hidden="true" className="pmv-crest-depth absolute inset-0 h-full w-full object-contain opacity-20" style={{ transform: `translate3d(${7 - i}px, ${7 - i}px, ${-7 + i}px)` }} />)}
        <img src="/logo-crest-transparent.png" alt={decorative ? '' : 'Pinnacle Management Ventures crest'} className={`absolute inset-0 h-full w-full drop-shadow-[0_20px_24px_rgba(0,0,0,.34)] ${crestClass}`} style={{ transform: 'translateZ(8px)' }} />
        <div className="pointer-events-none absolute inset-[5%] rounded-full bg-gradient-to-br from-white/30 via-transparent to-gold/20 opacity-50 mix-blend-screen" aria-hidden="true" />
      </div>
    </div>
  )
}

export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle?: string; action?: React.ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">{eyebrow}</p><h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{title}</h1>{subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-400">{subtitle}</p>}</div>{action}</div>
}

export function EmptyState({ label }: { label: string }) {
  return <div className="rounded-lg border border-dashed border-white/10 py-10 text-center"><BrandMark3D size={46} decorative className="mx-auto mb-3 opacity-70"/><p className="text-sm text-slate-500">{label}</p></div>
}

export function StatCard({ label, value }: { label: string; value: React.ReactNode }) { return <Card className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 text-3xl font-bold text-white">{value}</p></Card> }
