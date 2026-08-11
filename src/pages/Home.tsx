import { Link } from 'react-router-dom'
import { Header } from '../components/public/Header'
import { Footer } from '../components/public/Footer'
import { btnOutline, btnPrimary, CtaBand } from '../components/public/ui'
import { AmbientGlow, Marquee, Reveal } from '../components/public/motion'
import { usePageMeta } from '../lib/usePageMeta'
import { BrandMark3D } from '../components/ui'
import { Icon, type IconName } from '../components/kit/Icon'

const CLIENT_SIGNUP = 'https://secure.pinnaclemanagementventures.com/signup?source=home'

const pathways: { n:string; icon:IconName; title:string; body:string; to:string; note:string }[] = [
  { n:'01', icon:'briefcase', title:'Business Consulting & Transitions', body:'Operational consulting, POS and payment migrations, process improvement, administrative support, project coordination, and implementation follow-through.', to:'/services/business-operations', note:'Strategy + execution support' },
  { n:'02', icon:'building', title:'Property & Field Support', body:'Inspections, vendor coordination, field verification, access support, project follow-up, and documented local execution for owners and operators.', to:'/services/property-field', note:'South Florida field coverage' },
  { n:'03', icon:'file', title:'Documents & Mobile Services', body:'Mobile notary, courier, signing support, document handling, and defined local assignments that need dependable completion.', to:'/services/mobile-documents', note:'Local mobile support' },
]

