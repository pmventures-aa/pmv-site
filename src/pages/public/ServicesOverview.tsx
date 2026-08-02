import { Link } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { Card, StatusBadge } from '../../components/ui'
import { services } from '../../data/services'

export default function ServicesOverview() {
  return (
    <div className="min-h-screen bg-navy-radial">
      <Header />
      <section className="container-pmv py-16">
        <div className="mb-10 text-center">
          <p className="eyebrow">What we do</p>
          <h1 className="mt-2 text-4xl font-bold text-white">Services</h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate-300">
            Professional support for businesses and property owners — pick a service below for details, or
            request service and we’ll help you map the right fit.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <Link key={s.slug} to={`/services/${s.slug}`}>
              <Card className="h-full transition hover:border-gold/40">
                <div className="mb-3 flex items-center gap-2">
                  {s.popular && <StatusBadge tone="gold">Popular</StatusBadge>}
                  <StatusBadge tone="slate">{s.tag}</StatusBadge>
                </div>
                <h2 className="text-lg font-semibold text-white">{s.title}</h2>
                <p className="mt-2 text-sm text-slate-300">{s.shortDescription}</p>
                <span className="mt-4 inline-block text-sm font-medium text-gold">Learn more →</span>
              </Card>
            </Link>
          ))}
        </div>
      </section>
      <Footer />
    </div>
  )
}
