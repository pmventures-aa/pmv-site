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
type CrestTone = 'auto' | 'light' | 'dark'
// Two source assets: the original navy/blue crest for light surfaces, and a
// pre-rendered white/gold crest for dark surfaces. The prior tone='light'
// implementation stacked CSS filters on the original artwork and looked
// muddy in the sidebar; the dedicated asset renders cleanly at every size.
const CREST_DARK_ART = '/logo-crest-transparent.png'   // navy artwork - for LIGHT surfaces
const CREST_LIGHT_ART = '/logo-crest-white-gold.png'   // white+gold artwork - for DARK surfaces

function CrestArtwork({ size, tone = 'auto', className = '', decorative = false }: { size:number; tone?:CrestTone; className?:string; decorative?:boolean }) {
  const alt = decorative ? '' : 'Pinnacle Management Ventures crest'
  if (tone === 'light') return <img src={CREST_LIGHT_ART} alt={alt} aria-hidden={decorative || undefined} className={`pmv-crest-artwork pmv-crest-dark-surface object-contain ${className}`} style={{ width:size, height:size }}/>
  if (tone === 'dark') return <img src={CREST_DARK_ART} alt={alt} aria-hidden={decorative || undefined} className={`pmv-crest-artwork object-contain ${className}`} style={{ width:size, height:size }}/>
  // Auto: show the white/gold on dark theme, navy on light theme via CSS
  return <span className={`pmv-crest-switch pmv-crest-switch-auto relative inline-block shrink-0 ${className}`} style={{ width:size, height:size }} aria-hidden={decorative || undefined}>
    <img src={CREST_LIGHT_ART} alt={alt} className="pmv-crest-artwork pmv-crest-dark-surface pmv-crest-for-dark absolute inset-0 h-full w-full object-contain"/>
    <img src={CREST_DARK_ART} alt={alt} className="pmv-crest-artwork pmv-crest-for-light absolute inset-0 h-full w-full object-contain"/>
  </span>
}

export function WhiteGoldBrandMark({ size = 120, className = '', decorative = false }: { size?: number; className?: string; decorative?: boolean }) {
  return <CrestArtwork size={size} tone="light" decorative={decorative} className={`pmv-white-gold-mark ${className}`}/>
}

export function Logo({ className = '', showText = true, markSize = 54, tone = 'auto', compact = false }: { className?: string; showText?: boolean; markSize?: number; tone?:CrestTone; compact?: boolean }) {
  // Compact mode places the ORIGINAL navy+gold crest inside a small cream
  // tile so the detailed artwork reads properly against a dark sidebar.
  // We keep the client's actual crest - only the surface behind it
  // changes color, which is what the crest was designed to sit on.
  if (compact) return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="grid place-items-center rounded-xl border border-white/[.08] bg-gradient-to-b from-[#f5efe0] to-[#eae1c8] p-1.5 shadow-[0_2px_10px_rgba(0,0,0,.35)] ring-1 ring-black/[.04]" style={{ width: 48, height: 48 }}>
        <img src={CREST_DARK_ART} alt="" aria-hidden="true" className="h-full w-full object-contain"/>
      </span>
      <div className="leading-tight">
        <div className="font-display text-[15px] font-extrabold tracking-[.04em] text-white">PINNACLE</div>
        <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.24em] text-gold-400">Management Ventures</div>
      </div>
    </div>
  )
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <CrestArtwork size={markSize} tone={tone} decorative />
      {showText && <div className="leading-tight"><div className="font-display text-[15px] font-extrabold tracking-[.04em] text-white">PINNACLE</div><div className="mt-1 text-[9px] font-bold uppercase tracking-[0.24em] text-gold-400">Management Ventures</div></div>}
    </div>
  )
}

export function Crest({ size = 96, className = '', tone = 'auto' }: { size?: number; className?: string; tone?:CrestTone }) {
  return <CrestArtwork size={size} tone={tone} className={`${crestClass} ${className}`}/>
}

export function BrandMark3D({ size = 120, className = '', decorative = false, variant = 'standard' }: { size?: number; className?: string; decorative?: boolean; variant?: BrandMarkVariant }) {
  const depth = Array.from({ length: variant === 'quiet' ? 3 : 6 })
  return (
    <div className={`pmv-brand-object pmv-brand-object-${variant} relative ${className}`} style={{ width: size, height: size }} aria-hidden={decorative || undefined}>
      {variant === 'spotlight' && <div className="pmv-brand-aura absolute inset-[-16%]" aria-hidden="true" />}
      <div className="pmv-brand-gyro relative h-full w-full">
        <div className="pmv-brand-depth relative h-full w-full">
          {depth.map((_, i) => (
            <img key={i} src={CREST_LIGHT_ART} alt="" aria-hidden="true" className="pmv-brand-depth-layer absolute inset-0 h-full w-full object-contain" style={{ transform: `translate3d(${depth.length - i}px, ${Math.max(1, depth.length - i - 1)}px, ${-10 + i * 2}px)`, opacity: Math.max(.035, .11 - i * .012) }} />
          ))}
          <div className="pmv-brand-face absolute inset-0 h-full w-full drop-shadow-[0_18px_24px_rgba(0,0,0,.28)]"><CrestArtwork size={size} tone="auto" decorative={decorative} className={crestClass}/></div>
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
