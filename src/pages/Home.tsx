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
  {icon:'briefcase',label:'Business owners',title:'Keep the business moving.',body:'Add experienced capacity around clients, projects, systems, vendors, paperwork, and the operational changes that do not fit neatly inside one role.',links:[['Operations & admin','/services/business-operations'],['POS & payments','/services/merchant-services']]},
  {icon:'building',label:'Property owners',title:'Know what is happening on site.',body:'Handle a single visit or coordinate the full chain around a vacancy, turnover, eviction, REO asset, inspection, cleaning, access issue, or vendor project.',links:[['Property & field','/services/property-field'],['Cleaning & turnover','/projects/property-cleaning-turnover']]},
  {icon:'file',label:'Professionals',title:'Extend what you can deliver.',body:'Bring in reliable support for documents, filing, signing, mobile notary, RON, field assistance, and the follow-up your clients expect from you.',links:[['Documents & mobile','/services/mobile-documents'],['Professional network','/professionals']]},
]

const difference=[
  ['Listen once','You should not have to retell the same situation to every person involved.'],
  ['Keep the thread','Dates, decisions, documents, providers, and updates stay connected to the work.'],
  ['Work the exception','When the standard process breaks, Pinnacle finds the practical next move.'],
  ['Close the loop','Completion is verified, documented, and handed back with the next responsibility clear.'],
]

const requests=[
  ['A client or operational issue keeps circling without an owner','/services/business-operations'],
  ['I need dependable admin or project capacity','/services/administrative-support'],
  ['A property needs eyes on it, cleaning, access, or turnover work','/services/property-field'],
  ['I need documents prepared, moved, signed, or notarized','/services/mobile-documents'],
  ['I need someone reliable on site in South Florida','/projects/local-support-south-florida'],
]

