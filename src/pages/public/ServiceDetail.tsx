import { Link, Navigate, useParams } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { btnOutline, btnPrimary, panelCls, ServiceList, TagLine } from '../../components/public/ui'
import { getServiceBySlug, services } from '../../data/services'
import { usePageMeta } from '../../lib/usePageMeta'

export default function ServiceDetail() {
  const { slug } = useParams<{ slug: string }>()
  const service = getServiceBySlug(slug)

  // Hooks must run unconditionally — fall back to a generic title/description
  // when there's no matching service, since the redirect below still needs
  // to render once before <Navigate> takes effect.
  usePageMeta(service?.title ?? 'Services', service?.shortDescription)

  if (!service) return <Navigate to="/services" replace />

  const others = services.filter((s) => s.slug !== service.slug).slice(0, 3)

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <section className="container-pmv py-16">
        <Link to="/services" className="text-sm text-slate-400 hover:text-gold">
          ← All services
        </Link>
        <div className="mt-5">
          <TagLine tag={service.tag} popular={service.popular} />
        </div>
        <h1 className="mt-2 font-display text-4xl font-medium text-white sm:text-5xl">{service.title}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">{service.heroDescription}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to="/contact" className={btnPrimary}>Request this service</Link>
          <a href="tel:+15613887879" className={btnOutline}>Call (561) 388-7879</a>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 lg:grid-cols-2">
          <div className={`${panelCls} rounded-none border-0`}>
            <h2 className="text-lg font-semibold text-white">What&rsquo;s included</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              {service.highlights.map((h) => (
                <li key={h} className="flex gap-3">
                  <span className="text-gold">✓</span>
                  {h}
                </li>
              ))}
            </ul>
          </div>
          <div className={`${panelCls} rounded-none border-0`}>
            <h2 className="text-lg font-semibold text-white">Ideal for</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              {service.idealFor.map((h) => (
                <li key={h} className="flex gap-3">
                  <span className="text-gold">•</span>
                  {h}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16">
          <p className="eyebrow mb-4">Other services</p>
          <ServiceList items={others} compact />
        </div>
      </section>
      <Footer />
    </div>
  )
}
