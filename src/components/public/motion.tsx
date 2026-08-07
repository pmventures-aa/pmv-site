import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ServiceInfo } from '../../data/services'

// Motion helpers for the public marketing site only — deliberately not used
// in the portal/admin apps, which favor instant, no-frills interactions.

// Fades + slides a section up as it scrolls into view. Plays once.
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
}

// Container whose children (each carrying `variants={staggerItem}`) animate
// in one after another as the group scrolls into view.
export function StaggerGroup({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} variants={staggerContainer}>
      {children}
    </motion.div>
  )
}

// Same as StaggerGroup but plays immediately on mount instead of on scroll —
// for above-the-fold content like the hero, where whileInView would fire
// before the user ever sees the "before" state.
export function StaggerOnMount({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial="hidden" animate="show" variants={staggerContainer}>
      {children}
    </motion.div>
  )
}

// Three soft, blurred gradient shapes that drift slowly and continuously —
// ambient background motion for the hero so there's always something moving
// on screen, not just a one-shot entrance animation. Purely decorative:
// pointer-events-none, sits behind content via z-index in the caller.
export function AmbientGlow({ className = '' }: { className?: string }) {
  const reduceMotion = useReducedMotion()
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <motion.div
        className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-gold/25 blur-3xl"
        animate={reduceMotion ? undefined : { x: [0, 50, 0], y: [0, 36, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-16 top-1/3 h-96 w-96 rounded-full bg-blue-500/12 blur-3xl"
        animate={reduceMotion ? undefined : { x: [0, -40, 0], y: [0, -50, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-gold/10 blur-3xl"
        animate={reduceMotion ? undefined : { x: [0, 30, -20, 0], y: [0, -24, 10, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

// Auto-cycling showcase of a service catalog — a second, distinct kind of
// motion from the marquee (content crossfades and changes, not a scrolling
// loop), and turns the hero's "what we help with" panel from a static list
// into something that keeps revealing real content instead of sitting
// still. Advances every ~4.5s, pauses on hover/focus, and stays on the
// first item (still fully interactive via the dots) when the visitor
// prefers reduced motion.
export function ServiceRotator({ items }: { items: ServiceInfo[] }) {
  const reduceMotion = useReducedMotion()
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (reduceMotion || paused || items.length < 2) return
    const t = setInterval(() => setActive((i) => (i + 1) % items.length), 4500)
    return () => clearInterval(t)
  }, [reduceMotion, paused, items.length])

  const current = items[active]

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="rounded-md border border-white/10 bg-white/[0.03] p-7"
    >
      <div className="flex items-center justify-between">
        <p className="eyebrow">What we help with</p>
        {current.popular && <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">Popular</span>}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={current.slug}
          initial={reduceMotion ? undefined : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="mt-4 min-h-[6.5rem]"
        >
          <h3 className="font-display text-2xl font-medium text-white">{current.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{current.shortDescription}</p>
        </motion.div>
      </AnimatePresence>
      <div className="mt-5 flex gap-1.5" role="tablist" aria-label="Service categories">
        {items.map((s, i) => (
          <button
            key={s.slug}
            role="tab"
            aria-selected={i === active}
            aria-label={s.title}
            onClick={() => setActive(i)}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i === active ? 'bg-gold' : 'bg-white/15 hover:bg-white/25'}`}
          />
        ))}
      </div>
      <Link to={`/services/${current.slug}`} className="mt-5 inline-block text-sm font-medium text-gold hover:underline">
        Learn more about {current.title} →
      </Link>
    </div>
  )
}

// Infinite horizontal scroller (pure CSS animation, no JS ticking) — used
// for the service-category strip so there's an obvious, always-moving
// element visible the instant the page loads, no scroll/hover required.
export function Marquee({ items }: { items: string[] }) {
  const doubled = [...items, ...items]
  return (
    <div className="relative overflow-hidden border-y border-white/10 py-4">
      <div className="animate-marquee flex w-max gap-10 whitespace-nowrap">
        {doubled.map((item, i) => (
          <span key={`${item}-${i}`} className="text-sm font-medium uppercase tracking-[0.15em] text-slate-500">
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}
