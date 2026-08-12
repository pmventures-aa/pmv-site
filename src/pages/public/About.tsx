import { Link } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { Reveal } from '../../components/public/motion'
import { CtaBand, btnOutline, btnPrimary } from '../../components/public/ui'
import { Icon, type IconName } from '../../components/kit/Icon'
import { BrandMark3D } from '../../components/ui'
import { usePageMeta } from '../../lib/usePageMeta'

const strengths:{icon:IconName;title:string;body:string}[]=[
  {icon:'team',title:'One relationship',body:'Bring the next need back to a team that already understands the context instead of starting over each time.'},
  {icon:'check',title:'The right resource',body:'When specialized expertise is needed, we coordinate with appropriate professionals rather than pretending one provider should do everything.'},
  {icon:'activity',title:'Visible follow-through',body:'Projects, documents, messages, appointments, vendors, and next steps stay connected, so fewer things get lost between people.'},
  {icon:'services',title:'Flexible engagement',body:'Use Pinnacle for one task, a defined project, a transition, or ongoing support. The structure should match the work.'},
]

const areas=[
  ['Business & Operations','Consulting, administrative support, systems, vendor changes, POS and payment transitions, funding readiness, and project coordination.'],
  ['Property & Field Services','Property support, inspections, verification, field visits, turnover coordination, and vendor work.'],
  ['Documents & Mobile Services','Mobile notary, courier, document runs, signing support, and other defined professional tasks.'],
]

export default function About(){
  usePageMeta('About Pinnacle - Nationwide Professional Services Network','Why Pinnacle Management Ventures exists: to give businesses, owners, and teams one dependable nationwide network for operations, documents, signing, and field work - so no one has to become the project manager just to get help.')
  return <div className="min-h-screen bg-navy-950"><Header/><main>
    <section className="pmv-hero-story relative overflow-hidden border-b border-white/10"><div className="pmv-hero-gold" aria-hidden="true"/><div className="container-pmv py-16 sm:py-20"><Reveal className="grid gap-10 lg:grid-cols-[1.05fr_.95fr] lg:items-center"><div><p className="eyebrow">About Pinnacle</p><h1 className="mt-4 max-w-4xl font-display text-4xl font-medium leading-[1.06] text-white sm:text-6xl">Built for the space between <span className="pmv-gold-text">something needs to happen</span> and it is handled.</h1><p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">Pinnacle Management Ventures exists because capable people lose too much time coordinating disconnected providers, repeating context, chasing updates, and figuring out who owns the next step.</p><p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">We create one dependable relationship around that work. Sometimes the answer is consulting. Sometimes it is hands-on support, a specialist, a transition plan, or simply someone accountable for keeping the pieces moving.</p><div className="mt-8 flex flex-wrap gap-3"><Link to="/scope-request" className={btnPrimary}>Tell Us What You Need</Link><Link to="/services" className={btnOutline}>View Services</Link></div></div><div className="relative flex min-h-[330px] items-center justify-center"><BrandMark3D size={196} decorative variant="quiet" className="relative z-10"/></div></Reveal></div></section>

    <section className="container-pmv py-16 sm:py-20"><Reveal className="grid gap-10 lg:grid-cols-[.78fr_1.22fr] lg:gap-16"><div><p className="eyebrow">The idea</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-5xl">The client should not have to become the project manager just to get help.</h2></div><div><p className="text-lg leading-8 text-slate-300">Across operations, client service, property work, payments, technology changes, vendors, and administrative projects, the same failure point shows up repeatedly: responsibility gets fragmented.</p><p className="mt-5 text-base leading-7 text-slate-400">Pinnacle is designed to reduce that friction. We help understand the situation, define the work, bring in the right people, and keep the broader engagement organized. The goal is not to sell every service to every client. It is to make the path forward clearer.</p></div></Reveal></section>

    <section className="pmv-gold-band border-y border-gold/15"><div className="container-pmv py-14 sm:py-16"><Reveal className="max-w-3xl"><p className="eyebrow">What we support</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Professional support across business, property, and operational work.</h2></Reveal><div className="mt-8 divide-y divide-white/10 border-y border-white/10">{areas.map(([title,body])=><Reveal key={title} className="grid gap-2 py-5 md:grid-cols-[240px_1fr]"><h3 className="font-semibold text-white">{title}</h3><p className="text-sm leading-6 text-slate-400">{body}</p></Reveal>)}</div></div></section>

    <section className="container-pmv py-14 sm:py-16"><Reveal className="grid gap-10 lg:grid-cols-[.75fr_1.25fr]"><div><p className="eyebrow">How we work</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Simple process. Clear responsibility.</h2><p className="mt-4 text-sm leading-6 text-slate-400">Good professional support is less about theatrics and more about context, communication, judgment, and follow-through.</p></div><div className="pmv-process-line">{[
      ['01','Understand the situation','What is happening, what matters, what has already been tried, and what a good outcome looks like.'],
      ['02','Define the work','Identify the scope and the people, information, dependencies, and responsibilities involved.'],
      ['03','Coordinate the pieces','Keep providers, documents, systems, access, communication, and deadlines connected.'],
      ['04','Follow through','Make the next step visible and stay involved at the level the engagement actually requires.'],
    ].map(([n,t,b])=><div key={n} className="pmv-process-step"><span>{n}</span><div><h3>{t}</h3><p>{b}</p></div></div>)}</div></Reveal></section>

    <section className="border-y border-white/10 bg-navy-900/30"><div className="container-pmv py-14 sm:py-16"><Reveal className="max-w-3xl"><p className="eyebrow">Why clients use Pinnacle</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Less time coordinating the work. More confidence that it is moving.</h2></Reveal><div className="mt-8 grid gap-x-10 md:grid-cols-2">{strengths.map((s)=><Reveal key={s.title} className="border-t border-gold/20 py-6"><div className="flex gap-3"><span className="mt-0.5 text-gold"><Icon name={s.icon} size={19}/></span><div><h3 className="font-semibold text-white">{s.title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{s.body}</p></div></div></Reveal>)}</div></div></section>

    <section className="container-pmv py-14 sm:py-16"><Reveal className="grid gap-8 lg:grid-cols-2"><div><p className="eyebrow">Professional network</p><h2 className="mt-3 font-display text-3xl font-medium text-white">A broad relationship does not mean pretending to be every kind of specialist.</h2></div><div><p className="text-sm leading-6 text-slate-300">When a client need requires licensed, qualified, or specialized expertise, Pinnacle can coordinate with the right professional and keep the surrounding work organized. That may include accountants, enrolled agents, paralegal support, property professionals, technology providers, and other specialists appropriate to the scope.</p><p className="mt-3 text-sm leading-6 text-slate-400">Their role stays focused on the work they are qualified to handle. Pinnacle's role is to keep the broader engagement clear and connected.</p><Link to="/professionals" className="mt-4 inline-block text-sm font-medium text-gold hover:underline">Learn about our professional network →</Link></div></Reveal></section>

    <CtaBand title="Have something that needs attention?" body="Start with the situation, not the service name. We can help determine the right scope and next step." primary={{to:'/scope-request',label:'Tell Us What You Need'}} secondary={{to:'/services',label:'View Services'}}/>
  </main><Footer/></div>
}
