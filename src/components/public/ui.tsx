import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import type { ServiceInfo } from '../../data/services'
import { Reveal, StaggerGroup, staggerItem } from './motion'

// Shared presentational primitives for the public marketing site only.
// Deliberately separate from ../ui.tsx (used by the client/staff portal) —
// sharper corners, no backdrop-blur, no rounded-full pills, so changes here
// never ripple into the logged-in app.

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-md bg-gold px-6 py-3 text-sm font-semibold text-navy-950 transition hover:bg-gold-400'
export const btnOutline =
  'inline-flex items-center justify-center gap-2 rounded-md border border-white/15 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-gold hover:text-gold'
export const panelCls = 'rounded-md border border-white/10 bg-white/[0.03] p-6 sm:p-8'

// Small caption label used in place of pill/badge chips (e.g. "Consulting · Popular").
export function TagLine({ tag, popular }: { tag: string; popular?: boolean }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold/80">
      {tag}
      {popular ? ' · Popular' : ''}
    </p>
  )
}

// Page-level intro: small kicker + serif headline + optional subtitle.
// Used once per page — not per section — so it reads as a real title, not a repeated template block.
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
    <div className={centered ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className="eyebrow">{kicker}</p>
      <h1 className="mt-3 font-display text-4xl font-medium tracking-tight text-white sm:text-5xl">{title}</h1>
      {subtitle && <p className="mt-5 text-lg leading-relaxed text-slate-300">{subtitle}</p>}
    </div>
  )
}

// Full-bleed contrasting band for section-ending calls to action, instead of a floating card.
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
          {secondary && (
            <Link to={secondary.to} className={btnOutline}>{secondary.label}</Link>
          )}
        </div>
      </Reveal>
    </section>
  )
}

// Horizontal divided row-list (replaces a 3-up card grid for short feature/value lists).
export function SplitFeatures({ items }: { items: [string, string][] }) {
  return (
    <StaggerGroup className="grid divide-y divide-white/10 border-y border-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {items.map(([title, body], i) => (
        <motion.div key={title} variants={staggerItem} className="px-1 py-6 sm:px-6 sm:py-8 first:pl-0 sm:first:pl-0">
          <span className="font-display text-lg text-gold/70">{String(i + 1).padStart(2, '0')}</span>
          <h3 className="mt-2 text-base font-semibold text-white">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{body}</p>
        </motion.div>
      ))}
    </StaggerGroup>
  )
}

// Placeholder client quotes — generic, role-only attribution (no invented
// person names) so this reads as template copy to swap for real feedback,
// not as a fabricated review of a specific person. Content only; replace
// the `quotes` array below with real testimonials when available.
const placeholderQuotes: [string, string][] = [
  ['Pinnacle coordinated everything for our property portfolio — maintenance, tenant communication, reporting — without us having to manage five different vendors.', 'Property Owner, South Florida'],
  ['We came in unsure what kind of financing even made sense for us. Pinnacle walked us through the options honestly, including the ones that weren’t a fit.', 'Small Business Owner'],
  ['Having one team handle consulting and the day-to-day admin work meant we stopped repeating ourselves to a different vendor every week.', 'Founder, Professional Services Firm'],
]

export function Testimonials({ quotes = placeholderQuotes }: { quotes?: [string, string][] }) {
  return (
    <StaggerGroup className="grid gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 sm:grid-cols-3">
      {quotes.map(([quote, attribution]) => (
        <motion.div key={attribution} variants={staggerItem} className={`${panelCls} rounded-none border-0`}>
          <p className="text-gold">&ldquo;</p>
          <p className="text-sm leading-relaxed text-slate-300">{quote}</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{attribution}</p>
        </motion.div>
      ))}
    </StaggerGroup>
  )
}

// Brief credentials/trust strip — placeholder values, swap for real figures.
const placeholderCredentials: [string, string][] = [
  ['Licensed & Insured', 'Commissioned Florida notary; licensed and insured for on-site services'],
  ['Nationwide + On-Site', 'Remote support anywhere, in-person service across South Florida'],
  ['One Point of Contact', 'A single coordinated team across every service you use'],
]

export function CredentialsStrip({ items = placeholderCredentials }: { items?: [string, string][] }) {
  return <SplitFeatures items={items} />
}

// Simple, dependency-free FAQ — native <details>/<summary> instead of a
// third-party accordion component (matches the codebase's no-extra-deps
// pattern; no JS needed for the expand/collapse behavior).
export function Faq({ items }: { items: [string, string][] }) {
  return (
    <div className="divide-y divide-white/10 border-y border-white/10">
      {items.map(([question, answer]) => (
        <details key={question} className="group py-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-white marker:content-none">
            {question}
            <span className="shrink-0 text-gold transition group-open:rotate-45">+</span>
          </summary>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">{answer}</p>
        </details>
      ))}
    </div>
  )
}

// Divided service list — replaces the boxed-card grid used for service navigation.
export function ServiceList({ items, compact = false }: { items: ServiceInfo[]; compact?: boolean }) {
  return (
    <StaggerGroup className={`grid divide-y divide-white/10 border-t border-white/10 ${compact ? '' : 'sm:grid-cols-2 sm:divide-y-0'}`}>
      {items.map((s, i) => (
        <motion.div key={s.slug} variants={staggerItem}>
          <Link
            to={`/services/${s.slug}`}
            className={`group flex items-start justify-between gap-4 border-white/10 py-5 transition hover:bg-white/[0.03] sm:px-2 ${
              compact ? 'border-b' : 'sm:border-b sm:px-4'
            }`}
          >
            <div>
              <div className="flex items-baseline gap-3">
                <span className="font-display text-sm text-gold/60">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="text-base font-semibold text-white group-hover:text-gold">{s.title}</h3>
                {s.popular && <span className="text-[11px] font-medium uppercase tracking-wide text-gold/70">Popular</span>}
              </div>
              {!compact && <p className="mt-1.5 max-w-md text-sm text-slate-400">{s.shortDescription}</p>}
            </div>
            <span className="mt-1 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-gold">→</span>
          </Link>
        </motion.div>
      ))}
    </StaggerGroup>
  )
}
