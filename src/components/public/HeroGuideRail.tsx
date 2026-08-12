import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Crest } from '../ui'
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
  const next = guides[(index + 1) % guides.length]

  return (
    <div className="relative">
      <div className="mb-5 flex items-center justify-between gap-4">
        <Crest size={72} tone="light" decorative />
        <p className="max-w-[12rem] text-right text-[11px] leading-5 text-slate-500">Live project guides. Hover to hold a topic.</p>
      </div>

      <div
        className="relative overflow-hidden rounded-xl border border-white/10 bg-navy-950/80"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <div key={guide.to} className="h-[2px] overflow-hidden bg-white/[.06]">
          <div className={`pmv-guide-progress h-full bg-gold ${paused || reduce ? 'is-paused' : ''}`} />
        </div>

        <div className="p-6 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-gold">
              Project guide {String(index + 1).padStart(2, '0')} of {String(guides.length).padStart(2, '0')}
            </p>
            <div className="flex gap-1.5">
              {guides.map((item, i) => (
                <button
                  key={item.to}
                  type="button"
                  aria-label={`Show ${item.eyebrow}`}
                  onClick={() => setIndex(i)}
                  className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-gold' : 'w-1.5 bg-white/20 hover:bg-white/40'}`}
                />
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={guide.to}
              initial={reduce ? undefined : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -10 }}
              transition={pmvMotion.gentle}
            >
              <p className="mt-6 text-xs font-semibold uppercase tracking-[.12em] text-slate-500">{guide.eyebrow}</p>
              <h2 className="mt-3 font-display text-2xl font-semibold leading-tight tracking-[-.02em] text-white sm:text-3xl">{guide.title}</h2>
              <Link to={guide.to} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-gold hover:text-gold-300">
                Open this guide <span aria-hidden="true">→</span>
              </Link>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-slate-600">Up next: {next.eyebrow}</p>
    </div>
  )
}
