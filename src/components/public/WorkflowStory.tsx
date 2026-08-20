import { motion, useReducedMotion } from 'motion/react'
import { pmvMotion } from '../../lib/motionTheme'

// The path every Pinnacle matter travels, told as a scroll story: a gold spine
// fills as you move down the page and each stage lights as it arrives. One
// connected system, from the first request to a documented result. Reduced
// motion shows the finished spine and plain reveals.

export interface WorkflowStage {
  key: string
  title: string
  detail: string
  signal: string
}

// The canonical Pinnacle path, shared by every surface that tells this story so
// the site never describes the workflow two different ways.
export const PMV_WORKFLOW: WorkflowStage[] = [
  { key: 'request', title: 'Request', detail: 'Tell us what needs to happen, where and when, and what matters most. No account required.', signal: 'Intake logged' },
  { key: 'coordination', title: 'Coordination', detail: 'We confirm the work and assign the right Pinnacle contact or vetted local provider, fully briefed.', signal: 'Provider assigned' },
  { key: 'execution', title: 'Execution', detail: 'The work happens on the ground, handled and documented as it goes.', signal: 'On site' },
  { key: 'documentation', title: 'Documentation', detail: 'Evidence, timestamps, and status are captured and verified.', signal: 'Geo and time stamped' },
  { key: 'completion', title: 'Completion', detail: 'You receive the result, the record, and a clear next step.', signal: 'Report delivered' },
]

// Brand-accent sparkles that quietly fill the space beside the story on desktop
// and give the section some color. Each twinkles on its own rhythm; reduced
// motion shows them still. Decorative only.
const GOLD = '#E3CC7A'
const SEA = '#7FD3CB'
const CORAL = '#F4A892'
const SPARKS: { x: string; y: string; s: number; c: string; d: number }[] = [
  { x: '6%', y: '14%', s: 20, c: GOLD, d: 0 },
  { x: '40%', y: '2%', s: 12, c: SEA, d: 0.7 },
  { x: '66%', y: '20%', s: 26, c: CORAL, d: 0.35 },
  { x: '18%', y: '48%', s: 14, c: SEA, d: 1.1 },
  { x: '52%', y: '60%', s: 17, c: GOLD, d: 0.5 },
  { x: '82%', y: '50%', s: 12, c: GOLD, d: 1.4 },
  { x: '72%', y: '82%', s: 20, c: SEA, d: 0.9 },
  { x: '30%', y: '78%', s: 13, c: CORAL, d: 1.2 },
]

function SparkleField() {
  const reduce = useReducedMotion()
  return (
    <div className="pointer-events-none relative mt-12 hidden h-52 w-full max-w-sm lg:block" aria-hidden="true">
      {/* soft warm glow behind the sparkles */}
      <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(201,162,39,0.12),transparent_70%)]" />
      {SPARKS.map((sp, i) => (
        <motion.svg
          key={i}
          viewBox="0 0 24 24"
          width={sp.s}
          height={sp.s}
          className="absolute"
          style={{ left: sp.x, top: sp.y, color: sp.c }}
          initial={reduce ? { opacity: 0.6 } : { opacity: 0.25, scale: 0.85 }}
          animate={reduce ? { opacity: 0.6 } : { opacity: [0.25, 1, 0.25], scale: [0.85, 1, 0.85] }}
          transition={reduce ? undefined : { duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: sp.d }}
        >
          <path fill="currentColor" d="M12 0c.6 4.7 2.3 6.4 7 7-4.7.6-6.4 2.3-7 7-.6-4.7-2.3-6.4-7-7 4.7-.6 6.4-2.3 7-7Z" />
        </motion.svg>
      ))}
    </div>
  )
}

export function WorkflowStory({
  eyebrow,
  heading,
  intro,
  stages,
}: {
  eyebrow: string
  heading: string
  intro?: string
  stages: WorkflowStage[]
}) {
  const reduce = useReducedMotion()

  return (
    <section className="border-y border-white/[.07] bg-navy-900/20">
      <div className="container-pmv py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
        <motion.header
          initial={reduce ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={reduce ? { duration: 0 } : pmvMotion.gentle}
          className="lg:sticky lg:top-28 lg:self-start"
        >
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-[-.035em] text-white sm:text-4xl">{heading}</h2>
          {intro && <p className="mt-5 text-base leading-7 text-slate-400">{intro}</p>}
          <SparkleField />
        </motion.header>

        <ol className="relative mt-2 lg:mt-0">
          {stages.map((stage, i) => (
            <li key={stage.key} className="relative pl-12 pb-10 last:pb-0 sm:pl-16">
              {/* Connector: lives only in the gap below this marker, never through the
                  digits. It draws down from the bottom of this circle toward the next
                  one as the reader scrolls, so the path completes one stage at a time.
                  The last stage has no connector. */}
              {i < stages.length - 1 && (
                <div className="absolute left-[18px] top-9 bottom-0 w-px -translate-x-1/2 bg-white/10 sm:left-[22px] sm:top-11" aria-hidden="true">
                  <motion.div
                    className="h-full w-full origin-top bg-gradient-to-b from-gold via-gold to-gold/60"
                    initial={reduce ? false : { scaleY: 0 }}
                    whileInView={{ scaleY: 1 }}
                    viewport={{ once: true, margin: '-40% 0px -35% 0px' }}
                    transition={reduce ? { duration: 0 } : { duration: 0.5, ease: 'easeInOut' }}
                    style={reduce ? { scaleY: 1 } : undefined}
                  />
                </div>
              )}

              {/* Stage marker. Its ring completes gold as it scrolls into view. */}
              <motion.span
                className="absolute left-0 top-0 z-10 grid h-9 w-9 place-items-center rounded-full border sm:h-11 sm:w-11"
                initial={reduce ? false : { borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(148,163,184,1)', backgroundColor: 'rgb(6,15,26)', boxShadow: '0 0 0 0 rgba(201,162,39,0)' }}
                whileInView={{ borderColor: 'rgba(201,162,39,0.7)', color: '#E3CC7A', backgroundColor: 'rgb(6,15,26)', boxShadow: '0 0 0 4px rgba(201,162,39,0.10)' }}
                viewport={{ once: true, margin: '-45% 0px -45% 0px' }}
                transition={reduce ? { duration: 0 } : { duration: 0.3 }}
              >
                <span className="block font-display text-[13px] font-bold leading-none tabular-nums sm:text-sm">{String(i + 1).padStart(2, '0')}</span>
              </motion.span>

              <motion.div
                initial={reduce ? false : { opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={reduce ? { duration: 0 } : { ...pmvMotion.gentle, delay: 0.04 }}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="font-display text-lg font-semibold uppercase tracking-[.06em] text-white sm:text-xl">{stage.title}</h3>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/[.06] px-2.5 py-0.5 text-[11px] font-semibold text-gold/90">
                    <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
                    {stage.signal}
                  </span>
                </div>
                <p className="mt-2 max-w-xl text-sm leading-7 text-slate-400">{stage.detail}</p>
              </motion.div>
            </li>
          ))}
        </ol>
        </div>
      </div>
    </section>
  )
}
