import { Link } from 'react-router-dom'
import { Header } from '../components/public/Header'
import { Footer } from '../components/public/Footer'
import { btnOutline, btnPrimary, CtaBand } from '../components/public/ui'
import { Reveal } from '../components/public/motion'
import { services } from '../data/services'
import { usePageMeta } from '../lib/usePageMeta'
import { Icon, type IconName } from '../components/kit/Icon'
import { BrandMark3D } from '../components/ui'

const CLIENT_SIGNUP = 'https://secure.pinnaclemanagementventures.com/signup?source=home'

const ecosystem: { icon: IconName; title: string; body: string; to: string }[] = [
  { icon: 'briefcase', title: 'Business & Operations', body: 'Consulting, administrative support, project coordination, systems, vendor changes, and the work that keeps operations moving.', to: '/services/consulting' },
  { icon: 'building', title: 'Property & Field', body: 'Site visits, inspections, access coordination, documentation, vendor follow-through, and property support.', to: '/services/property-management' },
  { icon: 'services', title: 'Technology & Payments', body: 'POS, payment, software, data, training, and implementation transitions with someone accountable for the handoff.', to: '/services/merchant-services' },
  { icon: 'file', title: 'Documents & Mobile', body: 'Defined professional tasks including document runs, signing support, courier work, and mobile services.', to: '/services' },
]

const outcomes = [
  ['One relationship', 'Bring the next problem back to a team that already understands the context.'],
  ['Less vendor chaos', 'Fewer disconnected providers, missed follow-ups, and loose ends between people.'],
  ['Clear ownership', 'Know what is happening, who is responsible, and what the next step is.'],
  ['Support that scales', 'Use Pinnacle for one task, a project, a transition, or ongoing support.'],
]

const engagementTypes = [
  ['One-time project', 'A defined task, transition, property need, document run, or operational problem that needs to get done.'],
  ['Ongoing support', 'Recurring administrative, coordination, property, vendor, or operational work without adding another internal role.'],
  ['Consulting & strategy', 'Guidance before changing systems, providers, processes, payments, or other important parts of the business.'],
  ['Coordination & oversight', 'A single point of contact to keep people, documents, deadlines, and next steps moving together.'],
]

