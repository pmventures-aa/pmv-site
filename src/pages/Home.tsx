import { Link } from 'react-router-dom'
import { Header } from '../components/public/Header'
import { Footer } from '../components/public/Footer'
import { btnOutline, btnPrimary, CtaBand } from '../components/public/ui'
import { Reveal } from '../components/public/motion'
import { usePageMeta } from '../lib/usePageMeta'
import { BrandMark3D } from '../components/ui'
import { Icon, type IconName } from '../components/kit/Icon'

const CLIENT_SIGNUP = 'https://secure.pinnaclemanagementventures.com/signup?source=home'

const pathways: { n:string; icon:IconName; title:string; body:string; to:string; note:string }[] = [
  { n:'01', icon:'briefcase', title:'Business & Operations', body:'Consulting, systems, POS and payment transitions, administrative capacity, project coordination, and funding readiness.', to:'/services/business-operations', note:'Remote + project support' },
  { n:'02', icon:'building', title:'Property & Field', body:'Property owner support, inspections, vendor follow-up, field verification, access coordination, and documented local work.', to:'/services/property-field', note:'South Florida field coverage' },
  { n:'03', icon:'file', title:'Documents & Mobile', body:'Mobile notary, courier, signing support, and other defined local assignments that need dependable handling.', to:'/services/mobile-documents', note:'Local mobile services' },
]

export default function Home() {
  usePageMeta('Home', 'Pinnacle Management Ventures provides business consulting, operational support, property and field services, POS and payment transition support, and mobile professional services from South Florida.')

  return <div className="min-h-screen bg-navy-950"><Header/><main>
    <section className="pmv-hero-story relative overflow-hidden border-b border-white/[.08]">
      <div className="pmv-hero-gold" aria-hidden="true" />
      <div className="container-pmv grid gap-12 py-16 sm:py-20 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:py-24 xl:py-28">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-gold">Professional Support · South Florida Based</p>
          <h1 className="mt-5 max-w-5xl font-display text-5xl font-medium leading-[1.02] tracking-[-.035em] text-white sm:text-6xl lg:text-7xl xl:text-[5.35rem]">One place to bring the work that <span className="pmv-gold-text">needs to move.</span></h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">Pinnacle helps businesses and property owners handle projects, transitions, field work, and operational problems without turning every new need into another vendor search.</p>
          <div className="mt-9 flex flex-wrap gap-3"><a href={CLIENT_SIGNUP} className={btnPrimary}>Tell Us What You Need</a><Link to="/services" className={btnOutline}>Explore Services</Link></div>
          <div className="mt-9 flex flex-wrap gap-x-7 gap-y-2 border-t border-white/10 pt-5 text-sm text-slate-400"><span>Projects</span><span>Ongoing support</span><span>Consulting</span><span>Field work</span></div>
        </Reveal>
        <Reveal className="relative flex min-h-[380px] items-center justify-center lg:justify-end">
          <div className="pmv-story-orbit" aria-hidden="true"/><BrandMark3D size={265} decorative className="relative z-10"/>
          <div className="pmv-story-note pmv-story-note-a"><span>Start</span><strong>Tell us the situation</strong></div>
          <div className="pmv-story-note pmv-story-note-b"><span>Pinnacle</span><strong>Define · Coordinate · Follow through</strong></div>
          <div className="pmv-story-note pmv-story-note-c"><span>Next</span><strong>Keep the work moving</strong></div>
        </Reveal>
      </div>
    </section>

    <section className="container-pmv py-14 sm:py-18">
      <Reveal className="grid gap-8 lg:grid-cols-[.7fr_1.3fr] lg:items-end"><div><p className="eyebrow">How we can help</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Start with the part of the business that needs attention.</h2></div><p className="max-w-2xl text-base leading-7 text-slate-400">The homepage stays simple. Each area below has its own focused page with the specific services, typical scopes, and ways Pinnacle can support the work.</p></Reveal>
      <div className="mt-9 border-y border-white/10">{pathways.map((item)=><Reveal key={item.title}><Link to={item.to} className="group grid gap-4 border-b border-white/10 py-6 last:border-b-0 sm:grid-cols-[54px_48px_minmax(180px,.7fr)_1.3fr_auto] sm:items-center"><span className="font-display text-xs text-gold/70">{item.n}</span><span className="text-gold"><Icon name={item.icon} size={21}/></span><div><h3 className="text-lg font-semibold text-white transition group-hover:text-gold">{item.title}</h3><p className="mt-1 text-xs uppercase tracking-[.1em] text-slate-500">{item.note}</p></div><p className="max-w-2xl text-sm leading-6 text-slate-400">{item.body}</p><span className="text-gold transition-transform group-hover:translate-x-1">→</span></Link></Reveal>)}</div>
    </section>

    <section className="pmv-gold-band border-y border-gold/15"><div className="container-pmv py-14 sm:py-18"><Reveal className="grid gap-10 lg:grid-cols-[.82fr_1.18fr] lg:items-center"><div><p className="eyebrow">Why Pinnacle</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-5xl">The client should not have to become the project manager just to get help.</h2></div><div><p className="text-lg leading-8 text-slate-300">A lot of important work gets stuck between vendors, systems, documents, appointments, and people who each own only one piece.</p><p className="mt-4 text-base leading-7 text-slate-400">Pinnacle creates continuity. We help define the scope, keep the right people connected, and make the next step visible. When specialized expertise is required, we can coordinate with qualified professionals while keeping the broader engagement organized.</p><div className="mt-7 flex flex-wrap gap-x-8 gap-y-3 text-sm"><span className="border-l border-gold/40 pl-3 text-slate-300">One relationship</span><span className="border-l border-gold/40 pl-3 text-slate-300">Clear ownership</span><span className="border-l border-gold/40 pl-3 text-slate-300">Flexible scope</span><span className="border-l border-gold/40 pl-3 text-slate-300">Secure client workspace</span></div></div></Reveal></div></section>

    <section className="container-pmv py-14 sm:py-18"><Reveal className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]"><div><p className="eyebrow">How it works</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">A clear path from “this needs attention” to the next step.</h2><Link to="/about" className="mt-5 inline-block text-sm font-semibold text-gold">Why we built Pinnacle →</Link></div><div className="pmv-process-line">{[
      ['01','Understand','What is happening, what matters, and what a good outcome looks like.'],
      ['02','Define','The scope, information, people, and responsibilities required.'],
      ['03','Coordinate','Keep the work, communication, documents, vendors, and deadlines connected.'],
      ['04','Follow through','Make progress visible and keep the next step from disappearing between people.'],
    ].map(([n,t,b])=><div key={n} className="pmv-process-step"><span>{n}</span><div><h3>{t}</h3><p>{b}</p></div></div>)}</div></Reveal></section>

    <section className="pmv-trust-strip border-y border-gold/15"><div className="container-pmv grid gap-8 py-9 sm:grid-cols-2 lg:grid-cols-4">{[
      ['South Florida','Local field and mobile coverage'],['Nationwide','Remote consulting and project support'],['Secure','Client documents and communication'],['Flexible','One task, project, or ongoing support'],
    ].map(([a,b])=><div key={a}><strong className="font-display text-2xl text-white">{a}</strong><p className="mt-1 text-sm leading-6 text-slate-400">{b}</p></div>)}</div></section>

    <CtaBand title="What is taking more of your time than it should?" body="Tell us what needs attention. You do not need to know the service name before you reach out." primary={{to:'/portal/signup',label:'Start a Request'}} secondary={{to:'/contact',label:'Talk With Pinnacle'}}/>
  </main><Footer/></div>
}
