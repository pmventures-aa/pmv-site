import { Link } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { Reveal } from '../../components/public/motion'
import { CtaBand, btnOutline, btnPrimary } from '../../components/public/ui'
import { Icon, type IconName } from '../../components/kit/Icon'
import { usePageMeta } from '../../lib/usePageMeta'

const strengths:{icon:IconName;title:string;body:string}[]=[
  {icon:'team',title:'One relationship',body:'You can bring new needs back to the same team instead of rebuilding context with a different provider every time.'},
  {icon:'check',title:'Qualified support',body:'When specialized expertise is needed, we coordinate with appropriate professionals and keep the scope and access clear.'},
  {icon:'activity',title:'Better follow-up',body:'Projects, documents, messages, appointments, and next steps stay connected so less gets lost between people.'},
  {icon:'services',title:'Support that fits',body:'Use Pinnacle for one task, a project, or ongoing support. The engagement should match the work, not the other way around.'},
]

const areas=[
  ['Business & Operations','Consulting, administrative support, systems, vendor changes, POS and payment transitions, funding readiness, and project coordination.'],
  ['Property & Field Services','Property support, inspections, verification, field visits, turnover coordination, and vendor work.'],
  ['Documents & Mobile Services','Mobile notary, courier, document runs, signing support, and other defined professional tasks.'],
]

export default function About(){
  usePageMeta('About Pinnacle','Pinnacle Management Ventures provides practical professional support for businesses, property owners, organizations, and individuals.')
  return <div className="min-h-screen bg-navy-950"><Header/><main>
    <section className="container-pmv py-16 sm:py-20"><Reveal className="grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-end"><div><p className="eyebrow">About Pinnacle</p><h1 className="mt-4 max-w-4xl font-display text-4xl font-medium leading-[1.08] text-white sm:text-6xl">A practical place to bring complicated work.</h1><p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">Pinnacle Management Ventures helps businesses, property owners, organizations, and individuals handle projects and professional tasks that need more coordination than they are getting today.</p><p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">Sometimes that means consulting. Sometimes it means handling a defined task, coordinating a provider, managing a transition, or simply making sure the next step actually happens.</p><div className="mt-8 flex flex-wrap gap-3"><a href="https://secure.pinnaclemanagementventures.com/signup" className={btnPrimary}>Get Started</a><Link to="/services" className={btnOutline}>View Services</Link></div></div><div className="border-l border-white/10 pl-6"><p className="text-sm font-semibold text-white">You do not need to know the exact service name.</p><p className="mt-2 text-sm leading-6 text-slate-400">Tell us what is happening, what needs attention, and what a good outcome looks like. We can help determine the right scope from there.</p></div></Reveal></section>

    <section className="border-y border-white/10 bg-navy-900/30"><div className="container-pmv py-14 sm:py-16"><Reveal className="max-w-3xl"><p className="eyebrow">What we do</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Professional support across business, property, and operational work.</h2></Reveal><div className="mt-8 divide-y divide-white/10 border-y border-white/10">{areas.map(([title,body])=><Reveal key={title} className="grid gap-2 py-5 md:grid-cols-[240px_1fr]"><h3 className="font-semibold text-white">{title}</h3><p className="text-sm leading-6 text-slate-400">{body}</p></Reveal>)}</div></div></section>

    <section className="container-pmv py-14 sm:py-16"><Reveal className="grid gap-10 lg:grid-cols-[.75fr_1.25fr]"><div><p className="eyebrow">How we work</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Simple process. Clear responsibility.</h2><p className="mt-4 text-sm leading-6 text-slate-400">Good service is mostly about understanding the situation, communicating well, and following through consistently.</p></div><div className="divide-y divide-white/10 border-y border-white/10">{[
      ['01','Understand the situation','We start with what is happening, what needs to change, and what information is already available.'],
      ['02','Define the scope','We identify the work, the people involved, the information required, and the expected outcome.'],
      ['03','Manage the follow-through','Pinnacle keeps the relevant tasks, documents, communication, and service activity connected.'],
      ['04','Stay available','When the next need comes up, you can return to the same relationship instead of starting over somewhere else.'],
    ].map(([n,t,b])=><div key={n} className="grid gap-3 py-5 sm:grid-cols-[48px_1fr]"><span className="text-xs font-semibold text-gold">{n}</span><div><h3 className="font-semibold text-white">{t}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{b}</p></div></div>)}</div></Reveal></section>

    <section className="border-y border-white/10 bg-navy-900/30"><div className="container-pmv py-14 sm:py-16"><Reveal className="max-w-3xl"><p className="eyebrow">Why clients use Pinnacle</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Fewer loose ends and less time spent coordinating the work yourself.</h2></Reveal><div className="mt-8 grid gap-x-10 md:grid-cols-2">{strengths.map((s)=><Reveal key={s.title} className="border-t border-white/10 py-6"><div className="flex gap-3"><span className="mt-0.5 text-gold"><Icon name={s.icon} size={19}/></span><div><h3 className="font-semibold text-white">{s.title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{s.body}</p></div></div></Reveal>)}</div></div></section>

    <section className="container-pmv py-14 sm:py-16"><Reveal className="grid gap-8 lg:grid-cols-2"><div><p className="eyebrow">Professional network</p><h2 className="mt-3 font-display text-3xl font-medium text-white">Specialized work should be handled by the right professional.</h2></div><div><p className="text-sm leading-6 text-slate-300">When a client need requires outside expertise, Pinnacle can coordinate with licensed, qualified, or specialized professionals. Their access is limited to the work they are involved in, and Pinnacle remains responsible for keeping the overall engagement organized.</p><Link to="/professionals" className="mt-4 inline-block text-sm font-medium text-gold hover:underline">Learn about our professional network</Link></div></Reveal></section>

    <CtaBand title="Have something that needs attention?" body="Tell us what you are trying to accomplish and we can help determine the right scope and next step." primary={{to:'https://secure.pinnaclemanagementventures.com/signup',label:'Get Started'}} secondary={{to:'/services',label:'View Services'}}/>
  </main><Footer/></div>
}
