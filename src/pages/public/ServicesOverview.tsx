import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { btnPrimary, PageIntro, ServiceList, SplitFeatures } from '../../components/public/ui'
import { Reveal } from '../../components/public/motion'
import { services } from '../../data/services'
import { usePageMeta } from '../../lib/usePageMeta'

const CLIENT_SIGNUP = 'https://client.pinnaclemanagementventures.com/signup?source=services-overview'

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
          title="Support built around the work in front of you"
          subtitle="Bring us the situation, project, or transition. Pinnacle can help organize the work, coordinate the people involved, and build the right level of support around what needs to happen next."
        />

        <div className="mt-12">
          <Reveal className="max-w-2xl">
            <p className="eyebrow">Business &amp; Consulting</p>
            <h2 className="mt-3 font-display text-2xl font-medium text-white sm:text-3xl">Professional support for projects, systems, and operations</h2>
          </Reveal>
          <div className="mt-8"><ServiceList items={professionalServices} /></div>
        </div>

        <div className="mt-16 border-y border-white/10 py-10">
          <Reveal>
            <p className="eyebrow">How we can engage</p>
            <div className="mt-8"><SplitFeatures items={[
              ['One-time support', 'A defined professional task or short-term need with a clear outcome.'],
              ['Project consulting', 'Scoped support for a transition, implementation, operational initiative, or multi-step project.'],
              ['Ongoing advisory', 'Continued coordination and professional support when the work does not stop after launch.'],
            ]} /></div>
          </Reveal>
        </div>

        <div className="mt-16">
          <Reveal className="max-w-2xl">
            <p className="eyebrow">Additional Services</p>
            <h2 className="mt-3 font-display text-2xl font-medium text-white sm:text-3xl">Property, field, and mobile support</h2>
            <p className="mt-4 text-slate-300">These services can stand alone or support a broader Pinnacle engagement.</p>
          </Reveal>
          <div className="mt-8"><ServiceList items={supportingServices} /></div>
        </div>

        <Reveal className="mt-16 flex flex-col items-start justify-between gap-5 border-t border-white/10 pt-10 sm:flex-row sm:items-center">
          <div className="max-w-xl">
            <h2 className="font-display text-2xl font-medium text-white">Not sure what to call the problem?</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">That is fine. Start an account with the basics, then tell us what is happening in plain language. We’ll help map the right next step from inside your portal.</p>
          </div>
          <a href={CLIENT_SIGNUP} className={btnPrimary}>Start My Pinnacle Journey</a>
        </Reveal>
      </section>
      <Footer />
    </div>
  )
}
