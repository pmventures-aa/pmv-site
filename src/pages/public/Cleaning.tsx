import { useEffect, useState } from 'react'
import { ViewTransitionLink } from '../../components/public/ViewTransitionLink'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { btnPrimary, btnOutline, PageIntro, Faq } from '../../components/public/ui'
import { Reveal } from '../../components/public/motion'
import { StoryImage, ProcessJourney } from '../../components/public/story'
import { CleaningCalculator } from '../../components/public/CleaningCalculator'
import { getCleaningConfig } from '../../lib/cleaningApi'
import { formatUsd, type CleaningServiceType } from '../../../shared/cleaningPricing'
import { usePageMeta } from '../../lib/usePageMeta'
import { CLEANING_SERVICE_AREAS } from '../../../shared/cleaningServiceAreas'

// A curated strip of marquee cities for the hub - the full grid lives on
// /cleaning/areas. One per major metro keeps the row tidy on the hub.
const AREA_LINKS = CLEANING_SERVICE_AREAS.filter((a) =>
  ['miami', 'miami-beach', 'coral-gables', 'fort-lauderdale', 'hollywood', 'west-palm-beach', 'boca-raton', 'delray-beach'].includes(a.slug),
)

// Live starting prices, always from the pricing engine config - never hardcoded.
function useStartingPrices() {
  const [prices, setPrices] = useState<Record<string, number | null> | null>(null)
  useEffect(() => {
    let live = true
    getCleaningConfig().then((c) => live && setPrices(c.startingPrices)).catch(() => {})
    return () => { live = false }
  }, [])
  return prices
}

function fromLabel(prices: Record<string, number | null> | null, key: CleaningServiceType): string {
  const cents = prices?.[key]
  return typeof cents === 'number' ? `From ${formatUsd(cents)}` : 'Custom quote'
}

const SUBSERVICES: { key: CleaningServiceType; title: string; to: string; blurb: string }[] = [
  { key: 'str_turnover', title: 'Airbnb & Vacation Rental Cleaning', to: '/cleaning/airbnb-turnovers', blurb: 'Guest-ready turnovers with a tracked checklist and completion photos.' },
  { key: 'residential_standard', title: 'Recurring Home Cleaning', to: '/cleaning/recurring', blurb: 'Weekly, every-two-week, or monthly service on a routine we keep.' },
  { key: 'residential_standard', title: 'One-Time Home Cleaning', to: '/cleaning/recurring', blurb: 'A single reset when you need the house handled once.' },
  { key: 'deep', title: 'Deep Cleaning', to: '/cleaning/recurring', blurb: 'Baseboards, fixtures, buildup, and the detail a routine clean skips.' },
  { key: 'move_in_out', title: 'Move-In / Move-Out Cleaning', to: '/cleaning/recurring', blurb: 'An inspection-grade clean for an empty home between occupants.' },
]

