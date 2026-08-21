import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Crest } from '../ui'
import { ViewTransitionLink } from './ViewTransitionLink'
import { pmvMotion } from '../../lib/motionTheme'

const CYCLE_MS = 5600

const guides = [
  { eyebrow: 'Property cleaning & turnover', title: 'Get a property clean, documented, and ready for what comes next.', to: '/projects/property-cleaning-turnover' },
  { eyebrow: 'South Florida field support', title: 'Put a dependable person on the ground when you cannot be there.', to: '/projects/local-support-south-florida' },
  { eyebrow: 'Eviction & property recovery', title: 'Keep the lawful possession handoff and turnover work connected.', to: '/projects/eviction-turnover-support' },
  { eyebrow: 'POS & payments', title: 'Change providers without losing control of the transition.', to: '/projects/switching-pos-payment-providers' },
  { eyebrow: 'Business operations', title: 'Give a complex transition one accountable operating owner.', to: '/projects/managing-business-transition' },
  { eyebrow: 'Administrative capacity', title: 'Move recurring work off the owner’s desk without adding headcount.', to: '/projects/ongoing-administrative-support' },
]

export function HeroGuideRail() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduce = useReducedMotion()

  useEffect(() => {
    if (reduce || paused) return
    const id = window.setInterval(() => setIndex((value) => (value + 1) % guides.length), CYCLE_MS)
    return () => window.clearInterval(id)
  }, [reduce, paused, index])

  const guide = guides[index]

  return (
    <div className="relative flex min-h-[440px] items-end pt-16 sm:pt-20">
      {/* Decorative watermark crest. Hidden on phones, where the single-column
          layout left it floating in dead space above the guide card and reading
          as low quality; on sm+ it sits as a subtle mark behind the rail. */}
      <div className="pointer-events-none absolute right-0 top-0 hidden opacity-40 sm:-top-10 sm:right-2 sm:block" aria-hidden="true">
        <Crest size={160} tone="light" decorative />
      </div>
      <div
        className="relative z-10 w-full overflow-hidden rounded-2xl border border-white/10 bg-navy-950/70 p-6 backdrop-blur-xl sm:p-7"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <div key={guide.to} className="absolute inset-x-0 top-0 h-[2px] overflow-hidden bg-white/[.06]">
          <div className={`pmv-guide-progress h-full bg-gold ${paused || reduce ? 'is-paused' : ''}`} />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold">Project guide {String(index + 1).padStart(2, '0')}</p>
          <div className="flex gap-1.5">
            {guides.map((item, i) => (
              <button
                key={item.to}
                type="button"
                aria-label={`Show project guide ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-7 bg-gold' : 'w-1.5 bg-white/20'}`}
              />
            ))}
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={guide.to}
            initial={reduce ? undefined : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={pmvMotion.gentle}
          >
            <p className="mt-7 text-xs font-bold uppercase tracking-[.13em] text-slate-500">{guide.eyebrow}</p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-[-.03em] text-white">{guide.title}</h2>
            <ViewTransitionLink to={guide.to} className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-gold">
              Open this guide <span>→</span>
            </ViewTransitionLink>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
