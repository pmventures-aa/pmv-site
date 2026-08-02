import { Link } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { Card, StatusBadge } from '../../components/ui'

export default function ServiceArea() {
  return (
    <div className="min-h-screen bg-navy-radial">
      <Header />
      <section className="container-pmv py-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">Where we work</p>
          <h1 className="mt-2 text-4xl font-bold text-white">Service Area</h1>
          <p className="mt-5 text-lg text-slate-300">
            Pinnacle Management Ventures supports clients nationwide, with on-site services available in South
            Florida.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <Card>
            <StatusBadge tone="gold">On-site</StatusBadge>
            <h2 className="mt-3 text-xl font-semibold text-white">South Florida</h2>
            <p className="mt-2 text-sm text-slate-300">
              Mobile notary, property inspections, document courier, and in-person property management support
              are available on-site throughout South Florida. Exact coverage and scheduling depend on the
              service — contact us to confirm availability for your address.
            </p>
          </Card>
          <Card>
            <StatusBadge tone="blue">Remote</StatusBadge>
            <h2 className="mt-3 text-xl font-semibold text-white">Nationwide</h2>
            <p className="mt-2 text-sm text-slate-300">
              Consulting, funding &amp; capital support, and administrative services are available remotely to
              clients anywhere in the country through the secure client portal, phone, and video.
            </p>
          </Card>
        </div>

        <Card className="mx-auto mt-12 max-w-2xl text-center">
          <p className="text-slate-300">Not sure if we cover your area or service need?</p>
          <div className="mt-4">
            <Link to="/contact" className="btn-gold">Ask us</Link>
          </div>
        </Card>
      </section>
      <Footer />
    </div>
  )
}
