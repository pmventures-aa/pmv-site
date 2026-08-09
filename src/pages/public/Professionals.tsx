import { Link } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { Reveal } from '../../components/public/motion'
import { CtaBand, btnOutline, btnPrimary } from '../../components/public/ui'
import { Icon, type IconName } from '../../components/kit/Icon'
import { usePageMeta } from '../../lib/usePageMeta'

const VENDOR_SIGNUP = 'https://hq.pinnaclemanagementventures.com/vendor-signup'

const providerGroups: { icon: IconName; title: string; body: string }[] = [
  { icon: 'briefcase', title: 'Legal & compliance professionals', body: 'Attorneys and other qualified legal or compliance professionals for matters that require licensed or specialized support.' },
  { icon: 'reports', title: 'Accounting & financial professionals', body: 'Accountants, bookkeepers, tax professionals, funding partners, lenders, and financial specialists.' },
  { icon: 'building', title: 'Property & field professionals', body: 'Property managers, inspectors, contractors, trades, repair vendors, photographers, and dependable local field support.' },
  { icon: 'services', title: 'Technology & operations specialists', body: 'POS, payments, implementations, integrations, systems, training, and other business operations expertise.' },
  { icon: 'file', title: 'Mobile & document providers', body: 'Notaries, couriers, document runners, signing professionals, and other time-sensitive mobile services.' },
  { icon: 'team', title: 'Other specialized professionals', body: 'If your work helps a business or property owner solve a defined need, Pinnacle can review whether it fits the network.' },
]

const vetting = [
  ['Professional fit', 'We learn what you actually do, where you work, the type of assignments you accept, and where your expertise stops.'],
  ['Qualifications', 'Licensing, insurance, credentials, experience, references, work samples, or other verification may be requested when relevant to the service.'],
  ['Reliability & communication', 'Providers are expected to communicate clearly, protect client information, meet agreed timelines, and raise problems early.'],
  ['Assignment-by-assignment scope', 'Joining the network does not automatically expose client information or create open-ended access. Work is assigned with a defined scope and only the access needed for that assignment.'],
]

