import { Link } from 'react-router-dom'
import { Header } from '../components/public/Header'
import { Footer } from '../components/public/Footer'
import { btnOutline, btnPrimary, CtaBand, MotionStage, SplitFeatures } from '../components/public/ui'
import { Reveal } from '../components/public/motion'
import { services } from '../data/services'
import { usePageMeta } from '../lib/usePageMeta'
import { Icon, type IconName } from '../components/kit/Icon'

const CLIENT_SIGNUP='https://secure.pinnaclemanagementventures.com/signup?source=home'
const startingPoints=services.slice(0,4)
const situations:{icon:IconName;title:string;body:string;to:string}[]=[
  {icon:'briefcase',title:'Business operations and project support',body:'Projects, vendor coordination, system changes, administrative work and the follow-up that keeps them moving.',to:'/services/consulting'},
  {icon:'building',title:'Property and field coordination',body:'Local site work, access, inspections, documentation and service-provider coordination across South Florida.',to:'/services/property-management'},
  {icon:'services',title:'POS, payments and technology transitions',body:'Hands-on planning for system changes, data movement, implementation, training and vendor coordination.',to:'/services/merchant-services'},
  {icon:'file',title:'Defined professional and mobile services',body:'Document, administrative, mobile and time-sensitive assignments handled without building another internal workflow.',to:'/services'},
]

