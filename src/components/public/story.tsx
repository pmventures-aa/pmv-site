import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { pmvMotion } from '../../lib/motionTheme'
import { storyImages, type StoryImageKey } from '../../data/storyImages'
import { SceneArt } from './SceneArt'

// PMV editorial story system. These components extend the existing public
// motion helpers (Reveal / StaggerGroup / pmvMotion tokens) with the richer,
// image-driven storytelling patterns: reveals, parallax, process journeys,
// sticky split stories, horizontal rails, proof tickers, and example scenarios.
//
// Shared rules across every component here:
//   - one motion language: pmvMotion tokens for easing/duration
//   - reduced-motion: no transforms, no auto-movement, content stays readable
//   - mobile: no pinned/hijacked scroll; horizontal turns into native swipe
//   - transform/opacity only; no animating layout properties

// Small SSR-safe media query hook so desktop-only interactions can degrade.
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

// ---------------------------------------------------------------------------
// StoryImage - the single way photography enters the public site. Renders a
// real <img> when the slot has a src, otherwise a brand-toned gradient scene.
// Reveals with a restrained scale + fade as it enters the viewport.
// ---------------------------------------------------------------------------
export function StoryImage({
  slot,
  className = '',
  aspect = 'aspect-[4/3]',
  reveal = true,
  rounded = 'rounded-xl',
  overlay,
  children,
}: {
  slot: StoryImageKey
  className?: string
  aspect?: string
  reveal?: boolean
  rounded?: string
  overlay?: ReactNode
  children?: ReactNode
}) {
  const reduce = useReducedMotion()
  const image = storyImages[slot]
  const animate = reveal && !reduce
  return (
    <motion.figure
      className={`relative overflow-hidden border border-white/10 bg-navy-900/50 ${rounded} ${aspect} ${className}`}
      initial={animate ? { opacity: 0 } : false}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: '-64px' }}
      transition={reduce ? { duration: 0 } : pmvMotion.premium}
    >
      {image.src ? (
        <motion.img
          src={image.src}
          alt={image.alt}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          initial={animate ? { scale: 1.05 } : false}
          whileInView={{ scale: 1 }}
          viewport={{ once: true, margin: '-64px' }}
          transition={reduce ? { duration: 0 } : { ...pmvMotion.premium, duration: 0.9 }}
          style={{ willChange: 'transform' }}
        />
      ) : (
        <div className="absolute inset-0" aria-label={image.alt} role="img">
          <SceneArt slot={slot} />
          <span className="absolute bottom-3 left-3 rounded-full border border-white/10 bg-navy-950/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55 backdrop-blur-sm">{image.hint}</span>
        </div>
      )}
      {overlay}
      {children}
    </motion.figure>
  )
}

