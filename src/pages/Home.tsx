import { Link } from 'react-router-dom'
import { Card, StatusBadge, Crest } from '../components/ui'
import { Header } from '../components/public/Header'
import { Footer } from '../components/public/Footer'
import { services } from '../data/services'

const categoryChips = ['Consulting', 'Funding', 'Property', 'Notary', 'Inspections', 'Admin']

export default function Home() {
  return (
    <div className="min-h-screen bg-navy-radial">
      <Header />

      {/* Hero */}
      <section className="container-pmv pt-20 pb-16 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex justify-center">
            <Crest size={104} />
          </div>
          <div className="mb-5 flex justify-center">
            <StatusBadge tone="gold">Professional Services &amp; Business Support</StatusBadge>
          </div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl">
            Professional support. <span className="text-gold">Wherever business takes you.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
            From consulting and funding to property management, mobile notary, and administrative support —
            Pinnacle Management Ventures connects you with the professional resources to move forward with
            confidence.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/contact" className="btn-gold">Request Service</Link>
            <Link to="/services" className="btn-outline">Explore Our Services</Link>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {categoryChips.map((c) => (
              <StatusBadge key={c} tone="slate">{c}</StatusBadge>
            ))}
          </div>
        </div>
      </section>

      {/* Start Your Journey */}
      <section id="services" className="container-pmv py-16">
        <div className="mb-10 text-center">
          <p className="eyebrow">Start Your Journey</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Choose your path to professional support</h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-300">
            Whatever your business needs, Pinnacle Management Ventures has a service designed to help you move
            forward. Select a tile below to learn more.
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
                <h3 className="text-lg font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-300">{s.shortDescription}</p>
                <span className="mt-4 inline-block text-sm font-medium text-gold">Learn more →</span>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Why */}
      <section id="why" className="container-pmv py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            ['One team, many services', 'Consulting to funding to property support, coordinated by people who know your account.'],
            ['Secure client portal', 'Encrypted messaging, document exchange, and status tracking — never sensitive data over email.'],
            ['Clear, compliant guidance', 'Straight answers and honest disclosures — no guarantees we can’t stand behind.'],
          ].map(([t, d]) => (
            <Card key={t}>
              <h3 className="text-lg font-semibold text-gold">{t}</h3>
              <p className="mt-2 text-sm text-slate-300">{d}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section id="contact" className="container-pmv py-16">
        <Card className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">Ready to Get Started?</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Let&rsquo;s find the right solution for your business</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">
            Whether you need consulting, funding, property management, or professional services, Pinnacle
            Management Ventures is ready to help you move forward.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/contact" className="btn-gold">Request Service</Link>
            <Link to="/contact" className="btn-outline">Schedule an Appointment</Link>
          </div>
        </Card>
      </section>

      <Footer />
    </div>
  )
}
