import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { btnOutline, btnPrimary } from '../../components/public/ui'
import { KineticHeading, Reveal, SectionTransition } from '../../components/public/motion'
import { Breadcrumbs, BreadcrumbSlot } from '../../components/public/Breadcrumbs'
import { ViewTransitionLink } from '../../components/public/ViewTransitionLink'
import { Icon } from '../../components/kit/Icon'
import { usePageMeta } from '../../lib/usePageMeta'

const GET_HELP = '/scope-request?source=coverage'

const REMOTE = [
  'Business operations and project coordination',
  'Administrative capacity and follow-through',
  'POS, payments, and systems transitions',
  'Funding readiness and preparation',
  'Remote Online Notarization (RON)',
  'Document handling and signing coordination',
]

const FIELD = [
  'Cleaning and short-term rental turnovers',
  'Inspections and condition reports',
  'Field photos and BPO support',
  'Eviction document and possession work',
  'REO preservation and make-ready',
  'Mobile notary and document courier runs',
]

function CoverageColumn({ tone, kicker, title, blurb, items, footnote }: {
  tone: 'sea' | 'gold'
  kicker: string
  title: string
  blurb: string
  items: string[]
  footnote: string
}) {
  const accent = tone === 'sea' ? 'text-sea-300' : 'text-gold'
  const dot = tone === 'sea' ? 'bg-sea-400' : 'bg-gold'
  const ring = tone === 'sea' ? 'border-sea-400/25' : 'border-gold/25'
  return (
    <Reveal className={`rounded-2xl border ${ring} bg-white/[.015] p-6 sm:p-8`}>
      <p className={`text-[11px] font-bold uppercase tracking-[.16em] ${accent}`}>{kicker}</p>
      <h2 className="mt-3 font-display text-2xl font-semibold text-white sm:text-3xl">{title}</h2>
      <p className="mt-3 max-w-md text-sm leading-7 text-slate-400">{blurb}</p>
      <ul className="mt-6 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-slate-300">
            <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
      <p className="mt-6 border-t border-white/10 pt-4 text-[13px] leading-6 text-slate-500">{footnote}</p>
    </Reveal>
  )
}

export default function Coverage() {
  usePageMeta(
    'Coverage | Pinnacle Management Ventures',
    'Pinnacle coordinates professional support nationwide, with owned crews handling hands-on field work throughout South Florida and vetted local providers everywhere else.',
  )

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <main>
        <BreadcrumbSlot><Breadcrumbs items={[{ label: 'Coverage' }]} /></BreadcrumbSlot>

        <section className="pmv-hero-story relative overflow-hidden border-b border-white/[.08]">
          <div className="pmv-hero-gold" aria-hidden="true" />
          <div className="container-pmv py-14 sm:py-20">
            <Reveal>
              <p className="eyebrow">Coverage</p>
              <h1 className="pmv-h1 mt-4">
                <KineticHeading trigger="mount" lines={[{ text: 'Nationwide reach.' }, { text: 'Local hands.', className: 'pmv-gold-text' }]} />
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                Pinnacle coordinates professional support across the country, and puts owned crews on the ground for the physical work throughout South Florida.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ViewTransitionLink to={GET_HELP} className={btnPrimary}>What do you need done?</ViewTransitionLink>
                <ViewTransitionLink to="/services" className={btnOutline}>Explore Services</ViewTransitionLink>
              </div>
            </Reveal>
          </div>
        </section>

        <SectionTransition className="max-w-[72rem] px-4" />

        <section className="container-pmv py-14 sm:py-20">
          <Reveal className="max-w-2xl">
            <p className="eyebrow">Two ways we cover the work</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-[-.035em] text-white sm:text-4xl">Remote everywhere. Hands-on where it counts.</h2>
          </Reveal>
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <CoverageColumn
              tone="sea"
              kicker="Remote · Nationwide"
              title="Coordinated from anywhere, for anyone in the U.S."
              blurb="The professional, administrative, and document work runs through one point of contact, wherever you are."
              items={REMOTE}
              footnote="Delivered remotely, coast to coast, with one Pinnacle contact keeping it moving."
            />
            <CoverageColumn
              tone="gold"
              kicker="On the ground · South Florida"
              title="Owned crews for the physical work."
              blurb="When the job needs someone on site, Pinnacle's own South Florida crews handle it and document as they go."
              items={FIELD}
              footnote="Documented and geo-verified on completion. Licensed managers or CAMs are named when the work requires them."
            />
          </div>
        </section>

        <section className="border-y border-white/[.07] bg-navy-900/30">
          <div className="container-pmv grid gap-8 py-14 sm:py-16 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
            <Reveal>
              <p className="eyebrow">Outside South Florida?</p>
              <h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Field work anywhere, through a vetted network.</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">
                When hands-on work is needed beyond South Florida, Pinnacle coordinates vetted local providers and holds them to the same documentation and completion standard, with you still working through one point of contact.
              </p>
            </Reveal>
            <Reveal className="flex flex-wrap gap-3 lg:justify-end">
              <ViewTransitionLink to={GET_HELP} className={btnPrimary}>Start a Request</ViewTransitionLink>
              <ViewTransitionLink to="/how-it-works" className={btnOutline}>How Pinnacle Works</ViewTransitionLink>
            </Reveal>
          </div>
        </section>

        <section className="container-pmv py-14 sm:py-18">
          <Reveal className="flex flex-col items-start justify-between gap-5 border-t border-gold/20 pt-9 sm:flex-row sm:items-center">
            <div className="max-w-xl">
              <h2 className="font-display text-2xl font-medium text-white">Not sure if we cover your need?</h2>
              <p className="mt-2 flex items-center gap-2 text-sm leading-7 text-slate-400">
                <Icon name="check" size={16} aria-hidden="true" className="shrink-0 text-gold" />
                Tell us the situation and location. We will confirm exactly how it gets covered.
              </p>
            </div>
            <ViewTransitionLink to={GET_HELP} className={btnPrimary}>What do you need done?</ViewTransitionLink>
          </Reveal>
        </section>
      </main>
      <Footer />
    </div>
  )
}
