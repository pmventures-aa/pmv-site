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

type BrandMarkVariant = 'standard' | 'spotlight' | 'quiet'
type CrestTone = 'auto' | 'light' | 'dark'
// Two real photographs of the same crest:
//   light surfaces -> original navy artwork
//   dark surfaces  -> gold metal + blue mountain mark (same drawing, recoded)
// `tone="light"` means the mark sits on a dark surface (header, auth, hero).
const CREST_ON_LIGHT = '/logo-crest-transparent.png'
const CREST_ON_DARK = '/logo-crest-on-dark.png'

function CrestImg({ src, size, alt, className = '' }: { src: string; size: number; alt: string; className?: string }) {
  return <img src={src} alt={alt} className={`block h-full w-full object-contain ${className}`} style={{ width: size, height: size }} />
}

function CrestArtwork({ size, tone = 'auto', className = '', decorative = false }: { size: number; tone?: CrestTone; className?: string; decorative?: boolean }) {
  const alt = decorative ? '' : 'Pinnacle Management Ventures crest'
  if (tone === 'dark') return <CrestImg src={CREST_ON_LIGHT} size={size} alt={alt} className={className} />
  if (tone === 'light') return <CrestImg src={CREST_ON_DARK} size={size} alt={alt} className={`pmv-crest-on-dark ${className}`} />
  return (
    <span
      className={`pmv-crest-switch relative inline-block shrink-0 ${className}`}
      style={{ width: size, height: size }}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : alt}
      aria-hidden={decorative || undefined}
    >
      <img src={CREST_ON_DARK} alt="" aria-hidden="true" className="pmv-crest-for-dark absolute inset-0 h-full w-full object-contain" />
      <img src={CREST_ON_LIGHT} alt="" aria-hidden="true" className="pmv-crest-for-light absolute inset-0 h-full w-full object-contain" />
    </span>
  )
}

export function WhiteGoldBrandMark({ size = 120, className = '', decorative = false }: { size?: number; className?: string; decorative?: boolean }) {
  return <CrestArtwork size={size} tone="light" decorative={decorative} className={className} />
}

function Wordmark() {
  return (
    <div className="leading-tight">
      <div className="font-display text-[15px] font-semibold tracking-[.03em] text-white">PINNACLE</div>
      <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-gold-400">Management Ventures</div>
    </div>
  )
}

export function Logo({ className = '', showText = true, markSize = 54, tone = 'auto', compact = false }: { className?: string; showText?: boolean; markSize?: number; tone?: CrestTone; compact?: boolean }) {
  const size = compact ? 46 : markSize
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="pmv-logo-mark relative inline-block shrink-0" style={{ width: size, height: size }}>
        <span className="pmv-logo-mark-aura pointer-events-none absolute inset-[-14%] rounded-full" aria-hidden="true" />
        <CrestArtwork size={size} tone={compact ? 'auto' : tone} decorative />
      </span>
      {showText && <Wordmark />}
    </div>
  )
}

export function Crest({ size = 96, className = '', tone = 'auto', decorative = false }: { size?: number; className?: string; tone?: CrestTone; decorative?: boolean }) {
  return (
    <span className={`inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      <CrestArtwork size={size} tone={tone} decorative={decorative} />
    </span>
  )
}

export function BrandMark3D({ size = 120, className = '', decorative = false, variant = 'standard' }: { size?: number; className?: string; decorative?: boolean; variant?: BrandMarkVariant }) {
  return (
    <div className={`pmv-brand-object pmv-brand-object-${variant} relative ${className}`} style={{ width: size, height: size }} aria-hidden={decorative || undefined}>
      {variant !== 'quiet' && <div className="pmv-brand-aura absolute inset-[-18%]" aria-hidden="true" />}
      <div className="pmv-brand-face relative h-full w-full">
        <CrestArtwork size={size} tone="auto" decorative={decorative} />
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
