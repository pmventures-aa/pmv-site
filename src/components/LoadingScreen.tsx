import { BrandMark3D } from './ui'

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
  /** Legacy `orb` name retained for callers. It now renders the quieter crest
   *  treatment used on authenticated workspaces. */
  variant?: 'brand' | 'orb'
}

function WorkspaceLoadingGlyph({ size }: { size: number }) {
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <BrandMark3D size={Math.round(size * 0.72)} decorative variant="quiet" />
      <div className="absolute -bottom-1 h-px w-16 overflow-hidden bg-white/10" aria-hidden="true">
        <span className="pmv-loading-line block h-full w-1/2 bg-gradient-to-r from-transparent via-gold to-transparent" />
      </div>
    </div>
  )
}

export function LoadingScreen({ label = 'Loading…', variant = 'brand' }: ScreenProps) {
  return (
    <div className="grid min-h-screen place-items-center bg-navy-radial">
      <div className="flex flex-col items-center gap-5">
        {variant === 'orb' ? <WorkspaceLoadingGlyph size={148} /> : <LoadingGlyph size={82} />}
        <p className="text-xs font-medium uppercase tracking-[.24em] text-slate-500">{label}</p>
      </div>
    </div>
  )
}

export function InlineLoading({ label = 'Loading…', variant = 'brand' }: ScreenProps) {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="flex flex-col items-center gap-4">
        {variant === 'orb' ? <WorkspaceLoadingGlyph size={104} /> : <LoadingGlyph size={54} />}
        <p className="text-sm text-slate-400">{label}</p>
      </div>
    </div>
  )
}
