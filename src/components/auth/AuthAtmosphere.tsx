import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { pmvMotion } from '../../lib/motionTheme'
import type { AuthMoment } from '../../data/authMoments'

export function AuthAtmosphere({ surface }: { surface: 'client' | 'staff' | 'general' }) {
  const reduce = useReducedMotion()
  return (
    <div className={`auth-atmosphere auth-atmosphere-${surface}`} aria-hidden="true">
      {surface === 'staff' ? <PartnershipField reduce={!!reduce} /> : <HorizonField reduce={!!reduce} />}
    </div>
  )
}

function PartnershipField({ reduce }: { reduce: boolean }) {
  return (
    <svg className="auth-atmosphere-scene" viewBox="0 0 720 900" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="pmv-partner-gold" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f0d48a" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#c9a227" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pmv-partner-navy" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7ea0c8" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#1b3a62" stopOpacity="0" />
        </radialGradient>
        <filter id="pmv-partner-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>
      <motion.circle
        cx="292"
        cy="430"
        r="168"
        fill="url(#pmv-partner-navy)"
        filter="url(#pmv-partner-blur)"
        animate={reduce ? undefined : { cx: [286, 308, 286], cy: [424, 438, 424] }}
        transition={reduce ? undefined : { duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.circle
        cx="428"
        cy="448"
        r="156"
        fill="url(#pmv-partner-gold)"
        filter="url(#pmv-partner-blur)"
        animate={reduce ? undefined : { cx: [436, 412, 436], cy: [454, 440, 454] }}
        transition={reduce ? undefined : { duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.ellipse
        cx="360"
        cy="440"
        rx="210"
        ry="12"
        fill="#d7b94e"
        opacity="0.12"
        animate={reduce ? undefined : { opacity: [0.08, 0.2, 0.08], rx: [196, 228, 196] }}
        transition={reduce ? undefined : { duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <path d="M0 640 C 140 600, 260 680, 400 630 C 540 580, 640 660, 720 620 L 720 900 L 0 900 Z" fill="rgba(5,12,22,.55)" />
    </svg>
  )
}

function HorizonField({ reduce }: { reduce: boolean }) {
  return (
    <svg className="auth-atmosphere-scene" viewBox="0 0 720 900" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="pmv-client-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#14233c" />
          <stop offset="48%" stopColor="#8d5a3c" />
          <stop offset="72%" stopColor="#e0b07a" />
          <stop offset="100%" stopColor="#1a2438" />
        </linearGradient>
        <radialGradient id="pmv-client-sun" cx="46%" cy="58%" r="28%">
          <stop offset="0%" stopColor="#ffe2b0" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#f0b36a" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f0b36a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="720" height="900" fill="url(#pmv-client-sky)" />
      <motion.circle
        cx="330"
        cy="520"
        r="90"
        fill="url(#pmv-client-sun)"
        animate={reduce ? undefined : { cy: [528, 508, 528], opacity: [0.85, 1, 0.85] }}
        transition={reduce ? undefined : { ...pmvMotion.ambient, duration: 20, repeat: Infinity }}
      />
      <circle cx="330" cy="538" r="28" fill="#ffe7c2" opacity="0.9" />
      <path d="M0 590 C 120 560, 220 620, 360 580 C 500 540, 600 610, 720 570 L 720 900 L 0 900 Z" fill="rgba(14,22,38,.72)" />
      <path d="M0 650 C 160 620, 280 700, 430 640 C 560 590, 650 680, 720 650 L 720 900 L 0 900 Z" fill="rgba(7,12,22,.82)" />
      <motion.ellipse
        cx="360"
        cy="575"
        rx="240"
        ry="18"
        fill="#f3d7a6"
        opacity="0.16"
        animate={reduce ? undefined : { opacity: [0.1, 0.22, 0.1] }}
        transition={reduce ? undefined : { duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
    </svg>
  )
}

export function AuthRotatingCopy({ moments }: { moments: AuthMoment[] }) {
  const reduce = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const current = moments[index] ?? moments[0]

  useEffect(() => {
    if (reduce || paused || moments.length < 2) return
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % moments.length), 7800)
    return () => window.clearInterval(timer)
  }, [reduce, paused, moments.length])

  if (!current) return null

  return (
    <div className="py-10" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/[.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.14em] text-gold">
        {current.kicker}
      </div>
      <div className="relative mt-6 min-h-[13rem]" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.title}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 1 } : { opacity: 0, y: -8 }}
            transition={reduce ? { duration: 0 } : pmvMotion.premium}
          >
            <h2 className="max-w-lg font-display text-4xl font-semibold leading-[1.08] tracking-[-.025em] text-white xl:text-[2.75rem]">
              {current.title}
            </h2>
            <p className="mt-5 max-w-lg text-[15px] leading-7 text-slate-300">{current.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

export function AuthRotatingLine({ lines }: { lines: string[] }) {
  const reduce = useReducedMotion()
  const [index, setIndex] = useState(0)
  const line = lines[index] ?? lines[0]

  useEffect(() => {
    if (reduce || lines.length < 2) return
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % lines.length), 6400)
    return () => window.clearInterval(timer)
  }, [reduce, lines.length])

  if (!line) return null

  return (
    <div className="mt-3 min-h-[3.4rem]" aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.p
          key={line}
          className="max-w-md text-[15px] leading-7 text-slate-400"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 1 } : { opacity: 0, y: -6 }}
          transition={reduce ? { duration: 0 } : pmvMotion.premium}
        >
          {line}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}
