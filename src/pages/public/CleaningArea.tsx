import { useParams, Navigate } from 'react-router-dom'
import { ViewTransitionLink } from '../../components/public/ViewTransitionLink'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { btnPrimary, btnOutline, PageIntro, Faq } from '../../components/public/ui'
import { Reveal } from '../../components/public/motion'
import { StoryImage, ProcessJourney } from '../../components/public/story'
import { CleaningCalculator } from '../../components/public/CleaningCalculator'
import { usePageMeta } from '../../lib/usePageMeta'
import { useJsonLd } from '../../lib/useJsonLd'
import { findServiceArea, nearbyAreas, areasByCounty, CLEANING_SERVICE_AREAS } from '../../../shared/cleaningServiceAreas'

const SITE_URL = 'https://pinnaclemanagementventures.com'

// ---------------------------------------------------------------------------
// Single service-area landing page: /cleaning/:area
// ---------------------------------------------------------------------------
export function CleaningArea() {
  const { area: slug } = useParams()
  const area = slug ? findServiceArea(slug) : undefined

  usePageMeta(
    area ? `${area.city} Cleaning & Airbnb Turnovers` : 'Cleaning Service Areas',
    area
      ? `House cleaning, deep cleans, and Airbnb turnovers in ${area.city}, ${area.countyLabel}. Real online pricing, vetted local cleaners, and documented completion. Serving ${area.neighborhoods.join(', ')} and nearby.`
      : undefined,
  )

  useJsonLd('cleaning-area-jsonld', area ? {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: 'House cleaning and vacation-rental turnover',
    name: `Cleaning & Turnover Service in ${area.city}`,
    areaServed: { '@type': 'City', name: `${area.city}, FL` },
    provider: {
      '@type': 'LocalBusiness',
      name: 'Pinnacle Management Ventures',
      areaServed: area.countyLabel,
      url: SITE_URL,
      image: `${SITE_URL}/logo-crest-on-dark.png`,
    },
    url: `${SITE_URL}/cleaning/${area.slug}`,
  } : null)

  if (slug && !area) return <Navigate to="/cleaning" replace />
  if (!area) return null

  const near = nearbyAreas(area)

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <section className="container-pmv py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center">
          <PageIntro
            kicker={`${area.city} · ${area.countyLabel}`}
            title={`Cleaning and turnovers in ${area.city}, done right.`}
            subtitle={`House cleaning, deep cleans, move-outs, and Airbnb turnovers across ${area.city} and ${area.neighborhoods.slice(0, 3).join(', ')}. See a real price online and let one accountable local team handle it.`}
          />
          <Reveal>
            <StoryImage slot="property_interior" aspect="aspect-[4/3]" className="rounded-lg" />
          </Reveal>
        </div>

        <div className="mt-10">
          <CleaningCalculator defaultCounty={area.county} heading={`Price a ${area.city} cleaning`} />
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <ViewTransitionLink to="/cleaning/airbnb-turnovers" className={btnPrimary}>Airbnb Turnovers</ViewTransitionLink>
          <ViewTransitionLink to="/cleaning/recurring" className={btnOutline}>Recurring Home Cleaning</ViewTransitionLink>
        </div>

        <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            `Local cleaners who know ${area.city}`,
            'Real online pricing, no sales call',
            'Documented completion with photos',
            'Recurring, one-time, and deep cleans',
            'Airbnb and vacation-rental turnovers',
            'One accountable team, not a directory',
          ].map((item) => (
            <div key={item} className="rounded-md border border-white/10 bg-navy-900/40 px-4 py-3 text-sm text-slate-300">{item}</div>
          ))}
        </div>

        <div className="mt-16 border-t border-white/10 pt-12">
          <p className="eyebrow mb-8">How it works in {area.city}</p>
          <ProcessJourney
            cols={3}
            steps={[
              { n: '01', label: 'Get a real price', detail: `Answer a few questions and see your ${area.city} price now.` },
              { n: '02', label: 'We dispatch a local pro', detail: `A vetted cleaner near ${area.city} is assigned and accountable to Pinnacle.` },
              { n: '03', label: 'Documented completion', detail: 'A checklist is followed and completion is documented.' },
            ]}
          />
        </div>

        {near.length > 0 && (
          <div className="mt-16 border-t border-white/10 pt-12">
            <p className="eyebrow mb-4">Also serving nearby</p>
            <div className="flex flex-wrap gap-2">
              {near.map((n) => (
                <ViewTransitionLink key={n.slug} to={`/cleaning/${n.slug}`} className="rounded-full border border-white/12 bg-navy-900/50 px-4 py-1.5 text-sm text-slate-300 transition-colors hover:border-gold/40 hover:text-gold">
                  {n.city}
                </ViewTransitionLink>
              ))}
              <ViewTransitionLink to="/cleaning/areas" className="rounded-full border border-white/12 bg-navy-900/50 px-4 py-1.5 text-sm text-slate-300 transition-colors hover:border-gold/40 hover:text-gold">
                All areas
              </ViewTransitionLink>
            </div>
          </div>
        )}

        <div className="mt-16">
          <Faq items={[
            [`Do you cover ${area.city}?`, `Yes. We serve ${area.city} and the surrounding ${area.countyLabel} area, including ${area.neighborhoods.join(', ')}. If you are just outside a core zone, start a request and we will confirm coverage.`],
            ['How fast can you come out?', 'Recurring and one-time cleanings are scheduled to your date. Same-day and rush turnovers are available where staffing permits.'],
            ['Is the price I see online the real price?', 'Yes. The calculator uses our live pricing, not a placeholder. A few property specifics can need a quick confirmation, but there are no surprise charges after service.'],
          ]} />
        </div>
      </section>
      <Footer />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Areas index: /cleaning/areas
// ---------------------------------------------------------------------------
export function CleaningAreasIndex() {
  usePageMeta(
    'Cleaning Service Areas in South Florida',
    'Pinnacle cleaning and Airbnb turnover service areas across Miami-Dade, Broward, and Palm Beach County. Find your city and get a price online.',
  )
  useJsonLd('cleaning-areas-jsonld', {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: CLEANING_SERVICE_AREAS.map((a, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `${a.city} Cleaning`,
      url: `${SITE_URL}/cleaning/${a.slug}`,
    })),
  })

  const groups = areasByCounty()

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <section className="container-pmv py-16">
        <PageIntro
          kicker="Service Areas"
          title="Cleaning and turnovers across South Florida."
          subtitle="We dispatch vetted local cleaners across Miami-Dade, Broward, and Palm Beach County. Find your city for local details and online pricing."
        />

        <div className="mt-8 flex flex-wrap gap-3">
          <ViewTransitionLink to="/cleaning" className={btnPrimary}>Cleaning &amp; Turnovers</ViewTransitionLink>
          <ViewTransitionLink to="/cleaning/recurring" className={btnOutline}>Get My Price</ViewTransitionLink>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.county}>
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gold/80">{g.label}</h2>
              <div className="mt-4 flex flex-col gap-2">
                {g.areas.map((a) => (
                  <ViewTransitionLink key={a.slug} to={`/cleaning/${a.slug}`} className="group flex items-baseline justify-between rounded-md border border-white/10 bg-navy-900/50 px-4 py-3 transition-colors hover:border-gold/40">
                    <span className="text-sm font-semibold text-white group-hover:text-gold">{a.city}</span>
                    <span className="text-xs text-slate-500">{a.neighborhoods[0]}</span>
                  </ViewTransitionLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <Footer />
    </div>
  )
}
