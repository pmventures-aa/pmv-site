import { Link } from 'react-router-dom'
import { Header } from '../components/public/Header'
import { Footer } from '../components/public/Footer'
import { btnOutline, btnPrimary, CtaBand, ServiceList, SplitFeatures } from '../components/public/ui'
import { services } from '../data/services'

const categories = ['Consulting', 'Funding', 'Property', 'Notary', 'Inspections', 'Admin']

export default function Home() {
  return (
    <div className="min-h-screen bg-navy-950">
      <Header />

      {/* Hero */}
      <section className="container-pmv pt-16 pb-20 sm:pt-24">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-start lg:gap-16">
          <div>
            <p className="eyebrow">Professional Services &amp; Business Support</p>
            <h1 className="mt-4 font-display text-5xl font-medium leading-[1.05] tracking-tight text-white sm:text-6xl">
              Professional support.
              <br />
              <span className="italic text-gold">Wherever business takes&nbsp;you.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
              From consulting and funding to property management, mobile notary, and administrative support —
              Pinnacle Management Ventures connects you with the professional resources to move forward with
              confidence.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/contact" className={btnPrimary}>Request Service</Link>
              <Link to="/services" className={btnOutline}>Explore Our Services</Link>
            </div>
            <p className="mt-8 text-sm text-slate-500">
              {categories.join(' · ')}
            </p>
          </div>

          <div className="rounded-md border border-white/10 bg-white/[0.03] p-7">
            <p className="eyebrow">What we help with</p>
            <ul className="mt-4 divide-y divide-white/10">
              {categories.map((c) => (
                <li key={c} className="py-2.5 text-sm text-slate-300">{c}</li>
              ))}
            </ul>
            <Link to="/services" className="mt-5 inline-block text-sm font-medium text-gold hover:underline">
              View all services →
            </Link>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="container-pmv py-16">
        <div className="max-w-2xl">
          <p className="eyebrow">Start Your Journey</p>
          <h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">
            Choose your path to professional support
          </h2>
          <p className="mt-4 text-slate-300">
            Whatever your business needs, Pinnacle Management Ventures has a service designed to help you move
            forward.
          </p>
        </div>
        <div className="mt-10">
          <ServiceList items={services} />
        </div>
      </section>

      {/* Why */}
      <section id="why" className="container-pmv py-16">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl font-medium text-white sm:text-4xl">Why Pinnacle</h2>
        </div>
        <div className="mt-10">
          <SplitFeatures
            items={[
              ['One team, many services', 'Consulting to funding to property support, coordinated by people who know your account.'],
              ['Secure client portal', 'Encrypted messaging, document exchange, and status tracking — never sensitive data over email.'],
              ['Clear, compliant guidance', 'Straight answers and honest disclosures — no guarantees we can’t stand behind.'],
            ]}
          />
        </div>
      </section>

      <CtaBand
        title="Let's find the right solution for your business"
        body="Whether you need consulting, funding, property management, or professional services, Pinnacle Management Ventures is ready to help you move forward."
        primary={{ to: '/contact', label: 'Request Service' }}
        secondary={{ to: '/contact', label: 'Schedule an Appointment' }}
      />

      {/* Staff access */}
      <section className="border-b border-white/10">
        <div className="container-pmv flex flex-col items-center justify-between gap-3 py-6 text-sm text-slate-400 sm:flex-row">
          <span>Pinnacle team member?</span>
          <a
            href="https://hq.pinnaclemanagementventures.com/login"
            className="inline-flex items-center gap-1.5 font-medium text-gold hover:underline"
          >
            Agent / Employee Login →
          </a>
        </div>
      </section>

      <Footer />
    </div>
  )
}