export default function Professionals() {
  usePageMeta('Professional Provider Network', 'Apply to join Pinnacle Management Ventures as a vetted professional vendor or service provider.')
  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <main>
        <section className="container-pmv py-16 sm:py-20">
          <Reveal className="grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
            <div>
              <p className="eyebrow">Pinnacle Professional Network</p>
              <h1 className="mt-4 max-w-3xl font-display text-4xl font-medium leading-[1.08] text-white sm:text-6xl">Good client service sometimes means bringing in the right professional.</h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">Pinnacle maintains a network of independent professionals and service providers we can call on when a client engagement needs outside expertise, local field work, licensed support, or an extra set of capable hands.</p>
              <div className="mt-8 flex flex-wrap gap-3"><a href={VENDOR_SIGNUP} className={btnPrimary}>Apply to join the network</a><Link to="/contact" className={btnOutline}>Ask a provider question</Link></div>
            </div>
            <div className="border-l border-white/10 pl-6">
              <p className="text-sm font-semibold text-white">This is a professional network, not an employment offer.</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Approved providers may be invited to individual assignments when their expertise, location, availability, and qualifications fit a client need. Joining the network does not guarantee work volume.</p>
            </div>
          </Reveal>
        </section>

        <section className="border-y border-white/10 bg-navy-900/30">
          <div className="container-pmv grid gap-10 py-14 lg:grid-cols-[.8fr_1.2fr] lg:gap-16 sm:py-16">
            <Reveal>
              <p className="eyebrow">How assignments work</p>
              <h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">We dispatch work when there is a match.</h2>
              <p className="mt-4 text-sm leading-6 text-slate-300">Pinnacle coordinates the client relationship. When a defined need calls for a network professional, we can identify an appropriate provider, confirm availability, share the authorized scope, and coordinate the work through Pinnacle.</p>
            </Reveal>
            <Reveal className="divide-y divide-white/10 border-y border-white/10">
              {[
                ['01', 'A client need is identified', 'Pinnacle determines what the engagement requires and whether an outside professional is appropriate.'],
                ['02', 'A qualified provider is matched', 'We consider specialty, service area, qualifications, availability, and the scope of the assignment.'],
                ['03', 'You review the assignment', 'The provider receives the relevant scope and can confirm whether they are available and able to take it on.'],
                ['04', 'The work stays coordinated', 'Pinnacle keeps the client, provider, documents, tasks, and follow-up connected so the engagement does not disappear into separate inboxes.'],
              ].map(([number, title, body]) => <div key={number} className="grid gap-3 py-5 sm:grid-cols-[48px_1fr]"><span className="text-xs font-semibold text-gold">{number}</span><div><h3 className="font-semibold text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{body}</p></div></div>)}
            </Reveal>
          </div>
        </section>

        <section className="container-pmv py-14 sm:py-16">
          <Reveal className="max-w-3xl"><p className="eyebrow">A vetted network</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Approval is more than filling out a form.</h2><p className="mt-4 text-slate-300">Clients are trusting Pinnacle to coordinate people around sensitive business, property, financial, and operational needs. We treat provider access accordingly.</p></Reveal>
          <div className="mt-8 grid gap-x-10 border-y border-white/10 md:grid-cols-2">
            {vetting.map(([title, body], index) => <Reveal key={title} className={`py-6 ${index < 2 ? 'md:border-b md:border-white/10' : ''}`}><h3 className="text-base font-semibold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{body}</p></Reveal>)}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">The exact review depends on the service being offered. Pinnacle may request additional documentation or verification before approving a provider or assigning certain work.</p>
        </section>

        <section className="border-y border-white/10 bg-navy-900/30">
          <div className="container-pmv py-14 sm:py-16">
            <Reveal className="max-w-2xl"><p className="eyebrow">Professionals we build relationships with</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Expertise around the client, without pretending one company does everything.</h2></Reveal>
            <div className="mt-8 grid gap-x-10 md:grid-cols-2 xl:grid-cols-3">
              {providerGroups.map((group) => <Reveal key={group.title} className="border-t border-white/10 py-5"><div className="flex items-start gap-3"><span className="mt-0.5 text-gold"><Icon name={group.icon} size={18} /></span><div><h3 className="font-semibold text-white">{group.title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{group.body}</p></div></div></Reveal>)}
            </div>
          </div>
        </section>

        <section className="container-pmv py-14 sm:py-16">
          <Reveal className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
            <div><p className="eyebrow">Provider onboarding</p><h2 className="mt-3 font-display text-3xl font-medium text-white">Apply once. Keep your profile ready for the right opportunity.</h2></div>
            <div className="divide-y divide-white/10 border-y border-white/10">
              {[
                ['Apply', 'Tell us about your professional services, company, service area, and contact information.'],
                ['Review', 'Pinnacle reviews the fit and may request service-specific qualifications or verification.'],
                ['Approval', 'Approved professionals receive access appropriate to their role. Client access is assignment-specific, not automatic.'],
                ['Assignment', 'When a client need matches, Pinnacle can send the assignment, coordinate scope, and keep follow-up in one place.'],
              ].map(([title, body]) => <div key={title} className="py-4"><h3 className="text-sm font-semibold text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{body}</p></div>)}
            </div>
          </Reveal>
        </section>

        <section className="container-pmv pb-14 sm:pb-16">
          <Reveal className="border-l-2 border-gold bg-white/[0.02] px-6 py-5"><p className="eyebrow">Already invited?</p><h2 className="mt-2 text-xl font-semibold text-white">Use the private link Pinnacle sent you.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Individual provider invitations connect your application to the person or opportunity we already discussed and expire after 24 hours. Use that link instead of creating a separate application.</p></Reveal>
        </section>

        <CtaBand title="Interested in joining the professional network?" body="Tell Pinnacle what you do and where you work. We’ll review the relationship before any provider receives client assignments or access." primary={{ to: VENDOR_SIGNUP, label: 'Start Provider Application' }} secondary={{ to: '/contact', label: 'Contact Pinnacle' }} />
      </main>
      <Footer />
    </div>
  )
}
