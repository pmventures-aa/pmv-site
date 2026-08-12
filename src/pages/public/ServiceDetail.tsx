import { Link, Navigate, useParams } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { OfferingLibrary } from '../../components/public/OfferingLibrary'
import { btnOutline, btnPrimary, panelCls, ServiceList, TagLine } from '../../components/public/ui'
import { getServiceBySlug, services } from '../../data/services'
import { usePageMeta } from '../../lib/usePageMeta'
import { PriceAnchor } from '../../components/public/PriceAnchor'
import { CaseStudyStrip } from '../../components/public/Proof'

export default function ServiceDetail() {
  const { slug } = useParams<{ slug: string }>()
  const service = getServiceBySlug(slug)
  usePageMeta(service?.title ?? 'Services', service?.shortDescription)

  if (!service) return <Navigate to="/services" replace />

  const others = services.filter((item) => item.slug !== service.slug).slice(0, 3)
  const requestUrl = `/scope-request?service=${encodeURIComponent(service.key)}&source=service-page`

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <section className="container-pmv py-14 sm:py-16">
        <Link to="/services" className="text-sm text-slate-400 hover:text-gold">← All services</Link>
        <div className="mt-5"><TagLine tag={service.tag} popular={service.popular} /></div>
        <h1 className="mt-2 max-w-4xl font-display text-4xl font-medium text-white sm:text-5xl">{service.title}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">{service.heroDescription}</p>
        <PriceAnchor serviceKey={service.key} offeringPrefixes={service.offeringPrefixes} />
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to={requestUrl} className={btnPrimary}>Scope this service</Link>
          <a href="tel:+15613887879" className={btnOutline}>Call (561) 388-7879</a>
        </div>
        <p className="mt-3 max-w-2xl text-xs leading-5 text-slate-500">No account is required. Tell us the location, timing, and outcome first; create a client workspace afterward only if it is useful.</p>

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

        <OfferingLibrary serviceKey={service.key} offeringPrefixes={service.offeringPrefixes} />

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
