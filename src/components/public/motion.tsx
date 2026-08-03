import { motion, type Variants } from 'motion/react'
import type { ReactNode } from 'react'

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

// Two soft, blurred gradient shapes that drift slowly and continuously —
// ambient background motion for the hero so there's always something moving
// on screen, not just a one-shot entrance animation. Purely decorative:
// pointer-events-none, sits behind content via z-index in the caller.
export function AmbientGlow({ className = '' }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <motion.div
        className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-gold/20 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-16 top-1/3 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl"
        animate={{ x: [0, -30, 0], y: [0, -40, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
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
