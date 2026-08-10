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
          kicker="Service Area"
          title="Remote support nationwide. On-site support in South Florida."
          subtitle="Availability depends on the service and the location. Contact us with the address or project details and we will confirm coverage."
        />

        <div className="mt-12 grid gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 md:grid-cols-2">
          <div className={`${panelCls} rounded-none border-0`}>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold/80">On-site</p>
            <h2 className="mt-3 text-xl font-semibold text-white">South Florida</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">Mobile notary, property inspections, document courier, and other field services are available in South Florida. Coverage varies by service and assignment.</p>
          </div>
          <div className={`${panelCls} rounded-none border-0`}>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-sky-300/80">Remote</p>
            <h2 className="mt-3 text-xl font-semibold text-white">Nationwide</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">Consulting, administrative support, funding support, and other remote services are available to clients throughout the United States.</p>
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-md border border-white/10 bg-navy-900/80 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-white"><MapPin className="h-4 w-4 text-gold" /><h2 className="font-semibold">South Florida coverage</h2></div>
              <p className="mt-1 text-sm text-slate-400">Use the map as a general reference. We confirm service availability for each address.</p>
            </div>
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Miami-Dade, Broward, Palm Beach</span>
          </div>
          <div className="relative h-[360px] w-full sm:h-[440px]">
            <iframe title="Pinnacle Management Ventures South Florida service area map" src={SOUTH_FLORIDA_MAP} className="absolute inset-0 h-full w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          </div>
          <div className="flex flex-col gap-2 border-t border-white/10 px-5 py-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>Primary on-site coverage is within the South Florida tri-county area.</span>
            <a href="https://www.openstreetmap.org/#map=9/26.1224/-80.1373" target="_blank" rel="noreferrer" className="font-medium text-gold transition hover:text-gold/80">Open larger map</a>
          </div>
        </div>
      </section>

      <CtaBand title="Need to confirm coverage?" body="Send us the location and a short description of what you need. We will confirm whether we can handle it." primary={{ to: '/contact', label: 'Contact Us' }} />
      <Footer />
    </div>
  )
}