export default function Home(){
  usePageMeta('Home','Professional services and business consulting in South Florida, including operations support, POS and payment technology transitions, property coordination, and mobile services.')
  return <div className="min-h-screen bg-navy-950"><Header/>
    <section className="relative overflow-hidden border-b border-white/[.07]">
      <div className="container-pmv py-14 sm:py-18 lg:py-20 xl:py-24">
        <div className="grid gap-10 lg:grid-cols-[1.02fr_.98fr] lg:items-center">
          <div className="relative z-10">
            <p className="mb-5 text-sm font-medium text-gold">South Florida based · Project support available nationwide</p>
            <h1 className="max-w-5xl font-display text-5xl font-medium leading-[1.03] tracking-[-.03em] text-white sm:text-6xl lg:text-7xl xl:text-[5.2rem]">Professional support for the work your business needs to get done.</h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">Pinnacle helps businesses and property owners organize projects, coordinate providers, manage operational work and carry complicated tasks through to completion.</p>
            <div className="mt-9 flex flex-wrap gap-3"><a href={CLIENT_SIGNUP} className={btnPrimary}>Get Started</a><Link to="/services" className={btnOutline}>Explore Services</Link></div>
            <dl className="mt-10 grid max-w-2xl gap-5 border-t border-white/10 pt-6 text-sm sm:grid-cols-3">
              <div><dt className="font-semibold text-white">One accountable contact</dt><dd className="mt-1 leading-6 text-slate-400">A clear person and place to bring the work.</dd></div>
              <div><dt className="font-semibold text-white">Flexible engagements</dt><dd className="mt-1 leading-6 text-slate-400">Project, retainer and defined-scope support.</dd></div>
              <div><dt className="font-semibold text-white">Secure client workspace</dt><dd className="mt-1 leading-6 text-slate-400">Documents, messages and active work stay organized.</dd></div>
            </dl>
          </div>
          <div className="relative lg:-mr-8"><MotionStage/></div>
        </div>
        <nav aria-label="Popular services" className="mt-12 border-y border-white/10">
          {startingPoints.map((service,index)=><Link key={service.key} to={`/services/${service.slug}`} className="group grid gap-2 border-b border-white/[.07] py-4 last:border-b-0 sm:grid-cols-[44px_minmax(180px,.6fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-5"><span className="font-display text-xs text-gold/60">{String(index+1).padStart(2,'0')}</span><span className="font-semibold text-white group-hover:text-gold">{service.title}</span><span className="text-sm leading-6 text-slate-400">{service.shortDescription}</span><span className="text-sm text-slate-500 group-hover:text-gold">View ›</span></Link>)}
        </nav>
      </div>
    </section>

    <section className="container-pmv py-16 sm:py-20"><Reveal className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-16"><div><p className="eyebrow">Where we help</p><h2 className="mt-4 font-display text-3xl font-medium tracking-tight text-white sm:text-4xl">Start with what needs to happen, not a service category.</h2><p className="mt-5 text-sm leading-7 text-slate-400">Tell us what is stalled, changing or consuming too much time. We will help define the work and determine the right way to handle it.</p></div><div className="border-y border-white/10">{situations.map(item=><Link key={item.title} to={item.to} className="group grid gap-4 border-b border-white/[.07] py-6 last:border-b-0 sm:grid-cols-[40px_minmax(180px,.7fr)_minmax(0,1fr)_auto] sm:items-start sm:gap-5"><span className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-gold"><Icon name={item.icon} size={16}/></span><h3 className="text-sm font-semibold text-white group-hover:text-gold">{item.title}</h3><p className="text-sm leading-6 text-slate-400">{item.body}</p><span className="text-sm text-slate-500 group-hover:text-gold">View ›</span></Link>)}</div></Reveal></section>

    <section className="border-y border-white/[.07] bg-navy-900/35"><div className="container-pmv py-16 sm:py-20"><Reveal className="max-w-3xl"><p className="eyebrow">How it works</p><h2 className="mt-4 font-display text-3xl font-medium tracking-tight text-white sm:text-4xl">A straightforward working relationship.</h2><p className="mt-5 text-base leading-7 text-slate-300">We get enough context to understand the problem, define responsibility and keep the work moving at the level the engagement requires.</p></Reveal><div className="mt-10"><SplitFeatures items={[["Tell us what needs attention","Share the project, transition, task or operational problem in plain language."],["We define the scope","We clarify responsibilities, required information, timing and the resources involved."],["We manage the follow-through","Communication, documents and next steps stay organized while the work is active."]]}/></div></div></section>

    <section className="container-pmv py-16 sm:py-20"><Reveal className="grid gap-10 border-y border-white/10 py-10 lg:grid-cols-[.9fr_1.1fr] lg:gap-16"><div><p className="eyebrow">Client workspace</p><h2 className="mt-4 font-display text-3xl font-medium tracking-tight text-white sm:text-4xl">A clearer way to keep track of the work.</h2><p className="mt-5 text-sm leading-7 text-slate-400">Clients can use one secure workspace for active services, documents, communication, billing and next steps.</p></div><div className="divide-y divide-white/10">{[['01','Intake built around the request','We ask for the information relevant to the work instead of forcing every client through the same packet.'],['02','Current status in one place','See messages, documents, service activity and what needs attention next.'],['03','A relationship that can continue','New work can be added without rebuilding the relationship or starting over.']].map(([n,t,b])=><div key={n} className="grid gap-3 py-5 first:pt-0 last:pb-0 sm:grid-cols-[44px_minmax(0,1fr)]"><span className="font-display text-sm text-gold">{n}</span><div><h3 className="text-sm font-semibold text-white">{t}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{b}</p></div></div>)}<a href={CLIENT_SIGNUP} className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-gold">Create a client account <Icon name="arrowRight" size={14}/></a></div></Reveal></section>

    <CtaBand title="Have something that needs to move?" body="Tell us what needs to be handled and we’ll help define the right next step." primary={{to:'/portal/signup',label:'Get Started'}} secondary={{to:'/contact',label:'Contact Us'}}/>
    <section className="border-b border-white/[.07]"><div className="container-pmv flex flex-col items-center justify-between gap-3 py-6 text-sm text-slate-400 sm:flex-row"><span>Already working with Pinnacle?</span><div className="flex flex-wrap items-center gap-4"><a href="https://secure.pinnaclemanagementventures.com/login" className="font-medium text-gold hover:underline">Client Login</a><a href="https://secure.pinnaclemanagementventures.com/hq/login" className="font-medium text-slate-400 hover:text-gold">Team Login</a></div></div></section><Footer/>
  </div>
}
