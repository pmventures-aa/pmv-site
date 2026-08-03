import { CtaBand, PageIntro, panelCls } from '../../components/public/ui'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'

export default function ServiceArea() {
  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <section className="container-pmv py-16">
        <PageIntro
          kicker="Where we work"
          title="Service Area"
          subtitle="Pinnacle Management Ventures supports clients nationwide, with on-site services available in South Florida."
        />

        <div className="mt-12 grid gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 md:grid-cols-2">
          <div className={`${panelCls} rounded-none border-0`}>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold/80">On-site</p>
            <h2 className="mt-3 text-xl font-semibold text-white">South Florida</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Mobile notary, property inspections, document courier, and in-person property management support
              are available on-site throughout South Florida. Exact coverage and scheduling depend on the
              service — contact us to confirm availability for your address.
            </p>
          </div>
          <div className={`${panelCls} rounded-none border-0`}>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-sky-300/80">Remote</p>
            <h2 className="mt-3 text-xl font-semibold text-white">Nationwide</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Consulting, funding &amp; capital support, and administrative services are available remotely to
              clients anywhere in the country through the secure client portal, phone, and video.
            </p>
          </div>
        </div>
      </section>

      <CtaBand
        title="Not sure if we cover your area or service need?"
        body="Tell us where you are and what you need — we’ll confirm coverage and the right next step."
        primary={{ to: '/contact', label: 'Ask us' }}
      />
      <Footer />
    </div>
  )
}
