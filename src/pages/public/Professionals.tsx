import { Link } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { Reveal } from '../../components/public/motion'
import { CtaBand, btnOutline, btnPrimary } from '../../components/public/ui'
import { Icon, type IconName } from '../../components/kit/Icon'
import { usePageMeta } from '../../lib/usePageMeta'

const VENDOR_SIGNUP = 'https://hq.pinnaclemanagementventures.com/vendor-signup'

const providerGroups: { icon: IconName; title: string; body: string }[] = [
  { icon: 'briefcase', title: 'Attorneys & legal professionals', body: 'Licensed attorneys, paralegal support, process-related providers, and other legal professionals available for properly scoped client needs.' },
  { icon: 'reports', title: 'Accounting & financial professionals', body: 'Accountants, bookkeepers, tax professionals, funding partners, lenders, and financial specialists.' },
  { icon: 'building', title: 'Property & field professionals', body: 'Property managers, inspectors, contractors, trades, repair vendors, photographers, and local field support.' },
  { icon: 'services', title: 'Technology & operations specialists', body: 'POS, payments, implementation, integrations, systems, training, and other business operations specialists.' },
  { icon: 'file', title: 'Mobile & document providers', body: 'Notaries, couriers, document runners, signing professionals, and other time-sensitive mobile service providers.' },
  { icon: 'team', title: 'Other trusted specialists', body: 'If your professional service helps businesses or property owners solve a defined need, Pinnacle can review your fit for the provider network.' },
]

export default function Professionals() {
  usePageMeta('Professional Provider Network', 'Apply to join Pinnacle Management Ventures as a professional vendor or service provider.')
  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <main>
        <section className="container-pmv relative overflow-hidden pb-14 pt-16 sm:pb-20 sm:pt-24">
          <div aria-hidden className="pointer-events-none absolute right-0 top-8 h-72 w-72 rounded-full bg-gold/[0.07] blur-3xl" />
          <Reveal className="relative max-w-4xl">
            <p className="eyebrow">Pinnacle Professional Network</p>
            <h1 className="mt-4 font-display text-4xl font-medium leading-tight text-white sm:text-6xl">Bring your expertise into the work when clients need it.</h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-300">Pinnacle works with independent professionals and service providers across business operations, property support, legal coordination, finance, technology, and mobile services. Provider onboarding gives us a consistent way to review qualifications, define scope, and assign work when there is a fit.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={VENDOR_SIGNUP} className={btnPrimary}>Apply to work with Pinnacle</a>
              <Link to="/contact" className={btnOutline}>Ask a provider question</Link>
            </div>
          </Reveal>
        </section>

        <section className="border-y border-white/10 bg-navy-900/30">
          <div className="container-pmv py-14 sm:py-16">
            <Reveal className="max-w-2xl">
              <p className="eyebrow">Professionals we may need</p>
              <h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">A flexible network around the client.</h2>
              <p className="mt-4 text-slate-300">This is not a promise of volume or employment. It is a structured way for Pinnacle to know who is available, what they are qualified to do, and how to engage them when client work calls for outside expertise.</p>
            </Reveal>
            <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {providerGroups.map((group) => (
                <Reveal key={group.title} className="group rounded-2xl border border-white/10 bg-white/[0.025] p-5 transition duration-300 hover:-translate-y-1 hover:border-gold/30 hover:bg-white/[0.04]">
                  <div className="grid h-10 w-10 place-items-center rounded-xl border border-gold/20 bg-gold/[0.07] text-gold"><Icon name={group.icon} size={19} /></div>
                  <h3 className="mt-4 text-base font-semibold text-white">{group.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{group.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="container-pmv py-14 sm:py-16">
          <Reveal>
            <p className="eyebrow">Provider onboarding</p>
            <h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">What happens after you apply</h2>
          </Reveal>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {[
              ['01', 'Apply', 'Tell us who you are, your company, what you provide, and how to reach you.'],
              ['02', 'Pinnacle reviews', 'We review the provider category and determine whether there is a current or future fit.'],
              ['03', 'Access is approved', 'Approved providers receive access appropriate to their role. Access is limited to the work and clients assigned to them.'],
              ['04', 'Work is coordinated', 'When a need is assigned, Pinnacle can coordinate scope, client access, tasks, documents, and follow-up in one place.'],
            ].map(([number, title, body]) => (
              <div key={number} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
                <p className="text-xs font-bold tracking-[.18em] text-gold">{number}</p>
                <h3 className="mt-3 font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="container-pmv pb-14 sm:pb-16">
          <Reveal className="rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/[0.08] to-transparent p-6 sm:p-8">
            <p className="eyebrow">Invited by Pinnacle?</p>
            <h2 className="mt-2 font-display text-2xl font-medium text-white">Use the private invitation in your email.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">Pinnacle can send individual provider invitations that prefill your onboarding information and expire after 24 hours. If you received one, open that private link rather than starting a separate application so your invitation status stays connected to your onboarding record.</p>
          </Reveal>
        </section>

        <CtaBand title="Interested in joining the provider network?" body="Apply once so Pinnacle can review your professional services and keep the right information ready when a client need matches your expertise." primary={{ to: VENDOR_SIGNUP, label: 'Start Provider Application' }} secondary={{ to: '/contact', label: 'Contact Pinnacle' }} />
      </main>
      <Footer />
    </div>
  )
}
