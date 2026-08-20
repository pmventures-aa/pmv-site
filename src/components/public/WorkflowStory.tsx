import { useRef } from 'react'
import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react'
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
  const railRef = useRef<HTMLOListElement>(null)
  const { scrollYProgress } = useScroll({ target: railRef, offset: ['start 0.7', 'end 0.6'] })
  const fill = useSpring(scrollYProgress, { stiffness: 80, damping: 26, mass: 0.6 })

  return (
    <section className="border-y border-white/[.07] bg-navy-900/20">
      <div className="container-pmv py-16 sm:py-24">
        <motion.header
          initial={reduce ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={reduce ? { duration: 0 } : pmvMotion.gentle}
          className="max-w-2xl"
        >
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-[-.035em] text-white sm:text-5xl">{heading}</h2>
          {intro && <p className="mt-5 max-w-xl text-base leading-7 text-slate-400">{intro}</p>}
        </motion.header>

        <ol ref={railRef} className="relative mt-12 sm:mt-16">
          {/* Spine: a faint track with a gold fill that grows as the reader scrolls. */}
          <div className="absolute left-[15px] top-2 bottom-2 w-px bg-white/12 sm:left-[19px]" aria-hidden="true">
            <motion.div
              className="h-full w-full origin-top bg-gradient-to-b from-gold via-gold to-gold/40"
              style={reduce ? { scaleY: 1 } : { scaleY: fill }}
            />
          </div>

          {stages.map((stage, i) => (
            <li key={stage.key} className="relative pl-12 pb-10 last:pb-0 sm:pl-16">
              {/* Stage marker. Lights gold as it scrolls into view. */}
              <motion.span
                className="absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full border text-[11px] font-bold sm:h-10 sm:w-10 sm:text-xs"
                initial={reduce ? false : { borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(148,163,184,1)', backgroundColor: 'rgba(5,14,25,0.9)' }}
                whileInView={{ borderColor: 'rgba(201,162,39,0.7)', color: '#E3CC7A', backgroundColor: 'rgba(201,162,39,0.12)' }}
                viewport={{ once: true, margin: '-45% 0px -45% 0px' }}
                transition={reduce ? { duration: 0 } : { duration: 0.3 }}
              >
                {String(i + 1).padStart(2, '0')}
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
    </section>
  )
}
