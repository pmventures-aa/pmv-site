import { Link } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { Reveal } from '../../components/public/motion'
import { CtaBand, btnOutline, btnPrimary } from '../../components/public/ui'
import { Icon, type IconName } from '../../components/kit/Icon'
import { usePageMeta } from '../../lib/usePageMeta'

const strengths:{icon:IconName;title:string;body:string}[]=[
  {icon:'team',title:'One relationship',body:'Start with Pinnacle instead of rebuilding context with a different vendor every time a new need comes up.'},
  {icon:'check',title:'Vetted professionals',body:'When outside expertise is needed, we coordinate qualified network professionals around a defined scope and appropriate access.'},
  {icon:'activity',title:'Clear next steps',body:'Projects, applications, documents, messages, appointments, and follow-up stay connected instead of disappearing into separate inboxes.'},
  {icon:'services',title:'Right-sized support',body:'Use Pinnacle for one practical task or an ongoing engagement. The relationship can grow only when it is useful to you.'},
]

const areas=[
  ['Business & Operations','Consulting, administrative support, systems, vendor changes, POS/payment transitions, funding readiness, and project coordination.'],
  ['Property & Field Services','Property-owner support, inspections and verification, licensed broker price opinions, field visits, turnover coordination, and vendor work.'],
  ['Documents & Mobile Services','Mobile notary, courier, document runs, signing support, and other defined professional tasks.'],
]

export default function About(){
  usePageMeta('About Pinnacle','Pinnacle Management Ventures coordinates practical professional support around businesses, property owners, organizations, and individuals.')
  return <div className="min-h-screen bg-navy-950"><Header/><main>
    <section className="container-pmv py-16 sm:py-20"><Reveal className="grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-end"><div><p className="eyebrow">About Pinnacle</p><h1 className="mt-4 max-w-4xl font-display text-4xl font-medium leading-[1.08] text-white sm:text-6xl">Professional services without the runaround.</h1><p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">Pinnacle Management Ventures helps businesses, property owners, organizations, and individuals coordinate the work that needs to get done — with one relationship, clearer ownership, and the right professional support around the problem.</p><div className="mt-8 flex flex-wrap gap-3"><a href="https://client.pinnaclemanagementventures.com/signup" className={btnPrimary}>Start Your Pinnacle Journey</a><Link to="/services" className={btnOutline}>Explore Services</Link></div></div><div className="border-l border-white/10 pl-6"><p className="text-sm font-semibold text-white">You do not need to know which service you need.</p><p className="mt-2 text-sm leading-6 text-slate-400">Start with what is happening, what you are trying to accomplish, or what keeps getting pushed to the bottom of the list. We help make the next step clearer.</p></div></Reveal></section>

    <section className="border-y border-white/10 bg-navy-900/30"><div className="container-pmv py-14 sm:py-16"><Reveal className="max-w-3xl"><p className="eyebrow">What we actually do</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Practical support around the work, not another layer of complexity.</h2></Reveal><div className="mt-8 divide-y divide-white/10 border-y border-white/10">{areas.map(([title,body])=><Reveal key={title} className="grid gap-2 py-5 md:grid-cols-[240px_1fr]"><h3 className="font-semibold text-white">{title}</h3><p className="text-sm leading-6 text-slate-400">{body}</p></Reveal>)}</div></div></section>

    <section className="container-pmv py-14 sm:py-16"><Reveal className="grid gap-10 lg:grid-cols-[.75fr_1.25fr]"><div><p className="eyebrow">How we work</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">A journey with fewer handoffs.</h2><p className="mt-4 text-sm leading-6 text-slate-400">White-glove service does not mean making every interaction elaborate. It means knowing the context, communicating clearly, and making the next step easier.</p></div><div className="divide-y divide-white/10 border-y border-white/10">{[
      ['01','Start with the situation','Tell us what is happening or what you need to accomplish. You do not need to diagnose the service yourself.'],
      ['02','Define the right scope','We identify the information, service, professional, or sequence of steps that fits the need.'],
      ['03','Coordinate the work','Pinnacle keeps the client, provider, documents, messages, tasks, and follow-up connected.'],
      ['04','Stay useful after the task','Your portal and relationship remain available when the next need appears — without forcing you into services you do not need.'],
    ].map(([n,t,b])=><div key={n} className="grid gap-3 py-5 sm:grid-cols-[48px_1fr]"><span className="text-xs font-semibold text-gold">{n}</span><div><h3 className="font-semibold text-white">{t}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{b}</p></div></div>)}</div></Reveal></section>

    <section className="border-y border-white/10 bg-navy-900/30"><div className="container-pmv py-14 sm:py-16"><Reveal className="max-w-3xl"><p className="eyebrow">Why Pinnacle</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">The value is in the relationship around the work.</h2></Reveal><div className="mt-8 grid gap-x-10 md:grid-cols-2">{strengths.map((s)=><Reveal key={s.title} className="border-t border-white/10 py-6"><div className="flex gap-3"><span className="mt-0.5 text-gold"><Icon name={s.icon} size={19}/></span><div><h3 className="font-semibold text-white">{s.title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{s.body}</p></div></div></Reveal>)}</div></div></section>

    <section className="container-pmv py-14 sm:py-16"><Reveal className="grid gap-8 lg:grid-cols-2"><div><p className="eyebrow">Our professional network</p><h2 className="mt-3 font-display text-3xl font-medium text-white">We do not pretend one company is the expert at everything.</h2></div><div><p className="text-sm leading-6 text-slate-300">Pinnacle builds relationships with licensed, qualified, and specialized professionals who can support client work when the engagement calls for expertise outside the core team. Access is assignment-specific, qualifications are reviewed when relevant, and the client relationship remains coordinated through Pinnacle.</p><Link to="/professionals" className="mt-4 inline-block text-sm font-medium text-gold hover:underline">See how the professional network works →</Link></div></Reveal></section>

    <CtaBand title="Not sure where to start? Start with what’s happening." body="Tell us what you are trying to accomplish. We’ll help determine the right scope, resources, and next step without making you learn the whole service catalog first." primary={{to:'https://client.pinnaclemanagementventures.com/signup',label:'Get Started'}} secondary={{to:'/services',label:'Browse Services'}}/>
  </main><Footer/></div>
}