export default function Home() {
  usePageMeta('Home', 'Pinnacle Management Ventures provides professional business support, consulting, property services, project coordination, POS and payment technology transitions, and mobile services from South Florida.')

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <main>
        <section className="pmv-hero-story relative overflow-hidden border-b border-white/[.08]">
          <div className="pmv-hero-gold" aria-hidden="true" />
          <div className="container-pmv relative py-16 sm:py-20 lg:py-24 xl:py-28">
            <div className="grid gap-12 lg:grid-cols-[1.08fr_.92fr] lg:items-center">
              <Reveal>
                <div className="mb-6 flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[.15em] text-slate-400">
                  <span className="border-l-2 border-gold pl-3 text-gold">Professional Support. One Call Away.</span>
                  <span>South Florida based · Project support available nationwide</span>
                </div>
                <h1 className="max-w-5xl font-display text-5xl font-medium leading-[1.02] tracking-[-.035em] text-white sm:text-6xl lg:text-7xl xl:text-[5.4rem]">
                  A trusted place to bring the work that <span className="pmv-gold-text">needs to move.</span>
                </h1>
                <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">Pinnacle helps businesses, property owners, and organizations solve operational problems, coordinate the right resources, and keep projects moving without turning every new need into another vendor search.</p>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">You do not need to know the exact service name. Tell us what is happening, what is stalled, or what needs to change. We help define the work and stay involved until the next step is clear.</p>
                <div className="mt-9 flex flex-wrap gap-3"><a href={CLIENT_SIGNUP} className={btnPrimary}>Tell Us What You Need</a><Link to="/services" className={btnOutline}>Explore Services</Link></div>
                <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/10 pt-5 text-sm text-slate-400">
                  <span><strong className="text-white">Project</strong> support</span>
                  <span><strong className="text-white">Ongoing</strong> support</span>
                  <span><strong className="text-white">Consulting</strong> & transitions</span>
                  <span><strong className="text-white">Property</strong> & field work</span>
                </div>
              </Reveal>
              <Reveal className="relative flex min-h-[420px] items-center justify-center lg:justify-end">
                <div className="pmv-story-orbit" aria-hidden="true" />
                <BrandMark3D size={280} decorative className="relative z-10" />
                <div className="pmv-story-note pmv-story-note-a"><span>Problem</span><strong>Something needs attention</strong></div>
                <div className="pmv-story-note pmv-story-note-b"><span>Pinnacle</span><strong>Define · Coordinate · Follow through</strong></div>
                <div className="pmv-story-note pmv-story-note-c"><span>Outcome</span><strong>Work keeps moving</strong></div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="container-pmv py-16 sm:py-20">
          <Reveal className="grid gap-10 lg:grid-cols-[.78fr_1.22fr] lg:gap-16">
            <div>
              <p className="eyebrow">Why Pinnacle exists</p>
              <h2 className="mt-4 font-display text-3xl font-medium tracking-tight text-white sm:text-5xl">Running a business should not require a different relationship for every problem.</h2>
            </div>
            <div className="lg:pt-2">
              <p className="text-lg leading-8 text-slate-300">Business owners and property operators lose time coordinating providers, chasing updates, moving information between systems, and figuring out who should own the next step.</p>
              <p className="mt-5 text-base leading-7 text-slate-400">Pinnacle was built around a simpler idea: create one dependable relationship that can understand the situation, organize the work, bring in the right resources when needed, and stay accountable for the follow-through.</p>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">{outcomes.map(([title,body])=><div key={title} className="border-t border-gold/25 pt-4"><h3 className="font-semibold text-white">{title}</h3><p className="mt-1.5 text-sm leading-6 text-slate-400">{body}</p></div>)}</div>
            </div>
          </Reveal>
        </section>

        <section className="pmv-gold-band border-y border-gold/15">
          <div className="container-pmv py-16 sm:py-20">
            <Reveal className="max-w-3xl"><p className="eyebrow">The Pinnacle ecosystem</p><h2 className="mt-4 font-display text-3xl font-medium text-white sm:text-5xl">Different needs. One place to start.</h2><p className="mt-5 text-base leading-7 text-slate-300">Some situations need hands-on support. Others need a specialist, a project manager, or experienced guidance before a decision is made. Pinnacle helps connect those pieces without making the client manage the entire chain.</p></Reveal>
            <div className="mt-10 grid gap-px overflow-hidden border border-white/10 bg-white/10 md:grid-cols-2 lg:grid-cols-4">
              {ecosystem.map((item) => <Link key={item.title} to={item.to} className="group bg-navy-950/95 p-6 transition hover:bg-navy-900/95"><span className="text-gold"><Icon name={item.icon} size={22}/></span><h3 className="mt-5 font-display text-xl text-white group-hover:text-gold">{item.title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{item.body}</p><span className="mt-5 inline-block text-xs font-semibold uppercase tracking-[.12em] text-gold/80">Explore →</span></Link>)}
            </div>
            <Reveal className="mt-8 grid gap-6 border-t border-white/10 pt-7 lg:grid-cols-[.9fr_1.1fr]"><div><p className="text-sm font-semibold text-white">When specialized expertise is required, we coordinate with the right professional.</p></div><div><p className="text-sm leading-6 text-slate-400">Accountants, enrolled agents, paralegal support, property professionals, technology providers, and other specialists can be brought into the work when appropriate while Pinnacle keeps the broader engagement organized.</p><Link to="/professionals" className="mt-3 inline-block text-sm font-medium text-gold">How our professional network works →</Link></div></Reveal>
          </div>
        </section>

        <section className="container-pmv py-16 sm:py-20">
          <Reveal className="max-w-3xl"><p className="eyebrow">Ways to work with us</p><h2 className="mt-4 font-display text-3xl font-medium text-white sm:text-5xl">The relationship should fit the work.</h2><p className="mt-5 text-base leading-7 text-slate-400">Not every client needs a retainer, and not every problem is a one-time task. We define the engagement around what will actually help.</p></Reveal>
          <div className="mt-9 divide-y divide-white/10 border-y border-white/10">{engagementTypes.map(([title,body],i)=><Reveal key={title} className="grid gap-3 py-6 sm:grid-cols-[70px_220px_1fr]"><span className="font-display text-sm text-gold">0{i+1}</span><h3 className="font-semibold text-white">{title}</h3><p className="text-sm leading-6 text-slate-400">{body}</p></Reveal>)}</div>
        </section>

        <section className="border-y border-white/[.08] bg-navy-900/35">
          <div className="container-pmv py-16 sm:py-20">
            <Reveal className="grid gap-10 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
              <div><p className="eyebrow">How the work moves</p><h2 className="mt-4 font-display text-3xl font-medium text-white sm:text-5xl">From “I need help with this” to a clear next step.</h2><p className="mt-5 text-base leading-7 text-slate-400">You bring us the situation. We help turn it into a manageable scope with visible ownership and follow-through.</p></div>
              <div className="pmv-process-line">
                {[
                  ['01','Understand','What is happening, what matters, and what good looks like.'],
                  ['02','Define','The scope, resources, information, and responsibilities.'],
                  ['03','Coordinate','People, documents, systems, vendors, and deadlines.'],
                  ['04','Follow through','Keep the work moving and make the next step visible.'],
                ].map(([n,t,b])=><div key={n} className="pmv-process-step"><span>{n}</span><div><h3>{t}</h3><p>{b}</p></div></div>)}
              </div>
            </Reveal>
          </div>
        </section>

        <section className="container-pmv py-16 sm:py-20">
          <Reveal className="grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div className="relative min-h-[330px] overflow-hidden border border-gold/20 bg-navy-900/60 p-8">
              <div className="pmv-founder-glow" aria-hidden="true" />
              <BrandMark3D size={155} decorative className="relative" />
              <p className="relative mt-8 max-w-md font-display text-2xl leading-snug text-white">“Good support is not about having an answer for everything. It is about knowing how to move the right work forward.”</p>
            </div>
            <div><p className="eyebrow">Built from real operational work</p><h2 className="mt-4 font-display text-3xl font-medium text-white sm:text-5xl">Pinnacle grew from seeing the same friction over and over again.</h2><p className="mt-5 text-base leading-7 text-slate-300">Across business operations, client service, technology changes, property work, and vendor coordination, the pattern is familiar: capable people lose time because responsibility is fragmented.</p><p className="mt-4 text-base leading-7 text-slate-400">Pinnacle exists to make that middle space easier. We help define the work, keep context from getting lost, and create one relationship clients can return to when the next need shows up.</p><Link to="/about" className="mt-6 inline-block text-sm font-semibold text-gold">Read our story →</Link></div>
          </Reveal>
        </section>

        <section className="pmv-trust-strip border-y border-gold/15"><div className="container-pmv grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">{[
          ['South Florida','Local roots and field-service coverage'],
          ['Secure workspace','Messages, documents, billing, and active work'],
          ['Flexible engagement','Projects, retainers, consulting, and coordination'],
          ['Professional network','Specialized support when the scope requires it'],
        ].map(([a,b])=><div key={a}><strong className="font-display text-2xl text-white">{a}</strong><p className="mt-1 text-sm leading-6 text-slate-400">{b}</p></div>)}</div></section>

        <CtaBand title="What is taking more of your time than it should?" body="Tell us what needs attention. You do not need to diagnose the service before you reach out." primary={{ to: '/portal/signup', label: 'Tell Us What You Need' }} secondary={{ to: '/contact', label: 'Talk With Pinnacle' }} />
        <section className="border-b border-white/[.07]"><div className="container-pmv flex flex-col items-center justify-between gap-3 py-6 text-sm text-slate-400 sm:flex-row"><span>Already working with Pinnacle?</span><div className="flex flex-wrap items-center gap-4"><a href="https://secure.pinnaclemanagementventures.com/login" className="font-medium text-gold hover:underline">Client Login</a><a href="https://secure.pinnaclemanagementventures.com/hq/login" className="font-medium text-slate-400 hover:text-gold">Team Login</a></div></div></section>
      </main>
      <Footer />
    </div>
  )
}