export default function Home(){
  usePageMeta('Pinnacle Management Ventures - One Relationship. No Dropped Handoffs.','Nationwide operational, document, notary, property, and field support through one accountable client relationship, with direct field coverage in South Florida.')
  const reduceMotion = useReducedMotion()
  return <div className="min-h-screen bg-navy-950"><Header/><main>
    <section className="pmv-hero-story relative min-h-[calc(100vh-68px)] overflow-hidden border-b border-white/[.07]"><AmbientGlow/><div className="pmv-home-grid" aria-hidden="true"/><div className="container-pmv relative z-10 grid min-h-[calc(100vh-68px)] gap-8 py-14 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:py-20">
      <StaggerOnMount>
        <motion.p variants={staggerItem} className="eyebrow">Business · Property · Documents · Field</motion.p>
        <motion.h1 variants={staggerItem} className="mt-6 max-w-4xl font-display text-5xl font-extrabold leading-[.98] tracking-[-.055em] text-white sm:text-6xl lg:text-7xl xl:text-[5rem]">One relationship.<br/><span className="pmv-gold-text">No dropped handoffs.</span></motion.h1>
        <motion.p variants={staggerItem} className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">Pinnacle gives business owners, property owners, and professionals one dependable place to turn when the work crosses systems, vendors, paperwork, people, and locations.</motion.p>
        <motion.p variants={staggerItem} className="mt-4 max-w-xl text-base leading-7 text-slate-500">Start with one request. Bring us into the bigger picture when you are ready.</motion.p>
        <motion.div variants={staggerItem} className="mt-9 flex flex-wrap gap-3"><a href={CLIENT_SIGNUP} className={btnPrimary}>Bring Us a Request</a><Link to="/services" className={btnOutline}>See What We Handle</Link></motion.div>
        <motion.div variants={staggerItem} className="mt-9 grid max-w-2xl gap-3 border-t border-white/10 pt-5 text-[11px] font-semibold uppercase tracking-[.13em] text-slate-500 sm:grid-cols-3"><span>Nationwide coordination</span><span>South Florida field team</span><span>Secure client workspace</span></motion.div>
      </StaggerOnMount>
      <motion.div initial={{opacity:0,scale:.94,y:18}} animate={{opacity:1,scale:1,y:0}} transition={{...pmvMotion.gentle,delay:.18}} className="relative flex min-h-[360px] items-center justify-center lg:min-h-[520px] lg:justify-end">
        <motion.div className="pmv-free-floating-mark" animate={reduceMotion?undefined:{y:[0,-11,2,0],x:[0,5,-3,0],rotate:[-.5,.65,-.25,-.5]}} transition={{duration:13,repeat:Infinity,ease:'easeInOut'}}><WhiteGoldBrandMark size={370} decorative/></motion.div>
        <motion.div className="absolute bottom-5 right-0 max-w-[270px] border-l border-gold/45 pl-4 lg:bottom-14" animate={reduceMotion?undefined:{y:[0,-4,0]}} transition={{duration:8.5,repeat:Infinity,ease:'easeInOut'}}><p className="font-display text-sm font-semibold leading-6 text-white">From first call to closeout.</p><p className="mt-1 text-xs leading-5 text-slate-500">The context stays with the work.</p></motion.div>
      </motion.div>
    </div></section>

    <section className="container-pmv py-16 sm:py-24"><Reveal className="grid gap-7 lg:grid-cols-[.72fr_1.28fr] lg:gap-16"><div><p className="eyebrow">Where Pinnacle fits</p><h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-[-.035em] text-white sm:text-5xl">The work is rarely just one thing.</h2></div><p className="max-w-3xl text-lg leading-8 text-slate-400 lg:pt-7">A property turnover can involve access, notices, cleaning, vendors, photos, and follow-up. A business change can touch data, clients, staff, and systems. Pinnacle keeps the pieces connected so you are not left managing five separate conversations.</p></Reveal><StaggerGroup className="mt-12 grid border-y border-white/10 lg:grid-cols-3">{audiences.map((item,i)=><motion.article variants={staggerItem} key={item.title} className="group border-b border-white/10 py-8 lg:border-b-0 lg:border-r lg:px-7 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0"><div className="flex items-center justify-between"><p className="eyebrow">{item.label}</p><span className="font-display text-xs text-gold/55">0{i+1}</span></div><Icon name={item.icon} size={22} className="mt-8 text-gold"/><h3 className="mt-5 font-display text-2xl font-bold tracking-[-.025em] text-white">{item.title}</h3><p className="mt-4 text-sm leading-7 text-slate-400">{item.body}</p><div className="mt-7 space-y-2">{item.links.map(([label,to])=><Link key={to} to={to} className="flex items-center justify-between border-t border-white/[.07] pt-2 text-xs font-semibold text-slate-300 transition group-hover:text-white"><span>{label}</span><span className="text-gold">↗</span></Link>)}</div></motion.article>)}</StaggerGroup></section>

    <section className="border-y border-gold/15 bg-gradient-to-br from-gold/[.055] via-white/[.012] to-transparent"><div className="container-pmv grid gap-12 py-16 sm:py-20 lg:grid-cols-[.8fr_1.2fr] lg:gap-16"><Reveal><p className="eyebrow">The Pinnacle difference</p><h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-[-.035em] text-white sm:text-5xl">We stay where most vendors stop.</h2><p className="mt-5 max-w-lg text-base leading-8 text-slate-400">The task matters. So do the judgment, communication, and ownership around it. That is the part of the service clients remember.</p><Link to="/about" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-gold">Meet Pinnacle <span>→</span></Link></Reveal><div className="divide-y divide-white/10 border-y border-white/10">{difference.map(([title,body],i)=><Reveal key={title} delay={i*.05} className="grid gap-3 py-6 sm:grid-cols-[44px_170px_1fr] sm:items-start"><span className="font-display text-xs font-bold text-gold/60">0{i+1}</span><h3 className="font-display text-sm font-bold text-white">{title}</h3><p className="text-sm leading-6 text-slate-400">{body}</p></Reveal>)}</div></div></section>

    <section className="container-pmv py-16 sm:py-24"><Reveal className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-16"><div><p className="eyebrow">Start anywhere</p><h2 className="mt-4 font-display text-3xl font-bold tracking-[-.035em] text-white sm:text-4xl">Bring us the loose end taking up too much attention.</h2><p className="mt-5 max-w-md text-sm leading-7 text-slate-400">No polished brief required. Tell us what is happening, where it is, who is involved, and what “handled” should look like.</p></div><div className="divide-y divide-white/10 border-y border-white/10">{requests.map(([label,to],i)=><Link key={label} to={to} className="group flex items-center justify-between gap-5 py-5"><div className="flex items-center gap-4"><span className="font-display text-xs font-bold text-gold/55">0{i+1}</span><span className="text-sm font-semibold text-slate-200 transition group-hover:text-gold sm:text-base">{label}</span></div><span className="text-gold transition-transform group-hover:translate-x-1">→</span></Link>)}</div></Reveal></section>

    <section className="pmv-trust-strip border-y border-gold/15"><div className="container-pmv grid gap-8 py-10 md:grid-cols-3">{[['Remote when it can be','Operations, admin, documents, signing, and coordination available nationwide.'],['On site when it matters','Direct South Florida field coverage with qualified provider coordination elsewhere.'],['Visible from start to finish','A secure workspace for requests, updates, files, activity, and documented completion.']].map(([a,b])=><Reveal key={a}><strong className="font-display text-xl font-bold tracking-[-.02em] text-white">{a}</strong><p className="mt-2 text-sm leading-6 text-slate-400">{b}</p></Reveal>)}</div></section>

    <CtaBand title="What can Pinnacle carry for you?" body="Start with one task, one property, one document, or one operational problem. We will help you make the next move clear." primary={{to:CLIENT_SIGNUP,label:'Start a Request'}} secondary={{to:'/contact',label:'Talk It Through'}}/>
  </main><Footer/></div>
}
