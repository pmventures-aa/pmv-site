import { MapPin } from 'lucide-react'
import { CtaBand, PageIntro, panelCls } from '../../components/public/ui'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { usePageMeta } from '../../lib/usePageMeta'

const SOUTH_FLORIDA_MAP = 'https://www.openstreetmap.org/export/embed.html?bbox=-80.55%2C25.45%2C-79.85%2C26.95&layer=mapnik&marker=26.1224%2C-80.1373'

export default function ServiceArea() {
  usePageMeta('Service Area', 'Pinnacle Management Ventures supports clients nationwide, with on-site services available in South Florida.')
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

        <div className="mt-8 overflow-hidden rounded-md border border-white/10 bg-navy-900/80 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-white">
                <MapPin className="h-4 w-4 text-gold" />
                <h2 className="font-semibold">South Florida On-Site Coverage</h2>
              </div>
              <p className="mt-1 text-sm text-slate-400">Pan and zoom to explore the region. Service availability is confirmed by address.</p>
            </div>
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Miami-Dade · Broward · Palm Beach</span>
          </div>
          <div className="relative h-[360px] w-full sm:h-[440px]">
            <iframe
              title="Pinnacle Management Ventures South Florida service area map"
              src={SOUTH_FLORIDA_MAP}
              className="absolute inset-0 h-full w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div className="flex flex-col gap-2 border-t border-white/10 px-5 py-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>On-site coverage is centered across the South Florida tri-county area.</span>
            <a
              href="https://www.openstreetmap.org/#map=9/26.1224/-80.1373"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-gold transition hover:text-gold/80"
            >
              Open larger map →
            </a>
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