export default function Home() {
  usePageMeta('Home', 'Pinnacle Management Ventures provides business consulting, POS and payment transition support, operational coordination, property and field services, and mobile professional services from South Florida.')

  return <div className="min-h-screen bg-navy-950"><Header/><main>
    <section className="pmv-hero-story relative overflow-hidden border-b border-white/[.08]">
      <AmbientGlow />
      <div className="pmv-hero-gold" aria-hidden="true" />
      <div className="container-pmv relative z-10 grid gap-12 py-16 sm:py-20 lg:grid-cols-[1.02fr_.98fr] lg:items-center lg:py-24 xl:py-28">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-gold">Professional Services · Consulting · South Florida</p>
          <h1 className="mt-5 max-w-5xl font-display text-5xl font-medium leading-[1.02] tracking-[-.035em] text-white sm:text-6xl lg:text-7xl xl:text-[5.2rem]">Business problems rarely stay in one lane. <span className="pmv-gold-text">We help move the whole project forward.</span></h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">Pinnacle Management Ventures provides hands-on consulting and professional support for businesses navigating operational changes, POS and payment transitions, administrative bottlenecks, property needs, and projects that require one accountable point of coordination.</p>
          <div className="mt-9 flex flex-wrap gap-3"><a href={CLIENT_SIGNUP} className={btnPrimary}>Start With Your Situation</a><Link to="/services" className={btnOutline}>Explore Services</Link></div>
          <div className="mt-9 grid max-w-2xl gap-3 border-t border-white/10 pt-5 text-sm text-slate-400 sm:grid-cols-3"><span><strong className="block text-slate-200">Consulting</strong>Scope the problem and path forward</span><span><strong className="block text-slate-200">Coordination</strong>Keep people, systems, and deadlines aligned</span><span><strong className="block text-slate-200">Execution</strong>Stay involved through implementation</span></div>
        </Reveal>
        <Reveal className="relative flex min-h-[430px] items-center justify-center lg:justify-end">
          <div className="pmv-hero-logo-shell">
            <div className="pmv-story-orbit pmv-story-orbit-animated" aria-hidden="true"/>
            <div className="pmv-story-orbit pmv-story-orbit-animated-secondary" aria-hidden="true"/>
            <BrandMark3D size={285} decorative className="pmv-hero-brand relative z-20"/>
            <div className="pmv-story-note pmv-story-note-a"><span>Assess</span><strong>Understand the business problem and constraints</strong></div>
            <div className="pmv-story-note pmv-story-note-b"><span>Coordinate</span><strong>Connect the systems, people, data, and next steps</strong></div>
            <div className="pmv-story-note pmv-story-note-c"><span>Execute</span><strong>Keep ownership through implementation and follow-up</strong></div>
          </div>
        </Reveal>
      </div>
      <Marquee items={['POS & payment transitions','Operational consulting','Project coordination','Administrative support','Property & field services','Mobile professional services']} />
    </section>

    <section className="container-pmv py-14 sm:py-18">
      <Reveal className="grid gap-8 lg:grid-cols-[.7fr_1.3fr] lg:items-end"><div><p className="eyebrow">Where Pinnacle fits</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Bring us the work that is important, cross-functional, or simply not getting finished.</h2></div><p className="max-w-2xl text-base leading-7 text-slate-400">Some engagements start with a strategic question. Others start with a migration, a vendor issue, a backlog, or a task no one internally has time to own. Pinnacle can step in for a defined project or remain involved as an ongoing operational partner.</p></Reveal>
      <div className="mt-9 border-y border-white/10">{pathways.map((item)=><Reveal key={item.title}><Link to={item.to} className="group grid gap-4 border-b border-white/10 py-6 last:border-b-0 sm:grid-cols-[54px_48px_minmax(180px,.7fr)_1.3fr_auto] sm:items-center"><span className="font-display text-xs text-gold/70">{item.n}</span><span className="text-gold"><Icon name={item.icon} size={21}/></span><div><h3 className="text-lg font-semibold text-white transition group-hover:text-gold">{item.title}</h3><p className="mt-1 text-xs uppercase tracking-[.1em] text-slate-500">{item.note}</p></div><p className="max-w-2xl text-sm leading-6 text-slate-400">{item.body}</p><span className="text-gold transition-transform group-hover:translate-x-1">→</span></Link></Reveal>)}</div>
    </section>

    <section className="pmv-gold-band border-y border-gold/15"><div className="container-pmv py-14 sm:py-18"><Reveal className="grid gap-10 lg:grid-cols-[.82fr_1.18fr] lg:items-center"><div><p className="eyebrow">Why clients use Pinnacle</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-5xl">You should not need five disconnected vendors to solve one business problem.</h2></div><div><p className="text-lg leading-8 text-slate-300">Operational work often spans software, payments, vendors, documents, deadlines, and internal teams. When each participant owns only one piece, the client becomes the default project manager.</p><p className="mt-4 text-base leading-7 text-slate-400">Pinnacle provides continuity. We define the scope, organize the moving pieces, coordinate the right parties, document progress, and keep the engagement moving toward a clear result. When licensed or specialized expertise is required, we can work alongside the appropriate professionals without losing ownership of the broader project.</p><div className="mt-7 flex flex-wrap gap-x-8 gap-y-3 text-sm"><span className="border-l border-gold/40 pl-3 text-slate-300">One accountable relationship</span><span className="border-l border-gold/40 pl-3 text-slate-300">Practical implementation support</span><span className="border-l border-gold/40 pl-3 text-slate-300">Flexible project scopes</span><span className="border-l border-gold/40 pl-3 text-slate-300">Secure client workspace</span></div></div></Reveal></div></section>

    <section className="container-pmv py-14 sm:py-18"><Reveal className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]"><div><p className="eyebrow">How we work</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Clear ownership from the first conversation through the next measurable result.</h2><Link to="/about" className="mt-5 inline-block text-sm font-semibold text-gold">Why we built Pinnacle →</Link></div><div className="pmv-process-line">{[
      ['01','Assess','Clarify the current situation, constraints, stakeholders, and desired outcome.'],
      ['02','Build the plan','Define scope, responsibilities, dependencies, information, and decision points.'],
      ['03','Coordinate','Keep communication, systems, documents, vendors, and deadlines connected.'],
      ['04','Execute & follow through','Drive the work forward, surface blockers early, and keep the next action visible.'],
    ].map(([n,t,b])=><div key={n} className="pmv-process-step"><span>{n}</span><div><h3>{t}</h3><p>{b}</p></div></div>)}</div></Reveal></section>

    <section className="pmv-trust-strip border-y border-gold/15"><div className="container-pmv grid gap-8 py-9 sm:grid-cols-2 lg:grid-cols-4">{[
      ['South Florida','Local field and mobile coverage'],['Nationwide','Remote consulting and transition support'],['Secure','Centralized documents and communication'],['Flexible','One project, retainer support, or defined task'],
    ].map(([a,b])=><div key={a}><strong className="font-display text-2xl text-white">{a}</strong><p className="mt-1 text-sm leading-6 text-slate-400">{b}</p></div>)}</div></section>

    <CtaBand title="What is your team trying to fix, change, migrate, or finally get off the backlog?" body="Tell us the situation. Pinnacle can help define the scope, coordinate the moving pieces, and stay involved through execution." primary={{to:'/portal/signup',label:'Start a Request'}} secondary={{to:'/contact',label:'Talk With Pinnacle'}}/>
  </main><Footer/></div>
}
