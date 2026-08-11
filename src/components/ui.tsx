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

type BrandMarkVariant = 'standard' | 'spotlight' | 'quiet'

export function WhiteGoldBrandMark({ size = 120, className = '', decorative = false }: { size?: number; className?: string; decorative?: boolean }) {
  return <img src="/logo-crest-white-gold.png" alt={decorative ? '' : 'Pinnacle Management Ventures crest'} aria-hidden={decorative || undefined} className={`pmv-white-gold-mark object-contain ${className}`} style={{ width: size, height: size }} />
}

export function Logo({ className = '', showText = true, markSize = 54 }: { className?: string; showText?: boolean; markSize?: number }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <WhiteGoldBrandMark size={markSize} decorative className="shrink-0" />
      {showText && <div className="leading-tight"><div className="font-display text-[15px] font-extrabold tracking-[.04em] text-white">PINNACLE</div><div className="mt-1 text-[9px] font-bold uppercase tracking-[0.24em] text-gold-400">Management Ventures</div></div>}
    </div>
  )
}

export function Crest({ size = 96, className = '' }: { size?: number; className?: string }) {
  return <img src="/logo-crest-white-gold.png" alt="Pinnacle Management Ventures crest" style={{ width: size, height: size }} className={`${crestClass} ${className}`} />
}

export function BrandMark3D({ size = 120, className = '', decorative = false, variant = 'standard' }: { size?: number; className?: string; decorative?: boolean; variant?: BrandMarkVariant }) {
  const depth = Array.from({ length: variant === 'quiet' ? 3 : 6 })
  return (
    <div className={`pmv-brand-object pmv-brand-object-${variant} relative ${className}`} style={{ width: size, height: size }} aria-hidden={decorative || undefined}>
      {variant === 'spotlight' && <div className="pmv-brand-aura absolute inset-[-16%]" aria-hidden="true" />}
      <div className="pmv-brand-gyro relative h-full w-full">
        <div className="pmv-brand-depth relative h-full w-full">
          {depth.map((_, i) => (
            <img key={i} src="/logo-crest-white-gold.png" alt="" aria-hidden="true" className="pmv-crest-depth pmv-brand-depth-layer absolute inset-0 h-full w-full object-contain" style={{ transform: `translate3d(${depth.length - i}px, ${Math.max(1, depth.length - i - 1)}px, ${-10 + i * 2}px)`, opacity: Math.max(.06, .18 - i * .018) }} />
          ))}
          <img src="/logo-crest-white-gold.png" alt={decorative ? '' : 'Pinnacle Management Ventures crest'} className={`pmv-brand-face absolute inset-0 h-full w-full drop-shadow-[0_18px_24px_rgba(0,0,0,.28)] ${crestClass}`} />
          <div className="pmv-brand-specular pointer-events-none absolute inset-[3%]" aria-hidden="true" />
          <div className="pmv-brand-rim pointer-events-none absolute inset-[4%]" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle?: string; action?: React.ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">{eyebrow}</p><h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{title}</h1>{subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-400">{subtitle}</p>}</div>{action}</div>
}

export function EmptyState({ label }: { label: string }) {
  return <div className="rounded-lg border border-dashed border-white/10 py-10 text-center"><BrandMark3D size={46} decorative variant="quiet" className="mx-auto mb-3 opacity-70"/><p className="text-sm text-slate-500">{label}</p></div>
}

export function StatCard({ label, value }: { label: string; value: React.ReactNode }) { return <Card className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 text-3xl font-bold text-white">{value}</p></Card> }
