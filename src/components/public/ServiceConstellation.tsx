import { useId, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ViewTransitionLink } from './ViewTransitionLink'
import { pmvMotion } from '../../lib/motionTheme'

// One connected network of Pinnacle capabilities, arranged around a single
// point of contact. Each service is a node linked to its page; thin lines draw
// from the hub to every node so the "one relationship, every capability" idea
// reads as a literal constellation. Reduced motion renders the finished graph
// with no drawing or pulsing.

export interface ConstellationNode {
  label: string
  to: string
  accent: string
}

// Each capability carries a brand accent (gold / sea / coral) so the network
// reads as distinct services rather than one uniform gold spoke set. Kept subtle
// - a dot on the node and a faint tint on its line - so the palette stays calm.
const GOLD = '#D9B84A'
const SEA = '#46BDB2'
const CORAL = '#F0906F'
const NODES: ConstellationNode[] = [
  { label: 'Property & Field', to: '/services/property-field', accent: SEA },
  { label: 'Business Operations', to: '/services/business-operations', accent: GOLD },
  { label: 'Documents & Notary', to: '/services/mobile-documents', accent: CORAL },
  { label: 'Cleaning & Turnovers', to: '/cleaning', accent: SEA },
  { label: 'Monthly Care Plans', to: '/care-plans', accent: GOLD },
  { label: 'Short-Term Rentals', to: '/short-term-rental-support', accent: CORAL },
]

// Node centers on a circle (percent of the square canvas), first node at top.
// Kept a touch inside the edge so the widest labels clear the canvas on mobile.
const RADIUS = 36
function pointFor(index: number, total: number): { x: number; y: number } {
  const angle = (-90 + index * (360 / total)) * (Math.PI / 180)
  return { x: 50 + RADIUS * Math.cos(angle), y: 50 + RADIUS * Math.sin(angle) }
}

export function ServiceConstellation({ nodes = NODES }: { nodes?: ConstellationNode[] }) {
  const reduce = useReducedMotion()
  const gradientId = useId()
  const [active, setActive] = useState<number | null>(null)
  const points = nodes.map((_, i) => pointFor(i, nodes.length))

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[30rem]">
      {/* Connector lines behind the nodes. */}
      {/* preserveAspectRatio="none" maps the 0-100 viewBox exactly onto the box,
          the same percentage system the HTML hub and nodes use, so line origins
          and node centers always line up regardless of the container's size. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(201,162,39,0.35)" />
            <stop offset="100%" stopColor="rgba(201,162,39,0)" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="46" fill={`url(#${gradientId})`} />
        {points.map((p, i) => (
          <motion.line
            key={i}
            x1="50"
            y1="50"
            x2={p.x}
            y2={p.y}
            stroke={nodes[i].accent}
            strokeWidth={active === i ? 0.8 : 0.45}
            strokeOpacity={active === i ? 0.95 : 0.4}
            initial={reduce ? false : { pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={reduce ? { duration: 0 } : { ...pmvMotion.premium, delay: 0.1 + i * 0.08 }}
          />
        ))}
      </svg>

      {/* Center hub. */}
      <motion.div
        className="absolute left-1/2 top-1/2 z-10 flex aspect-square w-[34%] flex-col items-center justify-center rounded-full border border-gold/40 bg-navy-900/80 px-3 text-center shadow-[0_0_40px_rgba(201,162,39,0.15)] backdrop-blur"
        // Center via motion's own x/y so the animated transform (scale) does not
        // wipe a Tailwind -translate; keeping both in one transform stays aligned.
        style={{ x: '-50%', y: '-50%' }}
        initial={reduce ? false : { scale: 0.8, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={reduce ? { duration: 0 } : pmvMotion.gentle}
      >
        <span className="text-[10px] font-bold uppercase tracking-[.14em] text-gold/90 sm:text-[11px]">One point</span>
        <span className="text-[10px] font-bold uppercase tracking-[.14em] text-gold/90 sm:text-[11px]">of contact</span>
      </motion.div>

      {/* Service nodes. */}
      {nodes.map((node, i) => {
        const p = points[i]
        return (
          <motion.div
            key={node.label}
            className="absolute z-20"
            style={{ left: `${p.x}%`, top: `${p.y}%`, x: '-50%', y: '-50%' }}
            initial={reduce ? false : { scale: 0.7, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={reduce ? { duration: 0 } : { ...pmvMotion.gentle, delay: 0.15 + i * 0.08 }}
          >
            <ViewTransitionLink
              to={node.to}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              style={active === i ? { borderColor: node.accent, color: node.accent } : undefined}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/12 bg-navy-950/85 px-2 py-1.5 text-center text-[10px] font-semibold text-slate-200 backdrop-blur transition hover:text-white sm:px-2.5 sm:text-xs"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: node.accent }} aria-hidden="true" />
              {node.label}
            </ViewTransitionLink>
          </motion.div>
        )
      })}
    </div>
  )
}
