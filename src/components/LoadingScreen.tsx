import { BrandMark3D } from './ui'
import { PortalOrb } from './portal/PortalOrb'

export function LoadingGlyph({ size = 68 }: { size?: number }) {
  const boxSize = Math.round(size * 1.55)
  return (
    <div className="relative grid place-items-center" style={{ width: boxSize, height: boxSize }}>
      <div className="loading-sweep absolute inset-0 rounded-full opacity-60" aria-hidden="true" />
      <div className="loading-pulse absolute inset-2 rounded-full" aria-hidden="true" />
      <div className="loading-pulse loading-pulse-delay absolute inset-2 rounded-full" aria-hidden="true" />
      <BrandMark3D size={size} decorative className="loading-breathe relative" />
    </div>
  )
}

interface ScreenProps {
  label?: string
  /** Use the ambient PortalOrb instead of the brand-mark spinner. Renders on
   *  portal/HQ authenticated surfaces where the calmer visual reads better. */
  variant?: 'brand' | 'orb'
}

export function LoadingScreen({ label = 'Loading…', variant = 'brand' }: ScreenProps) {
  return (
    <div className="grid min-h-screen place-items-center bg-navy-radial">
      <div className="flex flex-col items-center gap-5">
        {variant === 'orb' ? <PortalOrb size={170} decorative /> : <LoadingGlyph size={82} />}
        <p className="text-xs font-medium uppercase tracking-[.24em] text-slate-500">{label}</p>
      </div>
    </div>
  )
}

export function InlineLoading({ label = 'Loading…', variant = 'brand' }: ScreenProps) {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="flex flex-col items-center gap-4">
        {variant === 'orb' ? <PortalOrb size={120} decorative /> : <LoadingGlyph size={54} />}
        <p className="text-sm text-slate-400">{label}</p>
      </div>
    </div>
  )
}
