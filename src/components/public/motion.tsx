import { AnimatePresence, motion, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type HTMLMotionProps, type MotionValue, type Variants } from 'motion/react'
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { ServiceInfo } from '../../data/services'
import { ViewTransitionLink } from './ViewTransitionLink'
import { pmvFadeUp, pmvMotion, pmvStagger } from '../../lib/motionTheme'

// Spring-smoothed 0..1 progress of an element passing through the viewport.
// Level-2 building block: map this to small transforms so movement follows the
// visitor with momentum instead of snapping 1:1 to raw scroll.
export function useSectionProgress(ref: React.RefObject<HTMLElement | null>): MotionValue<number> {
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  return useSpring(scrollYProgress, { stiffness: 60, damping: 22, mass: 0.5 })
}

// Slow vertical drift as the visitor passes a block. A few pixels of parallax,
// spring-smoothed, stilled for reduced motion. One dominant idea; use sparingly.
export function Drift({ children, className = '', distance = 14 }: { children: ReactNode; className?: string; distance?: number }) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const progress = useSectionProgress(ref)
  const y = useTransform(progress, [0, 1], [distance, -distance])
  return (
    <div ref={ref} className={className}>
      <motion.div style={reduce ? undefined : { y, willChange: 'transform' }}>{children}</motion.div>
    </div>
  )
}

// A heading that rises out of a clipped mask instead of a plain fade, so the
// page's most important lines get a distinct, editorial entrance. Reduced
// motion falls back to a simple opacity settle. Renders a div wrapper; pass the
// heading element as children.
export function RevealHeading({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  if (reduce) {
    return (
      <motion.div className={className} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, margin: '-64px' }} transition={{ duration: 0.4 }}>
        {children}
      </motion.div>
    )
  }
  return (
    <div className={`overflow-hidden pb-[0.12em] ${className}`}>
      <motion.div
        initial={{ y: '115%' }}
        whileInView={{ y: '0%' }}
        viewport={{ once: true, margin: '-72px' }}
        transition={{ type: 'spring', stiffness: 150, damping: 24, mass: 0.9 }}
      >
        {children}
      </motion.div>
    </div>
  )
}

// Editorial helpers for the public site. Shared product transitions live in
// lib/motionTheme so the portal and HQ can use the same timing more quietly.

export function Reveal({ children, delay = 0, className = '', distance = 10 }: { children: ReactNode; delay?: number; className?: string; distance?: number }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-64px' }}
      transition={reduceMotion ? { duration: 0 } : { ...pmvMotion.gentle, delay }}
    >
      {children}
    </motion.div>
  )
}

const staggerContainer: Variants = pmvStagger

export const staggerItem: Variants = pmvFadeUp

export function StaggerGroup({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} variants={staggerContainer}>
      {children}
    </motion.div>
  )
}

export function StaggerOnMount({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial="hidden" animate="show" variants={staggerContainer}>
      {children}
    </motion.div>
  )
}

export function AmbientGlow({ className = '' }: { className?: string }) {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '160px 0px 160px 0px' })
  const shouldMove = !reduceMotion && inView

  return (
    <div ref={ref} className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <motion.div
        className="pmv-ambient-field pmv-ambient-field-gold absolute -left-32 top-[-12%] h-[28rem] w-[28rem]"
        animate={shouldMove ? { x: [0, 18, 0], y: [0, 14, 0] } : { x: 0, y: 0 }}
        transition={shouldMove ? { ...pmvMotion.ambient, duration: 18, repeat: Infinity } : pmvMotion.snap}
      />
    </div>
  )
}

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
          initial={reduceMotion ? undefined : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
          transition={pmvMotion.gentle}
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
      <ViewTransitionLink to={`/services/${current.slug}`} className="mt-5 inline-block text-sm font-medium text-gold hover:underline">
        Learn more about {current.title} →
      </ViewTransitionLink>
    </div>
  )
}

export interface SpecialtySpotlightItem {
  eyebrow: string
  title: string
  body: string
  to: string
  linkLabel: string
  chips?: string[]
}

// Medium-emphasis rotating banner used below the hero. It keeps specialty/use
// cases visible without letting one specialty dominate the entire homepage.
export function SpecialtyRotator({ items }: { items: SpecialtySpotlightItem[] }) {
  const reduceMotion = useReducedMotion()
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (reduceMotion || paused || items.length < 2) return
    const t = setInterval(() => setActive((i) => (i + 1) % items.length), 5600)
    return () => clearInterval(t)
  }, [reduceMotion, paused, items.length])

  const current = items[active]

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="overflow-hidden border-y border-white/10 bg-navy-900/45"
    >
      <div className="container-pmv py-7 sm:py-8">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.title}
              initial={reduceMotion ? undefined : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={pmvMotion.gentle}
            >
              <p className="eyebrow">{current.eyebrow}</p>
              <h2 className="mt-2 font-display text-2xl font-medium text-white sm:text-3xl">{current.title}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">{current.body}</p>
              {current.chips && current.chips.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {current.chips.map((chip) => (
                    <span key={chip} className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-xs text-slate-400">{chip}</span>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center gap-4 lg:flex-col lg:items-end">
            <ViewTransitionLink to={current.to} className="shrink-0 text-sm font-semibold text-gold hover:underline">
              {current.linkLabel} →
            </ViewTransitionLink>
            <div className="flex gap-1.5" role="tablist" aria-label="Featured specialties">
              {items.map((item, index) => (
                <button
                  key={item.title}
                  role="tab"
                  aria-selected={index === active}
                  aria-label={item.title}
                  onClick={() => setActive(index)}
                  className={`h-2 w-7 rounded-full transition-colors ${index === active ? 'bg-gold' : 'bg-white/15 hover:bg-white/25'}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

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

export function MagneticCta({ children, className = '', onBlur, onMouseLeave, ...props }: HTMLMotionProps<'button'> & { children: ReactNode }) {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLButtonElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springX = useSpring(x, { stiffness: 280, damping: 22, mass: 0.6 })
  const springY = useSpring(y, { stiffness: 280, damping: 22, mass: 0.6 })

  function onMove(event: MouseEvent<HTMLButtonElement>) {
    if (reduceMotion || !ref.current) return
    const box = ref.current.getBoundingClientRect()
    x.set((event.clientX - (box.left + box.width / 2)) * 0.22)
    y.set((event.clientY - (box.top + box.height / 2)) * 0.22)
  }

  function reset(event: MouseEvent<HTMLButtonElement>) {
    x.set(0)
    y.set(0)
    onMouseLeave?.(event)
  }

  return (
    <motion.button
      {...props}
      ref={ref}
      className={`pmv-magnetic-cta ${className}`}
      style={reduceMotion ? undefined : { x: springX, y: springY, willChange: 'transform' }}
      onMouseMove={onMove}
      onMouseLeave={reset}
      onBlur={(event) => {
        x.set(0)
        y.set(0)
        onBlur?.(event)
      }}
    >
      {children}
    </motion.button>
  )
}