// ---------------------------------------------------------------------------
// Cleaning & Turnovers hub
// ---------------------------------------------------------------------------
export default function CleaningHub() {
  usePageMeta('Cleaning & Property Turnovers', 'Airbnb turnovers, recurring home cleaning, deep cleans, and move-out cleaning across Miami-Dade, Broward, and Palm Beach. Get a price online.')
  const prices = useStartingPrices()

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <section className="container-pmv py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center">
          <PageIntro
            kicker="Cleaning & Property Turnovers"
            title="From your own home to your next guest check-in, we make sure it is ready."
            subtitle="Easy online pricing, professional local cleaners, and documented completion across Miami-Dade, Broward, and Palm Beach. One accountable team, not a directory."
          />
          <Reveal>
            <StoryImage slot="property_interior" aspect="aspect-[4/3]" className="rounded-lg" />
          </Reveal>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <ViewTransitionLink to="/cleaning/airbnb-turnovers" className={btnPrimary}>Get My Price</ViewTransitionLink>
          <ViewTransitionLink to="/cleaning/recurring" className={btnOutline}>Schedule a Cleaning</ViewTransitionLink>
        </div>
        <p className="mt-4 text-sm text-slate-400">
          Airbnb turnovers {fromLabel(prices, 'str_turnover').toLowerCase()} · Home cleaning {fromLabel(prices, 'residential_standard').toLowerCase()}
        </p>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SUBSERVICES.map((s, i) => (
            <ViewTransitionLink key={s.title} to={s.to} className="group rounded-lg border border-white/10 bg-navy-900/55 p-6 transition-colors hover:border-sea-400/50">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sea-300/90">{String(i + 1).padStart(2, '0')}</p>
                <span className="text-xs font-semibold text-gold/90">{fromLabel(prices, s.key)}</span>
              </div>
              <h3 className="mt-3 text-base font-semibold text-white group-hover:text-sea-300">{s.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{s.blurb}</p>
            </ViewTransitionLink>
          ))}
        </div>

        <div className="mt-16 border-t border-white/10 pt-12">
          <p className="eyebrow mb-8">The same promise on every job</p>
          <ProcessJourney
            cols={3}
            steps={[
              { n: '01', label: 'Get a real price', detail: 'Answer a few questions and see your price now, not after a sales call.' },
              { n: '02', label: 'We dispatch a local pro', detail: 'A vetted South Florida cleaner is assigned and accountable to Pinnacle.' },
              { n: '03', label: 'Documented completion', detail: 'A checklist is followed and completion is documented, guest-ready when it matters.' },
            ]}
          />
        </div>

        <div className="mt-16 border-t border-white/10 pt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="eyebrow">Where we clean</p>
            <ViewTransitionLink to="/cleaning/areas" className="text-sm font-semibold text-gold hover:text-gold/80">All service areas</ViewTransitionLink>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {AREA_LINKS.map((a) => (
              <ViewTransitionLink key={a.slug} to={`/cleaning/${a.slug}`} className="rounded-full border border-white/12 bg-navy-900/50 px-4 py-1.5 text-sm text-slate-300 transition-colors hover:border-gold/40 hover:text-gold">
                {a.city}
              </ViewTransitionLink>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-500">Serving Miami-Dade, Broward, and Palm Beach County.</p>
        </div>
      </section>
      <Footer />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Airbnb / vacation rental landing
// ---------------------------------------------------------------------------
export function CleaningAirbnb() {
  usePageMeta('Airbnb & Vacation Rental Cleaning', 'Reliable Airbnb and vacation-rental turnovers across Miami-Dade, Broward, and Palm Beach - scheduling, checklists, and documented completion. Price your turnover online.')

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <section className="container-pmv py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center">
          <PageIntro
            kicker="Airbnb & Vacation Rental Turnovers"
            title="Your next guest should never know there was a last one."
            subtitle="Reliable turnovers throughout Miami-Dade, Broward, and Palm Beach - with scheduling, checklists, and documented completion through one accountable team. Guest-ready. On schedule. Documented."
          />
          <Reveal>
            <StoryImage slot="completion" aspect="aspect-[4/3]" className="rounded-lg" />
          </Reveal>
        </div>

        <div className="mt-10">
          <CleaningCalculator service="str_turnover" heading="Price my turnover" />
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <ViewTransitionLink to="/scope-request?job=cleaning_turnover&service=property-cleaning&source=airbnb-portfolio" className={btnOutline}>I Manage Multiple Properties</ViewTransitionLink>
        </div>

        <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            'Recurring and same-day turnover requests',
            'Standardized checklist with property-specific instructions',
            'Before / after completion documentation',
            'Linen and restocking options',
            'Issue reporting the moment something is found',
            'Support for hosts managing several calendars',
          ].map((item) => (
            <div key={item} className="rounded-md border border-white/10 bg-navy-900/40 px-4 py-3 text-sm text-slate-300">{item}</div>
          ))}
        </div>

        <div className="mt-16 border-t border-white/10 pt-12">
          <p className="eyebrow mb-8">How it works</p>
          <ProcessJourney
            cols={5}
            steps={[
              { n: '01', label: 'Add your property', detail: 'Tell us the basics once. We keep the reset instructions on file.' },
              { n: '02', label: 'Tell us how to reset it', detail: 'Linens, staging, supplies, and your house checklist.' },
              { n: '03', label: 'Schedule or sync turnovers', detail: 'Book a date or connect your reservation calendar.' },
              { n: '04', label: 'We dispatch', detail: 'A local pro is assigned with your property instructions.' },
              { n: '05', label: 'Guest-ready confirmation', detail: 'Documented completion, so you know it is ready.' },
            ]}
          />
        </div>

        <div className="mt-16">
          <Faq items={[
            ['Do you cover my area?', 'We serve Miami-Dade, Broward, and Palm Beach County. If your property is just outside a core zone, start a request and we will confirm coverage.'],
            ['Can you handle same-day turnovers?', 'Same-day and rush turnovers are available where staffing permits and can be added to your request. We confirm before committing to a same-day window.'],
            ['What if the cleaner finds damage or a missing item?', 'Issues are flagged with photos and reported to you right away. Nothing that changes the price happens without your approval.'],
          ]} />
        </div>
      </section>
      <Footer />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recurring / residential landing
// ---------------------------------------------------------------------------
export function CleaningRecurring() {
  usePageMeta('Recurring & Home Cleaning', 'Weekly, every-two-week, or monthly home cleaning across South Florida. See your per-visit price online and schedule in minutes.')

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <section className="container-pmv py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center">
          <PageIntro
            kicker="Recurring & Home Cleaning"
            title="Come home to clean. Every time."
            subtitle="Choose weekly, every-two-week, or monthly service and let Pinnacle keep the routine handled. One cleaning or every week - tell us what you need and we will handle the rest."
          />
          <Reveal>
            <StoryImage slot="vendor_arrival" aspect="aspect-[4/3]" className="rounded-lg" />
          </Reveal>
        </div>

        <div className="mt-10">
          <CleaningCalculator showFrequency heading="Get my cleaning price" />
        </div>

        <div className="mt-16 border-t border-white/10 pt-12">
          <Faq items={[
            ['How does recurring pricing work?', 'You see the actual per-visit price for each frequency, not just a percentage. Weekly saves the most; every-two-week and monthly save less. You can pause, skip, or reschedule under our standard policy.'],
            ['One-time or deep clean instead?', 'Pick One-Time in the calculator, or choose Deep Cleaning for baseboards, fixtures, and buildup a routine clean does not touch.'],
            ['Do I need to provide supplies?', 'No. Pinnacle-provided supplies are included. If you prefer we use yours, select that and the price adjusts.'],
          ]} />
        </div>
      </section>
      <Footer />
    </div>
  )
}
