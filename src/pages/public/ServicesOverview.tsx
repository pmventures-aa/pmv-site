import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { btnPrimary, PageIntro, ServiceList, SplitFeatures } from '../../components/public/ui'
import { Reveal } from '../../components/public/motion'
import { BrandMark3D } from '../../components/ui'
import { services } from '../../data/services'
import { usePageMeta } from '../../lib/usePageMeta'

const CLIENT_SIGNUP = 'https://secure.pinnaclemanagementventures.com/signup?source=services-overview'

export default function ServicesOverview() {
  usePageMeta('Professional Services','Business consulting, POS and payment technology transition support, administrative operations, funding guidance, property support, and mobile professional services.')
  const professionalServices = services.slice(0, 4)
  const supportingServices = services.slice(4)
  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <section className="pmv-hero-story relative overflow-hidden border-b border-white/10"><div className="pmv-hero-gold" aria-hidden="true"/><div className="container-pmv grid gap-10 py-16 sm:py-20 lg:grid-cols-[1fr_.72fr] lg:items-center"><PageIntro kicker="Professional Services" title="Start with what needs to happen." subtitle="You do not need to diagnose the service before you contact us. Tell us what needs to be handled, changed, coordinated, or moved forward and we can help define the right scope."/><Reveal className="relative flex min-h-[250px] items-center justify-center"><BrandMark3D size={175} decorative/><div className="absolute bottom-2 right-0 max-w-[230px] border-l-2 border-gold/50 bg-navy-950/75 p-3 text-xs leading-5 text-slate-300 backdrop-blur">One-time tasks, projects, consulting, transitions, and ongoing support can all begin with the same conversation.</div></Reveal></div></section>

      <section className="container-pmv py-16">
        <div>
          <Reveal className="max-w-2xl"><p className="eyebrow">Business &amp; Consulting</p><h2 className="mt-3 font-display text-2xl font-medium text-white sm:text-3xl">Projects, systems, transitions, and ongoing operations</h2></Reveal>
          <div className="mt-8"><ServiceList items={professionalServices} /></div>
        </div>

        <div className="pmv-gold-band mt-16 border-y border-gold/15 px-0 py-10">
          <Reveal><p className="eyebrow">Ways to work with us</p><div className="mt-8"><SplitFeatures items={[
            ['One-time support', 'A specific task or short project with a defined outcome.'],
            ['Project support', 'Hands-on coordination for an implementation, transition, operational project, or multi-step initiative.'],
            ['Ongoing support', 'Continued consulting and coordination when the work requires regular follow-up.'],
          ]} /></div></Reveal>
        </div>

        <div className="mt-16">
          <Reveal className="max-w-2xl"><p className="eyebrow">Property &amp; Mobile Services</p><h2 className="mt-3 font-display text-2xl font-medium text-white sm:text-3xl">On-site help for work that cannot be handled from a desk</h2><p className="mt-4 text-slate-300">These services can stand alone or support a broader consulting, property, or operational engagement.</p></Reveal>
          <div className="mt-8"><ServiceList items={supportingServices} /></div>
        </div>

        <Reveal className="mt-16 flex flex-col items-start justify-between gap-5 border-t border-gold/20 pt-10 sm:flex-row sm:items-center"><div className="max-w-xl"><h2 className="font-display text-2xl font-medium text-white">Not sure which service fits?</h2><p className="mt-2 text-sm leading-relaxed text-slate-300">That is exactly what the first conversation is for. Tell us what is happening, what is taking too much time, or what outcome you need.</p></div><a href={CLIENT_SIGNUP} className={btnPrimary}>Tell Us What You Need</a></Reveal>
      </section>
      <Footer />
    </div>
  )
}
