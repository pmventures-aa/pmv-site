import { ViewTransitionLink } from '../../components/public/ViewTransitionLink'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { Reveal, RevealHeading } from '../../components/public/motion'
import { CtaBand, btnOutline, btnPrimary } from '../../components/public/ui'
import { Icon, type IconName } from '../../components/kit/Icon'
import { BrandMark3D } from '../../components/ui'
import { NetworkStory } from '../../components/public/story'
import { BrandPanel } from '../../components/public/BrandPanel'
import { usePageMeta } from '../../lib/usePageMeta'
import { GET_HELP, founder, principles } from '../../data/publicSite'

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
  usePageMeta('About Pinnacle - Professional Support Built Around Follow-Through','Pinnacle Management Ventures helps businesses, property owners, and individuals get matters handled through one trusted point of contact: understand the work, own the next step, and follow through.')
  return <div className="min-h-screen bg-navy-950"><Header/><main>
    <section className="pmv-hero-story relative overflow-hidden border-b border-white/10"><div className="pmv-hero-gold" aria-hidden="true"/><div className="container-pmv py-16 sm:py-20"><Reveal className="grid gap-10 lg:grid-cols-[1.05fr_.95fr] lg:items-center"><div><p className="eyebrow">About Pinnacle</p><RevealHeading className="mt-4"><h1 className="pmv-h1 max-w-4xl">Professional Support Built Around <span className="pmv-gold-text">Follow-Through.</span></h1></RevealHeading><p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">Pinnacle helps businesses, property owners, and individuals get business, property, and administrative matters handled through one trusted point of contact.</p><p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">We exist because capable people lose too much time coordinating disconnected providers, repeating context, chasing updates, and figuring out who owns the next step.</p><div className="mt-8 flex flex-wrap gap-3"><ViewTransitionLink to={GET_HELP} className={btnPrimary}>Tell Us What You Need Help With</ViewTransitionLink><ViewTransitionLink to="/services" className={btnOutline}>Explore Services</ViewTransitionLink></div></div><div className="relative flex min-h-[330px] items-center justify-center"><BrandMark3D size={196} decorative variant="quiet" className="relative z-10"/></div></Reveal></div></section>

    <section className="container-pmv py-16 sm:py-20"><Reveal className="grid gap-10 lg:grid-cols-[.78fr_1.22fr] lg:gap-16"><div><p className="eyebrow">The idea</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-5xl">The client should not have to become the project manager just to get help.</h2></div><div><p className="text-lg leading-8 text-slate-300">Across operations, client service, property work, payments, technology changes, vendors, and administrative projects, the same failure point shows up repeatedly: responsibility gets fragmented.</p><p className="mt-5 text-base leading-7 text-slate-400">Pinnacle is designed to reduce that friction. We help understand the situation, define the work, bring in the right people, and keep the broader engagement organized. The goal is not to sell every service to every client. It is to make the path forward clearer.</p></div></Reveal></section>

    <section className="pmv-gold-band border-y border-gold/15"><div className="container-pmv py-14 sm:py-16"><Reveal className="max-w-3xl"><p className="eyebrow">What we support</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Professional support across business, property, and operational work.</h2></Reveal><div className="mt-8 divide-y divide-white/10 border-y border-white/10">{areas.map(([title,body])=><Reveal key={title} className="grid gap-2 py-5 md:grid-cols-[240px_1fr]"><h3 className="font-semibold text-white">{title}</h3><p className="text-sm leading-6 text-slate-400">{body}</p></Reveal>)}</div></div></section>

    <section className="container-pmv py-14 sm:py-16"><Reveal className="grid gap-10 lg:grid-cols-[.75fr_1.25fr]"><div><p className="eyebrow">The Pinnacle approach</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Understand the matter. Own the next step.</h2><p className="mt-4 text-sm leading-6 text-slate-400">Good professional support is less about theatrics and more about context, communication, judgment, and follow-through.</p></div><div className="pmv-process-line">{principles.map(([t,b],i)=><div key={t} className="pmv-process-step"><span>0{i+1}</span><div><h3>{t}</h3><p>{b}</p></div></div>)}</div></Reveal></section>

    <section className="border-y border-white/10"><div className="container-pmv py-14 sm:py-16"><Reveal className="mx-auto max-w-3xl"><BrandPanel src="/brand/pmv-brand-panel.webp" alt="Pinnacle Management Ventures brand mark: professional support, nationwide solutions, trusted, reliable, results driven." illustrative={false}/></Reveal></div></section>

    <section className="border-y border-white/10 bg-navy-900/30"><div className="container-pmv grid gap-10 py-14 sm:py-16 lg:grid-cols-[.8fr_1.2fr] lg:items-center"><Reveal><p className="eyebrow">Leadership</p><h2 className="mt-3 font-display text-3xl font-medium text-white">{founder.name}</h2><p className="mt-2 text-sm font-semibold uppercase tracking-[.12em] text-gold">{founder.title}</p></Reveal><Reveal><p className="text-base leading-8 text-slate-300">{founder.lead}</p><p className="mt-4 text-base leading-8 text-slate-400">{founder.close}</p></Reveal></div></section>

    <section className="border-b border-white/10 bg-navy-900/30 py-14 sm:py-16">
      <NetworkStory
        heading="One relationship. A whole network behind it."
        body="When a client need calls for licensed or specialized expertise, Pinnacle coordinates the right professional and keeps the surrounding work connected - so you deal with one point of contact, not a dozen."
        points={['Vetted specialists matched to the actual need', 'Pinnacle keeps the broader engagement organized', 'Remote services available nationwide']}
      />
    </section>

    <section className="border-y border-white/10 bg-navy-900/30"><div className="container-pmv py-14 sm:py-16"><Reveal className="max-w-3xl"><p className="eyebrow">Why clients use Pinnacle</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Less time coordinating the work. More confidence that it is moving.</h2></Reveal><div className="mt-8 grid gap-x-10 md:grid-cols-2">{strengths.map((s)=><Reveal key={s.title} className="border-t border-gold/20 py-6"><div className="flex gap-3"><span className="mt-0.5 text-gold"><Icon name={s.icon} size={19}/></span><div><h3 className="font-semibold text-white">{s.title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{s.body}</p></div></div></Reveal>)}</div></div></section>

    <section className="container-pmv py-14 sm:py-16"><Reveal className="grid gap-8 lg:grid-cols-2"><div><p className="eyebrow">Professional network</p><h2 className="mt-3 font-display text-3xl font-medium text-white">A broad relationship does not mean pretending to be every kind of specialist.</h2></div><div><p className="text-sm leading-6 text-slate-300">When a client need requires licensed, qualified, or specialized expertise, Pinnacle can coordinate with the right professional and keep the surrounding work organized. That may include accountants, enrolled agents, paralegal support, property professionals, technology providers, and other specialists appropriate to the scope.</p><p className="mt-3 text-sm leading-6 text-slate-400">Their role stays focused on the work they are qualified to handle. Pinnacle's role is to keep the broader engagement clear and connected.</p><ViewTransitionLink to="/professionals" className="mt-4 inline-block text-sm font-medium text-gold hover:underline">Learn about our professional network →</ViewTransitionLink></div></Reveal></section>

    <CtaBand title="Have something that needs attention?" body="Start with the situation, not the service name. We can help determine the right scope and next step." primary={{to:GET_HELP,label:'Tell Us What You Need Help With'}} secondary={{to:'/services',label:'Explore Services'}}/>
  </main><Footer/></div>
}
