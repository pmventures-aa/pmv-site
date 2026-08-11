import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Header } from '../components/public/Header'
import { Footer } from '../components/public/Footer'
import { btnOutline, btnPrimary, CtaBand } from '../components/public/ui'
import { AmbientGlow, Reveal, StaggerGroup, StaggerOnMount, staggerItem } from '../components/public/motion'
import { usePageMeta } from '../lib/usePageMeta'
import { WhiteGoldBrandMark } from '../components/ui'
import { Icon, type IconName } from '../components/kit/Icon'
import { pmvMotion } from '../lib/motionTheme'

const CLIENT_SIGNUP='/portal/signup?source=home'

const audiences:{icon:IconName;label:string;title:string;body:string;links:[string,string][]}[]=[
  {icon:'briefcase',label:'Business & professional support',title:'Operations, administration, and project support.',body:'Add experienced support for day-to-day operations, administrative work, client follow-up, project coordination, process improvement, POS and payment systems, and vendor management.',links:[['Business support','/services/business-operations'],['POS & payment support','/services/merchant-services']]},
  {icon:'building',label:'Property & field services',title:'On-site help for one property or an entire portfolio.',body:'Schedule inspections, property photos, cleaning and deep cleaning, tenant turnover, eviction support, REO and vacant-property work, vendor access, and documented field visits.',links:[['Property & field services','/services/property-field'],['Cleaning & turnover','/projects/property-cleaning-turnover']]},
  {icon:'file',label:'Documents, notary & signing',title:'Prepare, move, sign, notarize, and track documents.',body:'Get help with document preparation, delivery, filing, courthouse runs, mobile notary appointments, Remote Online Notarization, signing coordination, and secure completion records.',links:[['Document & notary services','/services/mobile-documents'],['Professional provider network','/professionals']]},
]

const difference=[
  ['Tell us what you need','Start with the task, property, document, deadline, or problem. You do not need to know the correct service name.'],
  ['Confirm the scope','We identify what Pinnacle can handle directly, what requires a qualified provider, and what the work will involve.'],
  ['Coordinate the work','We schedule the right people, manage the handoffs, and keep you updated instead of sending you between separate vendors.'],
  ['Verify completion','Photos, documents, notes, signatures, and completion details are kept with the request so you have a clear record.'],
]

const requests=[
  ['Clean or deep-clean a property and prepare it for the next occupant','/projects/property-cleaning-turnover'],
  ['Inspect a property, take photos, meet a vendor, or confirm its condition','/services/property-field'],
  ['Coordinate eviction support, tenant turnover, REO, or vacant-property work','/services/property-field'],
  ['Prepare, deliver, file, sign, or notarize documents','/services/mobile-documents'],
  ['Add administrative, operational, client, or project support to my business','/services/business-operations'],
  ['Send a dependable local professional to a South Florida location','/projects/local-support-south-florida'],
]

