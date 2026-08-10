import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import type { ServiceInfo } from '../../data/services'
import { Reveal, StaggerGroup, staggerItem } from './motion'

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-gold px-6 py-3 text-sm font-semibold text-navy-950 shadow-[0_12px_30px_rgba(201,162,39,.12)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold-400 hover:shadow-[0_18px_36px_rgba(201,162,39,.16)] active:translate-y-0'
export const btnOutline =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[.015] px-6 py-3 text-sm font-semibold text-slate-100 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/55 hover:bg-gold/[.03] hover:text-gold active:translate-y-0'
export const panelCls = 'surface-panel rounded-xl p-6 sm:p-8'

export function TagLine({ tag, popular }: { tag: string; popular?: boolean }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-gold/80">{tag}{popular ? ' · Featured' : ''}</p>
}

export function PageIntro({ kicker, title, subtitle, align = 'left' }: { kicker: string; title: string; subtitle?: string; align?: 'left' | 'center' }) {
  const centered = align === 'center'
  return (
    <Reveal className={centered ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      <p className="eyebrow">{kicker}</p>
      <h1 className="mt-4 font-display text-4xl font-medium tracking-[-.025em] text-white sm:text-5xl lg:text-[3.5rem]">{title}</h1>
      {subtitle && <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">{subtitle}</p>}
    </Reveal>
  )
}

export function CtaBand({ title, body, primary, secondary }: { title: string; body: string; primary: { to: string; label: string }; secondary?: { to: string; label: string } }) {
  return (
    <section className="relative overflow-hidden border-y border-white/10 bg-navy-900/80">
      <div className="enterprise-grid pointer-events-none absolute inset-0 opacity-40" />
      <Reveal className="container-pmv relative flex flex-col items-start gap-8 py-14 sm:py-16 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <p className="eyebrow">Next step</p>
          <h2 className="mt-3 font-display text-3xl font-medium tracking-tight text-white sm:text-4xl">{title}</h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">{body}</p>
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
    <StaggerGroup className="grid gap-3 sm:grid-cols-3">
      {items.map(([title, body], i) => (
        <motion.div key={title} variants={staggerItem} whileHover={{ y: -3 }} transition={{ duration: 0.2 }} className="surface-panel rounded-xl p-6 sm:p-7">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gold/20 bg-gold/[.07] font-display text-sm text-gold">{String(i + 1).padStart(2, '0')}</div>
          <h3 className="mt-5 text-base font-semibold text-white">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
        </motion.div>
      ))}
    </StaggerGroup>
  )
}

export function Faq({ items }: { items: [string, string][] }) {
  return (
    <div className="surface-panel overflow-hidden rounded-xl">
      {items.map(([question, answer]) => (
        <details key={question} className="group border-b border-white/[.07] px-5 py-5 last:border-b-0 sm:px-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-white transition-colors hover:text-gold marker:content-none">
            {question}<span className="shrink-0 text-gold transition duration-200 group-open:rotate-45">+</span>
          </summary>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{answer}</p>
        </details>
      ))}
    </div>
  )
}

export function ServiceList({ items, compact = false }: { items: ServiceInfo[]; compact?: boolean }) {
  return (
    <StaggerGroup className={`grid gap-3 ${compact ? '' : 'sm:grid-cols-2'}`}>
      {items.map((s, i) => (
        <motion.div key={s.slug} variants={staggerItem} whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
          <Link to={`/services/${s.slug}`} className="group block h-full rounded-xl border border-white/[.08] bg-gradient-to-b from-white/[.03] to-white/[.012] p-5 transition-all duration-200 hover:border-gold/20 hover:from-white/[.045] hover:shadow-[0_18px_40px_rgba(0,0,0,.14)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3"><span className="font-display text-xs text-gold/60">{String(i + 1).padStart(2, '0')}</span><h3 className="text-base font-semibold text-white transition-colors group-hover:text-gold">{s.title}</h3></div>
                {!compact && <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">{s.shortDescription}</p>}
                {s.popular && <span className="mt-4 inline-flex rounded-full border border-gold/20 bg-gold/[.07] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.14em] text-gold/80">Featured</span>}
              </div>
              <span className="mt-1 shrink-0 text-slate-500 transition duration-200 group-hover:translate-x-1 group-hover:text-gold">→</span>
            </div>
          </Link>
        </motion.div>
      ))}
    </StaggerGroup>
  )
}
