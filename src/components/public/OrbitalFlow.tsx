import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion, useScroll, useSpring, useTransform, AnimatePresence } from 'motion/react'
import { pmvMotion } from '../../lib/motionTheme'

// A living coordination system that replaces the old horizontal stage rail.
// Pinnacle sits at the center of a small network; work travels outward to each
// stage in sequence (Request -> Coordinate -> Execute -> Verify -> Complete)
// and the active stage cycles on its own. The ring never spins as a wheel:
// the center breathes, nodes sway a few pixels, and a single signal travels
// along the active connector while the active node lifts and the copy changes.
// Scroll adds a gentle tilt/parallax. Everything stills for reduced motion.

export interface OrbitalStage { key: string; title: string; detail: string; label?: string }

const VIEW = 440
const C = VIEW / 2
const R = 150 // node ring radius

// Sample a quadratic bezier P0->(P1)->P2 into N points for a marker to travel.
function bezierPoints(p0: [number, number], p1: [number, number], p2: [number, number], n = 24) {
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    xs.push(u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0])
    ys.push(u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1])
  }
  return { xs, ys }
}

export function OrbitalFlow({ eyebrow, heading, intro, stages }: { eyebrow: string; heading: string; intro?: string; stages: OrbitalStage[] }) {
  const reduce = useReducedMotion()
  const sectionRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [onscreen, setOnscreen] = useState(false)
  const n = stages.length

  // Geometry: place stages evenly around the ring, starting at the top and
  // moving clockwise so the traveling signal reads as forward progress.
  const geo = useMemo(() => {
    return stages.map((s, i) => {
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2
      const x = C + R * Math.cos(ang)
      const y = C + R * Math.sin(ang)
      // Control point bowed slightly off the straight center->node line.
      const mx = (C + x) / 2 + (y - C) * 0.12
      const my = (C + y) / 2 - (x - C) * 0.12
      const d = `M ${C} ${C} Q ${mx} ${my} ${x} ${y}`
      const path = bezierPoints([C, C], [mx, my], [x, y])
      // Label anchor: push outward from the node, away from center.
      const lx = C + (R + 30) * Math.cos(ang)
      const ly = C + (R + 30) * Math.sin(ang)
      const anchor = Math.abs(Math.cos(ang)) < 0.35 ? 'middle' : Math.cos(ang) > 0 ? 'start' : 'end'
      return { ...s, i, x, y, d, path, lx, ly, anchor }
    })
  }, [stages, n])

  // Pause the cycle when offscreen (perf + no wasted work).
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setOnscreen(e.isIntersecting), { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Time-based stage advance. Not per-frame; one tick every ~2.4s.
  useEffect(() => {
    if (reduce || !onscreen) return
    const id = window.setInterval(() => setActive((a) => (a + 1) % n), 2400)
    return () => window.clearInterval(id)
  }, [reduce, onscreen, n])

  // Scroll-linked gentle tilt of the whole node group (a few degrees), spring
  // smoothed so it never maps 1:1 to raw scroll. Story motion, kept subtle.
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] })
  const tiltRaw = useTransform(scrollYProgress, [0, 1], [-7, 7])
  const tilt = useSpring(tiltRaw, { stiffness: 40, damping: 20, mass: 0.6 })
  const driftRaw = useTransform(scrollYProgress, [0, 1], [10, -10])
  const drift = useSpring(driftRaw, { stiffness: 40, damping: 20 })

  const activeStage = geo[active]

  return (
    <section ref={sectionRef} className="border-y border-white/[.07] bg-navy-900/30 py-16 sm:py-24">
      <div className="container-pmv grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        {/* Left: the story in words. Meaning stays clear with motion disabled. */}
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-[-.035em] text-white sm:text-4xl">{heading}</h2>
          {intro && <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">{intro}</p>}

          <div className="mt-7 min-h-[4.5rem]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeStage.key}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -8 }}
                transition={pmvMotion.gentle}
              >
                <div className="flex items-center gap-2.5">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-gold/15 font-display text-[11px] font-bold text-gold">{active + 1}</span>
                  <h3 className="font-display text-lg font-semibold text-white">{activeStage.title}</h3>
                </div>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">{activeStage.detail}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Compact stepper: a second, static read of the same sequence. */}
          <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1.5">
            {stages.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setActive(i)}
                className={`text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${i === active ? 'text-gold' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>

        {/* Right: the network. */}
        <div className="relative mx-auto w-full max-w-[440px]">
          <motion.svg viewBox={`-64 -8 ${VIEW + 128} ${VIEW + 16}`} className="w-full" style={reduce ? undefined : { rotate: tilt }} role="img" aria-label="Pinnacle coordinates each request from intake to completion.">
            <defs>
              <radialGradient id="pmv-core" cx="50%" cy="45%" r="60%">
                <stop offset="0%" stopColor="#12325c" />
                <stop offset="100%" stopColor="#0a1f3a" />
              </radialGradient>
            </defs>

            {/* Faint network ring behind the nodes. */}
            <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />

            {/* Connectors from center to each node. Active one strengthens. */}
            {geo.map((g) => (
              <motion.path
                key={`c-${g.key}`}
                d={g.d}
                fill="none"
                stroke={g.i === active ? 'rgba(197,160,80,0.85)' : 'rgba(255,255,255,0.10)'}
                strokeWidth={g.i === active ? 1.6 : 1}
                strokeLinecap="round"
                animate={reduce ? undefined : { opacity: g.i === active ? 1 : 0.7 }}
                transition={pmvMotion.gentle}
              />
            ))}

            {/* One signal travels center -> active node, restarting each cycle. */}
            {!reduce && onscreen && (
              <motion.circle
                key={`sig-${active}`}
                r={3.5}
                fill="#d8b566"
                initial={{ cx: C, cy: C, opacity: 0 }}
                animate={{ cx: activeStage.path.xs, cy: activeStage.path.ys, opacity: [0, 1, 1, 0.9] }}
                transition={{ duration: 1.7, ease: 'easeInOut' }}
              />
            )}

            {/* Stage nodes. */}
            {geo.map((g) => {
              const isActive = g.i === active
              return (
                <g key={`n-${g.key}`}>
                  <motion.circle
                    cx={g.x}
                    cy={g.y}
                    r={isActive ? 11 : 7}
                    fill={isActive ? '#c5a050' : '#0a1f3a'}
                    stroke={isActive ? '#e6c88a' : 'rgba(255,255,255,0.22)'}
                    strokeWidth={1.5}
                    animate={reduce ? undefined : { x: [0, g.i % 2 ? 2.5 : -2.5, 0], y: [0, g.i % 3 ? -2.5 : 2.5, 0] }}
                    transition={reduce ? undefined : { duration: 6 + g.i, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  {isActive && !reduce && (
                    <motion.circle
                      cx={g.x} cy={g.y} r={11} fill="none" stroke="#e6c88a"
                      initial={{ scale: 1, opacity: 0.6 }}
                      animate={{ scale: 2.1, opacity: 0 }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                      style={{ transformOrigin: `${g.x}px ${g.y}px` }}
                    />
                  )}
                  <text
                    x={g.lx} y={g.ly}
                    textAnchor={g.anchor as 'start' | 'middle' | 'end'}
                    dominantBaseline="middle"
                    className="font-display"
                    fontSize={11}
                    fontWeight={700}
                    letterSpacing={1.2}
                    fill={isActive ? '#e6c88a' : 'rgba(203,213,225,0.65)'}
                  >
                    {g.title.toUpperCase()}
                  </text>
                </g>
              )
            })}

            {/* Center: Pinnacle, breathing. */}
            <motion.g
              animate={reduce ? undefined : { scale: [1, 1.03, 1] }}
              transition={reduce ? undefined : { duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{ transformOrigin: `${C}px ${C}px` }}
            >
              <circle cx={C} cy={C} r={40} fill="url(#pmv-core)" stroke="rgba(197,160,80,0.5)" strokeWidth={1.5} />
              <circle cx={C} cy={C} r={47} fill="none" stroke="rgba(197,160,80,0.18)" strokeWidth={1} />
              <text x={C} y={C - 3} textAnchor="middle" dominantBaseline="middle" className="font-display" fontSize={15} fontWeight={800} fill="#ffffff">PINNACLE</text>
              <text x={C} y={C + 12} textAnchor="middle" dominantBaseline="middle" fontSize={7.5} fontWeight={700} letterSpacing={1.5} fill="#c5a050">COORDINATING</text>
            </motion.g>
          </motion.svg>

          {/* Very subtle ambient glow that drifts with scroll (motion only). */}
          {!reduce && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 mx-auto max-w-[360px] rounded-full opacity-40 blur-3xl"
              style={{ y: drift, background: 'radial-gradient(closest-side, rgba(197,160,80,0.10), transparent)' }}
            />
          )}
        </div>
      </div>
    </section>
  )
}
