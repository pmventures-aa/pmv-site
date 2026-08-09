import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import type { ServiceInfo } from '../../data/services'
import { Reveal, StaggerGroup, staggerItem } from './motion'

// Shared presentational primitives for the public marketing site only.
// Deliberately separate from ../ui.tsx (used by the client/staff portal),
// so public-site motion and styling changes never ripple into logged-in apps.

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-md bg-gold px-6 py-3 text-sm font-semibold text-navy-950 transition duration-200 hover:-translate-y-0.5 hover:bg-gold-400 hover:shadow-lg hover:shadow-gold/10 active:translate-y-0'
export const btnOutline =
  'inline-flex items-center justify-center gap-2 rounded-md border border-white/15 px-6 py-3 text-sm font-semibold text-slate-100 transition duration-200 hover:-translate-y-0.5 hover:border-gold hover:text-gold active:translate-y-0'
export const panelCls = 'rounded-md border border-white/10 bg-white/[0.03] p-6 sm:p-8'

export function TagLine({ tag, popular }: { tag: string; popular?: boolean }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold/80">
      {tag}
      {popular ? ' · Featured' : ''}
    </p>
  )
}

export function PageIntro({
  kicker,
  title,
  subtitle,
  align = 'left',
}: {
  kicker: string
  title: string
  subtitle?: string
  align?: 'left' | 'center'
}) {
  const centered = align === 'center'
  return (
    <Reveal className={centered ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className="eyebrow">{kicker}</p>
      <h1 className="mt-3 font-display text-4xl font-medium tracking-tight text-white sm:text-5xl">{title}</h1>
      {subtitle && <p className="mt-5 text-lg leading-relaxed text-slate-300">{subtitle}</p>}
    </Reveal>
  )
}

export function CtaBand({
  title,
  body,
  primary,
  secondary,
}: {
  title: string
  body: string
  primary: { to: string; label: string }
  secondary?: { to: string; label: string }
}) {
  return (
    <section className="border-y border-white/10 bg-navy-900">
      <Reveal className="container-pmv flex flex-col items-start gap-6 py-14 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <h2 className="font-display text-2xl font-medium text-white sm:text-3xl">{title}</h2>
          <p className="mt-3 text-slate-300">{body}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to={primary.to} className={btnPrimary}>{primary.label}</Link>
          {secondary && <Link to={secondary.to} className={btnOutline}>{secondary.label}</Link>}
        </div>
      </Reveal>
    </section>
  )
}

export function SplitFeatures({ items }: { items: [string, string][] }) {
  return (
    <StaggerGroup className="grid divide-y divide-white/10 border-y border-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {items.map(([title, body], i) => (
        <motion.div
          key={title}
          variants={staggerItem}
          whileHover={{ y: -3 }}
          transition={{ duration: 0.2 }}
          className="px-1 py-6 sm:px-6 sm:py-8 first:pl-0 sm:first:pl-0"
        >
          <span className="font-display text-lg text-gold/70">{String(i + 1).padStart(2, '0')}</span>
          <h3 className="mt-2 text-base font-semibold text-white">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{body}</p>
        </motion.div>
      ))}
    </StaggerGroup>
  )
}

export function Faq({ items }: { items: [string, string][] }) {
  return (
    <div className="divide-y divide-white/10 border-y border-white/10">
      {items.map(([question, answer]) => (
        <details key={question} className="group py-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-white transition-colors hover:text-gold marker:content-none">
            {question}
            <span className="shrink-0 text-gold transition duration-200 group-open:rotate-45">+</span>
          </summary>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">{answer}</p>
        </details>
      ))}
    </div>
  )
}

export function ServiceList({ items, compact = false }: { items: ServiceInfo[]; compact?: boolean }) {
  return (
    <StaggerGroup className={`grid divide-y divide-white/10 border-t border-white/10 ${compact ? '' : 'sm:grid-cols-2 sm:divide-y-0'}`}>
      {items.map((s, i) => (
        <motion.div key={s.slug} variants={staggerItem} whileHover={{ x: 3 }} transition={{ duration: 0.18 }}>
          <Link
            to={`/services/${s.slug}`}
            className={`group flex items-start justify-between gap-4 border-white/10 py-5 transition duration-200 hover:bg-white/[0.03] sm:px-2 ${compact ? 'border-b' : 'sm:border-b sm:px-4'}`}
          >
            <div>
              <div className="flex items-baseline gap-3">
                <span className="font-display text-sm text-gold/60">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="text-base font-semibold text-white transition-colors group-hover:text-gold">{s.title}</h3>
                {s.popular && <span className="text-[11px] font-medium uppercase tracking-wide text-gold/70">Featured</span>}
              </div>
              {!compact && <p className="mt-1.5 max-w-md text-sm text-slate-400">{s.shortDescription}</p>}
            </div>
            <span className="mt-1 shrink-0 text-slate-500 transition duration-200 group-hover:translate-x-1 group-hover:text-gold">→</span>
          </Link>
        </motion.div>
      ))}
    </StaggerGroup>
  )
}
