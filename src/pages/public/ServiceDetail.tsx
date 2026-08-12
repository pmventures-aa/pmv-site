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
      <div className="border-b border-white/[.06] bg-navy-900/40"><div className="container-pmv flex flex-wrap items-center justify-between gap-3 py-3 text-xs"><Link to="/services" className="inline-flex items-center gap-1.5 font-semibold text-slate-400 transition hover:text-gold"><span aria-hidden="true">←</span> All services</Link><Link to={requestUrl} className="font-semibold text-gold hover:text-gold-300">Start a request for this service →</Link></div></div>
      <section className="container-pmv py-12 sm:py-16">
        <div><TagLine tag={service.tag} popular={service.popular} /></div>
        <h1 className="mt-3 max-w-4xl font-display text-4xl font-bold leading-[1.05] tracking-[-.03em] text-white sm:text-5xl lg:text-6xl">{service.title}</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">{service.heroDescription}</p>
        <PriceAnchor serviceKey={service.key} offeringPrefixes={service.offeringPrefixes} />
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to={requestUrl} className={btnPrimary}>Request this service</Link>
          <Link to={`/instant-quote?service=${encodeURIComponent(service.key)}`} className={btnOutline}>Get an instant estimate</Link>
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