export default function Home(){
  usePageMeta('Pinnacle Management Ventures - Business, Property, Document & Field Services','Nationwide business support, administration, documents, mobile notary, RON, property cleaning, inspections, eviction and REO support, and coordinated field services.')
  const reduceMotion = useReducedMotion()
  return <div className="min-h-screen bg-navy-950"><Header/><main>
    <section className="pmv-hero-story relative min-h-[calc(100vh-68px)] overflow-hidden border-b border-white/[.07]"><AmbientGlow/><div className="pmv-home-grid" aria-hidden="true"/><div className="container-pmv relative z-10 grid min-h-[calc(100vh-68px)] gap-8 py-14 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:py-20">
      <StaggerOnMount>
        <motion.p variants={staggerItem} className="eyebrow">Nationwide professional support · South Florida field services</motion.p>
        <motion.h1 variants={staggerItem} className="mt-6 max-w-4xl font-display text-5xl font-extrabold leading-[1.02] tracking-[-.05em] text-white sm:text-6xl lg:text-7xl xl:text-[5rem]">Business, property, document, and field support—<span className="pmv-gold-text">all in one place.</span></motion.h1>
        <motion.p variants={staggerItem} className="mt-7 max-w-3xl text-lg leading-8 text-slate-300 sm:text-xl">Pinnacle helps business owners, property owners, landlords, and professionals get real work done: operations and administrative support, document preparation and filing, mobile notary and RON, inspections, property cleaning, eviction and REO support, field visits, and vendor coordination.</motion.p>
        <motion.p variants={staggerItem} className="mt-4 max-w-2xl text-base leading-7 text-slate-500">Use Pinnacle for one straightforward task, ongoing support, or a multi-step project that needs one accountable point of contact.</motion.p>
        <motion.div variants={staggerItem} className="mt-9 flex flex-wrap gap-3"><a href={CLIENT_SIGNUP} className={btnPrimary}>Request a Service</a><Link to="/services" className={btnOutline}>View All Services</Link></motion.div>
        <motion.div variants={staggerItem} className="mt-9 grid max-w-2xl gap-3 border-t border-white/10 pt-5 text-[11px] font-semibold uppercase tracking-[.13em] text-slate-500 sm:grid-cols-3"><span>One-time or ongoing help</span><span>Nationwide coordination</span><span>Direct South Florida coverage</span></motion.div>
      </StaggerOnMount>
      <motion.div initial={{opacity:0,scale:.94,y:18}} animate={{opacity:1,scale:1,y:0}} transition={{...pmvMotion.gentle,delay:.18}} className="relative flex min-h-[360px] items-center justify-center lg:min-h-[520px] lg:justify-end">
        <motion.div className="pmv-free-floating-mark" animate={reduceMotion?undefined:{y:[0,-11,2,0],x:[0,5,-3,0],rotate:[-.5,.65,-.25,-.5]}} transition={{duration:13,repeat:Infinity,ease:'easeInOut'}}><WhiteGoldBrandMark size={370} decorative/></motion.div>
        <motion.div className="absolute bottom-5 right-0 max-w-[290px] border-l border-gold/45 pl-4 lg:bottom-14" animate={reduceMotion?undefined:{y:[0,-4,0]}} transition={{duration:8.5,repeat:Infinity,ease:'easeInOut'}}><p className="font-display text-sm font-semibold leading-6 text-white">One request. One accountable point of contact.</p><p className="mt-1 text-xs leading-5 text-slate-500">Clear updates and documented completion.</p></motion.div>
      </motion.div>
    </div></section>

    <section className="container-pmv py-16 sm:py-24"><Reveal className="grid gap-7 lg:grid-cols-[.72fr_1.28fr] lg:gap-16"><div><p className="eyebrow">Services</p><h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-[-.035em] text-white sm:text-5xl">Professional support for the work on your list.</h2></div><p className="max-w-3xl text-lg leading-8 text-slate-400 lg:pt-7">You do not need to turn every need into a consulting engagement or manage a different company for every task. Tell Pinnacle what needs to be handled, where it is, and when you need it. We will confirm the scope and coordinate the right next step.</p></Reveal><StaggerGroup className="mt-12 grid border-y border-white/10 lg:grid-cols-3">{audiences.map((item,i)=><motion.article variants={staggerItem} key={item.title} className="group border-b border-white/10 py-8 lg:border-b-0 lg:border-r lg:px-7 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0"><div className="flex items-center justify-between"><p className="eyebrow">{item.label}</p><span className="font-display text-xs text-gold/55">0{i+1}</span></div><Icon name={item.icon} size={22} className="mt-8 text-gold"/><h3 className="mt-5 font-display text-2xl font-bold tracking-[-.025em] text-white">{item.title}</h3><p className="mt-4 text-sm leading-7 text-slate-400">{item.body}</p><div className="mt-7 space-y-2">{item.links.map(([label,to])=><Link key={to} to={to} className="flex items-center justify-between border-t border-white/[.07] pt-2 text-xs font-semibold text-slate-300 transition group-hover:text-white"><span>{label}</span><span className="text-gold">↗</span></Link>)}</div></motion.article>)}</StaggerGroup></section>

    <section className="border-y border-gold/15 bg-gradient-to-br from-gold/[.055] via-white/[.012] to-transparent"><div className="container-pmv grid gap-12 py-16 sm:py-20 lg:grid-cols-[.8fr_1.2fr] lg:gap-16"><Reveal><p className="eyebrow">How requests are handled</p><h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-[-.035em] text-white sm:text-5xl">A clear process from request to completion.</h2><p className="mt-5 max-w-lg text-base leading-8 text-slate-400">Pinnacle gives you one place to explain the need, receive updates, share documents, and confirm the work is complete—even when several providers or steps are involved.</p><Link to="/about" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-gold">How Pinnacle works <span>→</span></Link></Reveal><div className="divide-y divide-white/10 border-y border-white/10">{difference.map(([title,body],i)=><Reveal key={title} delay={i*.05} className="grid gap-3 py-6 sm:grid-cols-[44px_170px_1fr] sm:items-start"><span className="font-display text-xs font-bold text-gold/60">0{i+1}</span><h3 className="font-display text-sm font-bold text-white">{title}</h3><p className="text-sm leading-6 text-slate-400">{body}</p></Reveal>)}</div></div></section>

    <section className="container-pmv py-16 sm:py-24"><Reveal className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-16"><div><p className="eyebrow">Common requests</p><h2 className="mt-4 font-display text-3xl font-bold tracking-[-.035em] text-white sm:text-4xl">Simple tasks are welcome.</h2><p className="mt-5 max-w-md text-sm leading-7 text-slate-400">You can call Pinnacle for a single cleaning, inspection, document, notary appointment, field visit, or administrative need. If the request grows into a larger project, we can coordinate that too.</p></div><div className="divide-y divide-white/10 border-y border-white/10">{requests.map(([label,to],i)=><Link key={label} to={to} className="group flex items-center justify-between gap-5 py-5"><div className="flex items-center gap-4"><span className="font-display text-xs font-bold text-gold/55">0{i+1}</span><span className="text-sm font-semibold text-slate-200 transition group-hover:text-gold sm:text-base">{label}</span></div><span className="text-gold transition-transform group-hover:translate-x-1">→</span></Link>)}</div></Reveal></section>

    <section className="pmv-trust-strip border-y border-gold/15"><div className="container-pmv grid gap-8 py-10 md:grid-cols-3">{[['Nationwide support','Business operations, administration, documents, signing, RON, and coordination available across the United States.'],['South Florida field coverage','Direct local support for cleaning, inspections, property visits, mobile notary, courthouse runs, and on-site requests.'],['One-time or ongoing service','Use Pinnacle for one defined task, a recurring need, a property portfolio, or a project involving several providers.']].map(([a,b])=><Reveal key={a}><strong className="font-display text-xl font-bold tracking-[-.02em] text-white">{a}</strong><p className="mt-2 text-sm leading-6 text-slate-400">{b}</p></Reveal>)}</div></section>

    <CtaBand title="What do you need handled?" body="Tell us the service, location, deadline, and outcome you need. We will confirm the scope and the next step." primary={{to:CLIENT_SIGNUP,label:'Request a Service'}} secondary={{to:'/contact',label:'Contact Pinnacle'}}/>
  </main><Footer/></div>
}
