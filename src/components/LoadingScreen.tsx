import { Crest } from './ui'

// The animated mark itself — a slow gold light sweeping around a ring
// behind the crest, two soft outward "sonar" pulses, and a gentle
// breathing scale on the crest (see the .loading-* keyframes in
// index.css). Deliberately plain CSS keyframes, not framer-motion — this
// mounts in the portal/admin bundles too, which stay motion-library-free
// on purpose (see src/components/public/motion.tsx).
export function LoadingGlyph({ size = 68 }: { size?: number }) {
  const boxSize = Math.round(size * 1.4)
  return (
    <div className="relative grid place-items-center" style={{ width: boxSize, height: boxSize }}>
      <div className="loading-sweep absolute inset-0 rounded-full" aria-hidden="true" />
      <div className="loading-pulse absolute inset-2 rounded-full" aria-hidden="true" />
      <div className="loading-pulse loading-pulse-delay absolute inset-2 rounded-full" aria-hidden="true" />
      <Crest size={size} className="loading-breathe relative" />
    </div>
  )
}

// Full-viewport loading state — before any app chrome has mounted yet
// (initial session check, a lazy-loaded app chunk still downloading, the
// onboarding gate). Owns the whole screen, radial-gradient background.
export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-navy-radial">
      <div className="flex flex-col items-center gap-5">
        <LoadingGlyph />
        <p className="text-sm text-slate-400">{label}</p>
      </div>
    </div>
  )
}

// Same glyph, sized down, no full-viewport radial background — for a full
// page's data still loading *inside* an already-rendered layout (e.g. the
// staff console's sidebar/header are already on screen). Using the
// full-viewport radial-gradient LoadingScreen here would clash with the
// flat, no-gradient background the admin console deliberately uses.
export function InlineLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="flex flex-col items-center gap-4">
        <LoadingGlyph size={52} />
        <p className="text-sm text-slate-400">{label}</p>
      </div>
    </div>
  )
}
