import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { btnPrimary, PageIntro, ServiceList, SplitFeatures } from '../../components/public/ui'
import { Reveal } from '../../components/public/motion'
import { services } from '../../data/services'
import { usePageMeta } from '../../lib/usePageMeta'

const CLIENT_SIGNUP = 'https://secure.pinnaclemanagementventures.com/signup?source=services-overview'

export default function ServicesOverview() {
  usePageMeta(
    'Professional Services',
    'Business consulting, POS and payment technology transition support, administrative operations, funding guidance, property support, and mobile professional services.',
  )

  const professionalServices = services.slice(0, 4)
  const supportingServices = services.slice(4)

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <section className="container-pmv py-16">
        <PageIntro
          kicker="Professional Services"
          title="Support for business, property, and operational work"
          subtitle="Tell us what needs to be handled. We can help define the scope, coordinate the right people, and stay involved until the work is complete."
        />

        <div className="mt-12">
          <Reveal className="max-w-2xl">
            <p className="eyebrow">Business &amp; Consulting</p>
            <h2 className="mt-3 font-display text-2xl font-medium text-white sm:text-3xl">Projects, systems, transitions, and ongoing operations</h2>
          </Reveal>
          <div className="mt-8"><ServiceList items={professionalServices} /></div>
        </div>

        <div className="mt-16 border-y border-white/10 py-10">
          <Reveal>
            <p className="eyebrow">Ways to work with us</p>
            <div className="mt-8"><SplitFeatures items={[
              ['One-time support', 'A specific task or short project with a defined outcome.'],
              ['Project support', 'Hands-on coordination for an implementation, transition, operational project, or multi-step initiative.'],
              ['Ongoing support', 'Continued consulting and coordination when the work requires regular follow-up.'],
            ]} /></div>
          </Reveal>
        </div>

        <div className="mt-16">
          <Reveal className="max-w-2xl">
            <p className="eyebrow">Property &amp; Mobile Services</p>
            <h2 className="mt-3 font-display text-2xl font-medium text-white sm:text-3xl">On-site help for work that cannot be handled from a desk</h2>
            <p className="mt-4 text-slate-300">These services can be used on their own or as part of a larger Pinnacle engagement.</p>
          </Reveal>
          <div className="mt-8"><ServiceList items={supportingServices} /></div>
        </div>

        <Reveal className="mt-16 flex flex-col items-start justify-between gap-5 border-t border-white/10 pt-10 sm:flex-row sm:items-center">
          <div className="max-w-xl">
            <h2 className="font-display text-2xl font-medium text-white">Not sure which service fits?</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">That is completely fine. Tell us what is happening and what you need to accomplish. We can help determine the right service and scope.</p>
          </div>
          <a href={CLIENT_SIGNUP} className={btnPrimary}>Get Started</a>
        </Reveal>
      </section>
      <Footer />
    </div>
  )
}
