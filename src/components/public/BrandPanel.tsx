import { Drift } from './motion'

// A branded editorial visual from the PMV content pack. These are self-contained
// navy+gold panels (they carry their own headline and icon row), so we frame
// them rather than overlay them, and never repeat their embedded text in adjacent
// copy. Lazy by default; pass `priority` for an above-the-fold placement. The
// `illustrative` tag keeps generated brand imagery from reading as a real,
// verified project, per the content pack's usage rules.
//
// Some panels carry a thin photographic strip + divider rule along the top edge.
// Pass `aspect` (a CSS aspect-ratio, e.g. "3 / 1.72") to crop into the panel with
// `object-cover` anchored to the bottom, trimming that strip while keeping the
// infographic and its bottom line intact.
export function BrandPanel({
  src,
  alt,
  className = '',
  illustrative = true,
  priority = false,
  aspect,
}: {
  src: string
  alt: string
  className?: string
  illustrative?: boolean
  priority?: boolean
  aspect?: string
}) {
  return (
    <Drift className={className} distance={10}>
      <figure className="relative overflow-hidden rounded-2xl border border-white/10 bg-navy-950 shadow-[0_28px_70px_-30px_rgba(0,0,0,.8)] ring-1 ring-gold/10">
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          style={aspect ? { aspectRatio: aspect } : undefined}
          className={aspect ? 'block h-full w-full object-cover object-bottom' : 'block h-auto w-full'}
        />
        {illustrative && (
          <figcaption className="pointer-events-none absolute right-2 top-2 rounded-full border border-white/15 bg-navy-950/70 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-300 backdrop-blur">
            Illustrative
          </figcaption>
        )}
      </figure>
    </Drift>
  )
}
