import { Card, StatusBadge, Logo, Crest } from '../components/ui'

const services = [
  { t: 'Business Formation', d: 'Entity setup, EIN, registered agent, and ongoing compliance calendars.', tag: 'Formation' },
  { t: 'Compliance & Licensing', d: 'Annual reports, franchise tax, and license renewals tracked and filed.', tag: 'Compliance' },
  { t: 'Tax Preparation', d: 'Returns, organizers, and IRS/state notice resolution by qualified professionals.', tag: 'Tax' },
  { t: 'Bookkeeping', d: 'Monthly close, financial statements, and clean books you can rely on.', tag: 'Accounting' },
  { t: 'Funding Assistance', d: 'Readiness review and referrals to independent third-party lenders.', tag: 'Capital' },
  { t: 'Property Support', d: 'Owner statements, work orders, and lease management where licensed.', tag: 'Property' },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-navy-radial">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-navy-950/70 backdrop-blur">
        <div className="container-pmv flex h-16 items-center justify-between">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
            <a href="#services" className="hover:text-gold">Services</a>
            <a href="#why" className="hover:text-gold">Why Pinnacle</a>
            <a href="#contact" className="hover:text-gold">Contact</a>
          </nav>
          <div className="flex items-center gap-3">
            <a href="https://client.pinnaclemanagementventures.com/login" className="btn-outline hidden sm:inline-flex">Client Portal</a>
            <a href="#contact" className="btn-gold">Get Started</a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container-pmv pt-20 pb-16 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex justify-center"><Crest size={104} /></div>
          <div className="mb-5 flex justify-center"><StatusBadge tone="gold">Trusted business management partner</StatusBadge></div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl">
            Building stronger businesses and creating <span className="text-gold">lasting value</span>.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
            Pinnacle Management Ventures brings formation, compliance, tax, bookkeeping, funding, and
            property support under one secure roof — with a client portal built for how you actually work.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="#contact" className="btn-gold">Book a consultation</a>
            <a href="https://client.pinnaclemanagementventures.com/login" className="btn-outline">Enter client portal</a>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="container-pmv py-16">
        <div className="mb-10 text-center">
          <p className="eyebrow">What we do</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Services under one roof</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <Card key={s.t} className="transition hover:border-gold/40">
              <div className="mb-3"><StatusBadge tone="gold">{s.tag}</StatusBadge></div>
              <h3 className="text-lg font-semibold text-white">{s.t}</h3>
              <p className="mt-2 text-sm text-slate-300">{s.d}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Why */}
      <section id="why" className="container-pmv py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            ['Secure client portal', 'Encrypted document exchange, e-signature, and messaging — never sensitive data over email.'],
            ['One team, many services', 'Formation to funding, coordinated by a single representative who knows your account.'],
            ['Clear, compliant guidance', 'Straight answers and honest disclosures — no guarantees we can’t stand behind.'],
          ].map(([t, d]) => (
            <Card key={t}>
              <h3 className="text-lg font-semibold text-gold">{t}</h3>
              <p className="mt-2 text-sm text-slate-300">{d}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Contact / CTA */}
      <section id="contact" className="container-pmv py-16">
        <Card className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">Get started</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Let&rsquo;s talk about your business</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">
            Tell us what you need and we&rsquo;ll map the right services and next steps.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a href="mailto:support@pinnaclemanagementventures.com" className="btn-gold">Email us</a>
            <a href="https://client.pinnaclemanagementventures.com/login" className="btn-outline">Client login</a>
          </div>
        </Card>
      </section>

      {/* Footer + disclosures */}
      <footer className="border-t border-white/5 bg-navy-950/60">
        <div className="container-pmv py-10">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <Logo />
            <div className="text-sm text-slate-400">
              &copy; {new Date().getFullYear()} Pinnacle Management Ventures. All rights reserved.
            </div>
          </div>
          <p className="mt-6 text-xs leading-relaxed text-slate-500">
            Pinnacle Management Ventures is not a law firm and does not provide legal advice; document-support
            services are not legal representation unless delivered through an independently licensed attorney.
            Tax services may be provided by accountants, Enrolled Agents, or other qualified professionals.
            Funding assistance may involve referrals to independent third-party lenders who alone determine
            approval, rates, and terms; no outcome is guaranteed. Property services are offered where licensed.
          </p>
        </div>
      </footer>
    </div>
  )
}
