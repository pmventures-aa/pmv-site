import { useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { OfferingLibrary } from '../../components/public/OfferingLibrary'
import { btnOutline, btnPrimary, panelCls, ServiceList, TagLine } from '../../components/public/ui'
import { Breadcrumbs, BreadcrumbSlot } from '../../components/public/Breadcrumbs'
import { ViewTransitionLink } from '../../components/public/ViewTransitionLink'
import { getServiceBySlug, services } from '../../data/services'
import { usePageMeta } from '../../lib/usePageMeta'
import { usePublicVisitor } from '../../lib/publicContext'
import { worldFromPublicParams } from '../../lib/workspace'
import { PriceAnchor } from '../../components/public/PriceAnchor'
import { CaseStudyStrip } from '../../components/public/Proof'
import { StoryImage, ProcessJourney, ProjectScenario, ProofRail } from '../../components/public/story'
import { getServiceStory, DEFAULT_JOURNEY, DEFAULT_DELIVERABLES } from '../../data/serviceStories'

const PLAN_PITCH: Record<'property'|'ops'|'legal', { eyebrow: string; title: string; body: string; from: string; to: string }> = {
  property: { eyebrow: 'Property Care Plans', title: 'Licensed managers in network, or on-call care if you keep the keys.', body: 'Use licensed property managers and CAM agents in the Pinnacle network at a lower cost than the typical percentage shop, or start a Property Care plan from $89/mo with inspections, credits, and priority scheduling.', from: 'From $89/mo', to: '/care-plans?family=property' },
  ops: { eyebrow: 'Ops-on-Call Plans', title: 'Keep this capacity on retainer.', body: 'Ops-on-Call plans start at $199/mo with included hours, a named coordinator, and 10-20% off project engagements - without renegotiating every request.', from: 'From $199/mo', to: '/care-plans?family=ops' },
  legal: { eyebrow: 'Legal & Notary Pass', title: 'Firms on the Pass skip the per-request scramble.', body: 'One coordinator for mobile notary, RON, courier, and courthouse runs. The Pass starts at $99/mo with included volume, same-day priority, and 25% off everything past that.', from: 'From $99/mo', to: '/care-plans?family=legal' },
}

function PlanCrossSell({ family }: { family: 'property'|'ops'|'legal' }) {
  const pitch = PLAN_PITCH[family]
  return (
    <div className="mt-12 grid gap-6 rounded-2xl border border-gold/25 bg-gradient-to-br from-gold/[.07] via-transparent to-transparent p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold">{pitch.eyebrow} · {pitch.from}</p>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-[-.02em] text-white">{pitch.title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">{pitch.body}</p>
      </div>
      <Link to={pitch.to} className={btnPrimary}>See Monthly Plans</Link>
    </div>
  )
}

export default function ServiceDetail() {
  const { slug } = useParams<{ slug: string }>()
  const service = getServiceBySlug(slug)
  const visitor = usePublicVisitor()
  usePageMeta(service?.title ?? 'Services', service?.shortDescription)

  const world = service?.intakeJob ? worldFromPublicParams({ job: service.intakeJob }) : 'general'
  useEffect(() => { if (service && world !== 'general') visitor.setWorld(world) }, [service?.slug])

  if (!service) return <Navigate to="/services" replace />

  const story = getServiceStory(service.slug)
  const others = services.filter((item) => item.slug !== service.slug && item.key !== service.key).slice(0, 3)
  const requestUrl = `/scope-request?entry=${encodeURIComponent(service.slug)}&service=${encodeURIComponent(service.key)}${service.intakeJob ? `&job=${encodeURIComponent(service.intakeJob)}` : ''}&source=service-${encodeURIComponent(service.slug)}`

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <BreadcrumbSlot>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Breadcrumbs items={[{ label: 'Services', to: '/services' }, { label: service.title }]} />
          <ViewTransitionLink to={requestUrl} className="font-semibold text-gold hover:text-gold-300">Start a request for this service →</ViewTransitionLink>
        </div>
      </BreadcrumbSlot>
      <section className="container-pmv py-12 sm:py-16">
        <div><TagLine tag={service.tag} popular={service.popular} /></div>
        <h1 className="pmv-h1 mt-3 max-w-4xl">{service.title}</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">{service.heroDescription}</p>
        <PriceAnchor serviceKey={service.key} offeringPrefixes={service.offeringPrefixes} />
        <div className="mt-8 flex flex-wrap gap-3">
          <ViewTransitionLink to={requestUrl} className={btnPrimary}>Request this service</ViewTransitionLink>
          <ViewTransitionLink to={`/instant-quote?service=${encodeURIComponent(service.key)}`} className={btnOutline}>Get an instant estimate</ViewTransitionLink>
          <a href="tel:+15613887879" className={btnOutline}>Call (561) 388-7879</a>
        </div>
        <p className="mt-4 flex max-w-2xl items-center gap-2 text-xs leading-5 text-slate-400"><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"/>No account required to start. A real person replies within two business hours.</p>

        <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 lg:grid-cols-2">
          <div className={`${panelCls} rounded-none border-0`}>
            <h2 className="text-lg font-semibold text-white">What this can help with</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              {service.highlights.map((item) => <li key={item} className="flex gap-3"><span className="text-gold">✓</span>{item}</li>)}
            </ul>
          </div>
          <div className={`${panelCls} rounded-none border-0`}>
            <h2 className="text-lg font-semibold text-white">A good fit when</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              {service.idealFor.map((item) => <li key={item} className="flex gap-3"><span className="text-gold">•</span>{item}</li>)}
            </ul>
          </div>
        </div>

        {story && (
          <div className="mt-14 grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
            <StoryImage slot={story.slot} aspect="aspect-[4/3]" />
            <div>
              <p className="eyebrow">How Pinnacle handles it</p>
              <p className="mt-4 text-lg leading-8 text-slate-200">{story.lead}</p>
              <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
                {service.highlights.slice(0, 4).map((item) => <li key={item} className="flex gap-3"><span className="text-gold">✓</span>{item}</li>)}
              </ul>
            </div>
          </div>
        )}

        {story && (
          <div className="mt-16">
            <p className="eyebrow mb-8">How it moves</p>
            <ProcessJourney steps={story.journey ?? DEFAULT_JOURNEY} />
          </div>
        )}

        <OfferingLibrary serviceKey={service.key} offeringPrefixes={service.offeringPrefixes} />

        {service.planFamily && <PlanCrossSell family={service.planFamily} />}

        {story && (
          <div className="mt-16 grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-start lg:gap-12">
            <ProjectScenario className="min-w-0" label={story.scenario.title} title={service.title} slot={story.slot} steps={story.scenario.steps} />
            {/* min-w-0 lets the ProofRail's overflow-hidden clip the ticker instead
                of its w-max/nowrap content forcing this track wide and starving
                the sibling column to a sliver. */}
            <div className="min-w-0">
              <p className="eyebrow">What you receive</p>
              <p className="mt-3 text-sm leading-7 text-slate-400">Clear evidence and a record of what happened, so you are never left guessing.</p>
              <div className="mt-5">
                <ProofRail items={story.deliverables ?? DEFAULT_DELIVERABLES} />
              </div>
            </div>
          </div>
        )}

        <div className="mt-16">
          <p className="eyebrow mb-4">You may also want to explore</p>
          <ServiceList items={others} compact />
        </div>
      </section>
      <CaseStudyStrip serviceKey={service.key} className="border-t border-white/10" />
      <Footer />
    </div>
  )
}