// A small factual label chip laid over media (e.g. GEO VERIFIED · TIME STAMPED).
export function MediaLabel({ items, className = '' }: { items: string[]; className?: string }) {
  return (
    <div className={`absolute bottom-3 right-3 flex flex-col items-end gap-1 ${className}`}>
      {items.map((item) => (
        <span key={item} className="rounded-sm border border-white/15 bg-navy-950/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gold/90 backdrop-blur-sm">{item}</span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ParallaxMedia - restrained depth. Translates its child a few percent against
// scroll. Off entirely for reduced-motion and on mobile (where it costs more
// than it gives).
// ---------------------------------------------------------------------------
export function ParallaxMedia({ children, className = '', strength = 40 }: { children: ReactNode; className?: string; strength?: number }) {
  const reduce = useReducedMotion()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [strength, -strength])
  const active = !reduce && isDesktop
  return (
    <div ref={ref} className={`relative ${className}`}>
      <motion.div style={active ? { y, willChange: 'transform' } : undefined}>{children}</motion.div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ProcessJourney - the reusable Pinnacle lifecycle language, shown rather than
// described. Connected numbered chapters; horizontal on desktop, vertical on
// mobile. Reveals in sequence.
// ---------------------------------------------------------------------------
export interface JourneyStep { n: string; label: string; detail: string }

export function ProcessJourney({ steps, className = '', cols = 6 }: { steps: JourneyStep[]; className?: string; cols?: 3 | 4 | 5 | 6 }) {
  const reduce = useReducedMotion()
  // Static class map so Tailwind can see the utilities; controls the desktop
  // column count to match the number of steps.
  const lgCols = cols === 3 ? 'lg:grid-cols-3' : cols === 4 ? 'lg:grid-cols-4' : cols === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-6'
  return (
    <ol className={`relative grid gap-6 md:grid-cols-3 ${lgCols} ${className}`}>
      <span className="pointer-events-none absolute left-0 right-0 top-4 hidden h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent lg:block" aria-hidden="true" />
      {steps.map((step, i) => (
        <motion.li
          key={step.n}
          className="relative"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-48px' }}
          transition={reduce ? { duration: 0 } : { ...pmvMotion.gentle, delay: i * 0.06 }}
        >
          <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-gold/40 bg-navy-950 font-display text-xs font-bold text-gold">{step.n}</span>
          <h3 className="mt-4 font-display text-sm font-bold uppercase tracking-[0.08em] text-white">{step.label}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{step.detail}</p>
        </motion.li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// ProofRail - a slow, restrained ticker of deliverables/evidence. Pauses on
// hover; fully still for reduced-motion (Tailwind motion-reduce variant, no JS
// timer). Not an aggressive marquee.
// ---------------------------------------------------------------------------
export function ProofRail({ items, className = '' }: { items: string[]; className?: string }) {
  const doubled = [...items, ...items]
  return (
    <div className={`relative overflow-hidden border-y border-white/10 py-4 ${className}`} role="list" aria-label="What you receive">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-navy-950 to-transparent" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-navy-950 to-transparent" aria-hidden="true" />
      <div className="pmv-proof-rail flex w-max gap-8 whitespace-nowrap">
        {doubled.map((item, i) => (
          <span key={`${item}-${i}`} role="listitem" className="flex items-center gap-3 text-sm font-medium text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-gold/70" aria-hidden="true" />
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ProjectScenario - an example workflow, clearly labeled so it is never mistaken
// for a real client case study. Numbered mini-journey with an optional scene.
// ---------------------------------------------------------------------------
export function ProjectScenario({
  label = 'Example workflow',
  title,
  slot,
  steps,
  className = '',
}: {
  label?: string
  title: string
  slot?: StoryImageKey
  steps: string[]
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <motion.article
      className={`flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[.02] ${className}`}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-48px' }}
      transition={reduce ? { duration: 0 } : pmvMotion.gentle}
    >
      {slot && <StoryImage slot={slot} aspect="aspect-[16/9]" rounded="rounded-none" reveal={false} />}
      <div className="flex flex-1 flex-col p-6">
        <span className="inline-flex w-fit rounded-full border border-gold/30 bg-gold/[.06] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gold">{label}</span>
        <h3 className="mt-3 font-display text-xl font-bold text-white">{title}</h3>
        <ol className="mt-4 space-y-2.5">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-3 text-sm leading-6 text-slate-300">
              <span className="mt-0.5 font-display text-xs font-bold text-gold/60">0{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </motion.article>
  )
}

// ---------------------------------------------------------------------------
// StickyStorySection - a sticky headline on the left while image+text panels
// advance on the right. The active panel is driven by which one is in view, so
// there is no scroll hijacking. Mobile stacks naturally.
// ---------------------------------------------------------------------------
export interface StoryPanel { n: string; title: string; detail: string; slot: StoryImageKey; labels?: string[] }

export function StickyStorySection({ eyebrow, heading, intro, panels }: { eyebrow: string; heading: string; intro?: string; panels: StoryPanel[] }) {
  const [active, setActive] = useState(0)
  return (
    <div className="container-pmv grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-16">
      <div className="lg:sticky lg:top-24 lg:h-fit lg:self-start">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-[-.035em] text-white sm:text-4xl">{heading}</h2>
        {intro && <p className="mt-5 max-w-md text-base leading-8 text-slate-400">{intro}</p>}
        <div className="mt-7 hidden gap-2 lg:flex" aria-hidden="true">
          {panels.map((panel, i) => (
            <span key={panel.n} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i === active ? 'bg-gold' : 'bg-white/12'}`} />
          ))}
        </div>
      </div>
      <div className="space-y-16 lg:space-y-28">
        {panels.map((panel, i) => (
          <StoryPanelBlock key={panel.n} panel={panel} onActive={() => setActive(i)} />
        ))}
      </div>
    </div>
  )
}

function StoryPanelBlock({ panel, onActive }: { panel: StoryPanel; onActive: () => void }) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const io = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) onActive() }, { rootMargin: '-45% 0px -45% 0px' })
    io.observe(node)
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <motion.div
      ref={ref}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={reduce ? { duration: 0 } : pmvMotion.premium}
    >
      <div className="flex items-center gap-3">
        <span className="font-display text-sm font-bold text-gold">{panel.n}</span>
        <h3 className="font-display text-xl font-semibold text-white">{panel.title}</h3>
      </div>
      <p className="mt-3 max-w-xl text-sm leading-7 text-slate-400">{panel.detail}</p>
      <StoryImage slot={panel.slot} className="mt-5" aspect="aspect-[16/10]" overlay={panel.labels ? <MediaLabel items={panel.labels} /> : undefined} />
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// HorizontalStoryRail - a bounded storytelling section where vertical scroll
// advances a horizontal sequence (desktop), a native swipe carousel (mobile),
// or a plain vertical stack (reduced-motion). Never traps the page scroll: the
// horizontal movement is purely scroll-linked within the section's own height.
// ---------------------------------------------------------------------------
export interface RailPanel { n: string; title: string; detail: string; slot: StoryImageKey; labels?: string[] }

export function HorizontalStoryRail({ eyebrow, heading, panels }: { eyebrow: string; heading: string; panels: RailPanel[] }) {
  const reduce = useReducedMotion()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const pinned = isDesktop && !reduce

  if (!pinned) {
    // Mobile / reduced-motion: native horizontal swipe with scroll-snap (or a
    // simple readable list under reduced-motion). No pinning, no hijack.
    return (
      <section className="py-16 sm:py-20">
        <div className="container-pmv">
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-4 max-w-2xl font-display text-3xl font-bold leading-tight tracking-[-.035em] text-white sm:text-4xl">{heading}</h2>
        </div>
        <div className={`mt-8 ${reduce ? 'container-pmv grid gap-4' : 'flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 [scrollbar-width:none]'}`}>
          {panels.map((panel) => (
            <div key={panel.n} className={reduce ? '' : 'w-[82vw] shrink-0 snap-center'}>
              <RailCard panel={panel} />
            </div>
          ))}
        </div>
      </section>
    )
  }

  return <PinnedRail eyebrow={eyebrow} heading={heading} panels={panels} />
}

function PinnedRail({ eyebrow, heading, panels }: { eyebrow: string; heading: string; panels: RailPanel[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  // Slide the track so the last panel finishes just inside the viewport. Panels
  // are 78vw so the next one always peeks, signalling more content.
  const travel = Math.max(0, panels.length * 78 - 92)
  const x = useTransform(scrollYProgress, [0, 1], ['0vw', `-${travel}vw`])
  return (
    <section ref={ref} style={{ height: `${panels.length * 85}vh` }} className="relative">
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
        <div className="container-pmv">
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold leading-tight tracking-[-.035em] text-white sm:text-4xl">{heading}</h2>
        </div>
        <motion.div style={{ x, willChange: 'transform' }} className="mt-8 flex gap-5 pl-[max(1.25rem,calc((100vw-80rem)/2+1.25rem))]">
          {panels.map((panel) => (
            <div key={panel.n} className="w-[78vw] shrink-0 lg:w-[46vw] xl:w-[38vw]">
              <RailCard panel={panel} />
            </div>
          ))}
        </motion.div>
        <ScrollHint />
      </div>
    </section>
  )
}

function RailCard({ panel }: { panel: RailPanel }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[.02]">
      <StoryImage slot={panel.slot} aspect="aspect-[16/10]" rounded="rounded-none" reveal={false} overlay={panel.labels ? <MediaLabel items={panel.labels} /> : undefined} />
      <div className="flex flex-1 flex-col p-6">
        <span className="font-display text-xs font-bold text-gold/60">{panel.n}</span>
        <h3 className="mt-2 font-display text-xl font-bold text-white">{panel.title}</h3>
        <p className="mt-3 text-sm leading-7 text-slate-400">{panel.detail}</p>
      </div>
    </article>
  )
}

// ---------------------------------------------------------------------------
// NetworkStory - the "one network" idea made visual: scattered local nodes
// connected to a central coordination point. Restrained and abstract (not a
// package tracker); the gentle node pulse is disabled for reduced-motion.
// ---------------------------------------------------------------------------
const NETWORK_NODES = [
  { x: 120, y: 90 }, { x: 250, y: 160 }, { x: 180, y: 250 }, { x: 360, y: 70 },
  { x: 560, y: 110 }, { x: 660, y: 220 }, { x: 480, y: 260 }, { x: 720, y: 130 },
]
const HUB = { x: 400, y: 180 }

export function NetworkStory({ eyebrow = 'One network', heading, body, points }: { eyebrow?: string; heading: string; body: string; points: string[] }) {
  const reduce = useReducedMotion()
  return (
    <div className="container-pmv grid gap-10 lg:grid-cols-[.82fr_1.18fr] lg:items-center lg:gap-14">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-[-.035em] text-white sm:text-4xl">{heading}</h2>
        <p className="mt-5 max-w-md text-base leading-8 text-slate-400">{body}</p>
        <ul className="mt-6 space-y-2 text-sm text-slate-300">
          {points.map((point) => <li key={point} className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />{point}</li>)}
        </ul>
      </div>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-navy-900/40 p-4">
        <svg viewBox="0 0 800 360" className="h-auto w-full" role="img" aria-label="Local professionals across the country connected to one central coordination point">
          {NETWORK_NODES.map((node, i) => (
            <line key={`l-${i}`} x1={HUB.x} y1={HUB.y} x2={node.x} y2={node.y} stroke="rgba(201,162,39,0.28)" strokeWidth={1} />
          ))}
          {NETWORK_NODES.map((node, i) => (
            <motion.circle
              key={`n-${i}`} cx={node.x} cy={node.y} r={5} fill="rgba(226,232,240,0.85)"
              initial={reduce ? false : { opacity: 0.45 }}
              animate={reduce ? undefined : { opacity: [0.45, 1, 0.45] }}
              transition={reduce ? undefined : { duration: 3.2, repeat: Infinity, delay: i * 0.35, ease: 'easeInOut' }}
            />
          ))}
          <circle cx={HUB.x} cy={HUB.y} r={16} fill="none" stroke="rgba(201,162,39,0.5)" strokeWidth={1.5} />
          <circle cx={HUB.x} cy={HUB.y} r={8} fill="#c9a227" />
        </svg>
        <div className="mt-3 flex flex-wrap justify-between gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          <span>Local execution</span><span className="text-gold/80">Central coordination</span><span>Nationwide reach</span>
        </div>
      </div>
    </div>
  )
}

function ScrollHint() {
  return (
    <div className="container-pmv mt-6 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500" aria-hidden="true">
      <span>Scroll</span>
      <span className="h-px w-10 bg-gradient-to-r from-gold/50 to-transparent" />
    </div>
  )
}
