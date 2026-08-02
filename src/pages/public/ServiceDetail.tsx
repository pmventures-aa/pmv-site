import { Link, Navigate, useParams } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { Card, StatusBadge } from '../../components/ui'
import { getServiceBySlug, services } from '../../data/services'

export default function ServiceDetail() {
  const { slug } = useParams<{ slug: string }>()
  const service = getServiceBySlug(slug)

  if (!service) return <Navigate to="/services" replace />

  const others = services.filter((s) => s.slug !== service.slug).slice(0, 3)

  return (
    <div className="min-h-screen bg-navy-radial">
      <Header />
      <section className="container-pmv py-16">
        <Link to="/services" className="text-sm text-slate-400 hover:text-gold">
          ← All services
        </Link>
        <div className="mt-4 flex items-center gap-2">
          {service.popular && <StatusBadge tone="gold">Popular</StatusBadge>}
          <StatusBadge tone="slate">{service.tag}</StatusBadge>
        </div>
        <h1 className="mt-3 text-4xl font-bold text-white">{service.title}</h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-300">{service.heroDescription}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/contact" className="btn-gold">Request this service</Link>
          <a href="tel:+15613887879" className="btn-outline">Call (561) 388-7879</a>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="text-lg font-semibold text-white">What&rsquo;s included</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              {service.highlights.map((h) => (
                <li key={h} className="flex gap-3">
                  <span className="text-gold">✓</span>
                  {h}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold text-white">Ideal for</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              {service.idealFor.map((h) => (
                <li key={h} className="flex gap-3">
                  <span className="text-gold">•</span>
                  {h}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="mt-16">
          <p className="eyebrow mb-4">Other services</p>
          <div className="grid gap-5 sm:grid-cols-3">
            {others.map((s) => (
              <Link key={s.slug} to={`/services/${s.slug}`}>
                <Card className="h-full transition hover:border-gold/40">
                  <StatusBadge tone="slate">{s.tag}</StatusBadge>
                  <h3 className="mt-3 text-base font-semibold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm text-slate-400">{s.shortDescription}</p>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  )
}
