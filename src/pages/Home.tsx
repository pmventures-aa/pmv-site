import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Header } from '../components/public/Header'
import { Footer } from '../components/public/Footer'
import { btnOutline, btnPrimary, CtaBand } from '../components/public/ui'
import { AmbientGlow, Reveal, StaggerGroup, StaggerOnMount, staggerItem } from '../components/public/motion'
import { usePageMeta } from '../lib/usePageMeta'
import { Icon, type IconName } from '../components/kit/Icon'
import { HeroGuideRail } from '../components/public/HeroGuideRail'
import { ScopeWizard } from '../components/public/ScopeWizard'
import { CaseStudyStrip, PublicMetricsBand } from '../components/public/Proof'

const CLIENT_SIGNUP='/scope-request?source=home'

const personas:{label:string;benefit:string;to:string}[]=[
  {label:'Landlords & Property Owners',benefit:'Property workspace: turnovers, inspections, vendors, and documented visits',to:'/services/property-field'},
  {label:'Real Estate Agents & Brokers',benefit:'On-site help so listings and closings stay on time',to:'/projects/local-support-south-florida?audience=agent-broker'},
  {label:'Real Estate Investors',benefit:'Eviction, REO, and possession work with a dedicated property path',to:'/scope-request?job=eviction_reo&audience=investor'},
  {label:'Business Owners & Operators',benefit:'Operations workspace: capacity, systems, and follow-through',to:'/services/business-operations'},
  {label:'Attorneys & Legal Teams',benefit:'Documents & signing: filings, notary, courier, and courthouse runs',to:'/services/mobile-documents'},
  {label:'Multi-Location Operators',benefit:'Ongoing operations support across sites and vendors',to:'/care-plans?family=ops'},
]

const audiences:{icon:IconName;label:string;title:string;body:string;links:[string,string][]}[]=[
  {icon:'briefcase',label:'Business & professional support',title:'Operations, administration, and project support.',body:'Add experienced support for day-to-day operations, administrative work, client follow-up, project coordination, process improvement, POS and payment systems, and vendor management.',links:[['Business support','/services/business-operations'],['POS & payment support','/services/merchant-services'],['Ops-on-Call retainer plans','/care-plans?family=ops']]},
  {icon:'building',label:'Property & field services',title:'On-site help for one property or an entire portfolio.',body:'Schedule inspections, property photos, cleaning and deep cleaning, tenant turnover, eviction support, REO and vacant-property work, vendor access, and documented field visits.',links:[['Property & field services','/services/property-field'],['Cleaning & turnover','/projects/property-cleaning-turnover'],['Property Care monthly plans','/care-plans?family=property']]},
  {icon:'file',label:'Documents, notary & signing',title:'Prepare, move, sign, notarize, and track documents.',body:'Get help with document preparation, delivery, filing, courthouse runs, mobile notary appointments, Remote Online Notarization, signing coordination, and secure completion records.',links:[['Document & notary services','/services/mobile-documents'],['Legal & Notary Pass plans','/care-plans?family=legal']]},
]

const difference=[
  ['Tell us what you need','Start with the task, property, document, deadline, or problem. You do not need to know the correct service name.'],
  ['Confirm the scope','We identify what Pinnacle can handle directly, what requires a qualified provider, and what the work will involve.'],
  ['Coordinate the work','We schedule the right people, manage the handoffs, and keep you updated instead of sending you between separate vendors.'],
  ['Verify completion','Photos, documents, notes, signatures, and completion details are kept with the request so you have a clear record.'],
]

export default function Home(){
  usePageMeta('Pinnacle Management Ventures - Business, Property, Document & Field Services','Nationwide business support, administration, documents, mobile notary, RON, property cleaning, inspections, eviction and REO support, and coordinated field services.')
  return <div className="min-h-screen bg-navy-950"><Header/><main>
    <section className="pmv-hero-story relative min-h-[calc(100vh-68px)] overflow-hidden border-b border-white/[.07]"><AmbientGlow/><div className="pmv-home-grid" aria-hidden="true"/><div className="container-pmv relative z-10 grid min-h-[calc(100vh-68px)] gap-8 py-14 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:py-20">
      <StaggerOnMount>
        <motion.p variants={staggerItem} className="eyebrow">Nationwide professional support · South Florida field services</motion.p>
        <motion.h1 variants={staggerItem} className="mt-6 max-w-4xl font-display text-5xl font-extrabold leading-[1.02] tracking-[-.05em] text-white sm:text-6xl lg:text-[3.75rem] xl:text-[4rem]"><span className="block">Business support.</span><span className="block">Property services.</span><span className="pmv-gold-text block">Documents &amp; field work.</span></motion.h1>
        <motion.p variants={staggerItem} className="mt-7 max-w-3xl text-lg leading-8 text-slate-300 sm:text-xl">Pinnacle helps business owners, property owners, landlords, and professionals get real work done: operations and administrative support, document preparation and filing, mobile notary and RON, inspections, property cleaning, eviction and REO support, field visits, and vendor coordination.</motion.p>
        <motion.p variants={staggerItem} className="mt-4 max-w-2xl text-base leading-7 text-slate-500">Use Pinnacle for one straightforward task, ongoing support, or a multi-step project that needs one accountable point of contact.</motion.p>
        <motion.div variants={staggerItem} className="mt-9 flex flex-wrap gap-3"><Link to={CLIENT_SIGNUP} className={btnPrimary}>Tell Us What You Need</Link><Link to="/services" className={btnOutline}>View All Services</Link></motion.div>
        <motion.p variants={staggerItem} className="mt-4 text-sm text-slate-500">Need a cleaning or inspection number first? <Link to="/instant-quote" className="font-semibold text-gold hover:underline">Get an instant estimate</Link></motion.p>
        <motion.div variants={staggerItem} className="mt-9 grid max-w-2xl gap-3 border-t border-white/10 pt-5 text-[11px] font-semibold uppercase tracking-[.13em] text-slate-500 sm:grid-cols-3"><span>One-time or ongoing help</span><span>Nationwide coordination</span><span>Direct South Florida coverage</span></motion.div>
      </StaggerOnMount>
      <motion.div initial={{opacity:0,scale:.96,y:18}} animate={{opacity:1,scale:1,y:0}} transition={{duration:.55,delay:.18}} className="relative lg:min-h-[520px]"><HeroGuideRail/></motion.div>
    </div></section>

    <section className="border-b border-white/[.07] bg-navy-900/30"><div className="container-pmv py-10 sm:py-14"><Reveal className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-gold">Built For</p><h2 className="mt-2 font-display text-2xl font-bold tracking-[-.02em] text-white sm:text-3xl">Find your world, jump in where it fits.</h2></div><p className="max-w-md text-xs leading-6 text-slate-500">Each path opens a dedicated operating world: property, documents, or business. The intake, portal, and follow-through match that work.</p></Reveal><div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Find support by client type">{personas.map(item=><Link key={item.label} to={item.to} className="group flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.02] px-4 py-3 transition hover:border-gold/45 hover:bg-white/[.045]"><span className="min-w-0"><span className="block text-sm font-bold leading-tight text-white group-hover:text-gold">{item.label}</span><span className="mt-1 block text-[11px] leading-5 text-slate-400">{item.benefit}</span></span><span className="text-gold transition-transform group-hover:translate-x-0.5">→</span></Link>)}</div></div></section>

    <section className="container-pmv py-16 sm:py-24"><Reveal className="grid gap-7 lg:grid-cols-[.72fr_1.28fr] lg:gap-16"><div><p className="eyebrow">Services</p><h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-[-.035em] text-white sm:text-5xl">Professional support for the work on your list.</h2></div><p className="max-w-3xl text-lg leading-8 text-slate-400 lg:pt-7">You do not need to turn every need into a consulting engagement or manage a different company for every task. Tell Pinnacle what needs to be handled, where it is, and when you need it. We will confirm the scope and coordinate the right next step.</p></Reveal><StaggerGroup className="mt-12 grid border-y border-white/10 lg:grid-cols-3">{audiences.map((item,i)=><motion.article variants={staggerItem} key={item.title} className="group border-b border-white/10 py-10 lg:border-b-0 lg:border-r lg:px-8 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0"><div className="flex items-center justify-between"><p className="eyebrow">{item.label}</p><span className="font-display text-xs text-gold/55">0{i+1}</span></div><Icon name={item.icon} size={26} className="mt-8 text-gold"/><h3 className="mt-6 font-display text-3xl font-bold leading-[1.08] tracking-[-.03em] text-white sm:text-[2.15rem]">{item.title}</h3><p className="mt-5 text-sm leading-7 text-slate-400">{item.body}</p><div className="mt-7 space-y-2">{item.links.map(([label,to])=><Link key={to} to={to} className="flex items-center justify-between border-t border-white/[.07] pt-2 text-xs font-semibold text-slate-300 transition group-hover:text-white"><span>{label}</span><span className="text-gold">↗</span></Link>)}</div></motion.article>)}</StaggerGroup></section>

    <section className="border-y border-gold/15 bg-gradient-to-br from-gold/[.055] via-white/[.012] to-transparent"><div className="container-pmv grid gap-12 py-16 sm:py-20 lg:grid-cols-[.8fr_1.2fr] lg:gap-16"><Reveal><p className="eyebrow">How requests are handled</p><h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-[-.035em] text-white sm:text-5xl">A clear process from request to completion.</h2><p className="mt-5 max-w-lg text-base leading-8 text-slate-400">Pinnacle gives you one place to explain the need, receive updates, share documents, and confirm the work is complete - even when several providers or steps are involved.</p><Link to="/about" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-gold">How Pinnacle works <span>→</span></Link></Reveal><div className="divide-y divide-white/10 border-y border-white/10">{difference.map(([title,body],i)=><Reveal key={title} delay={i*.05} className="grid gap-3 py-6 sm:grid-cols-[44px_170px_1fr] sm:items-start"><span className="font-display text-xs font-bold text-gold/60">0{i+1}</span><h3 className="font-display text-sm font-bold text-white">{title}</h3><p className="text-sm leading-6 text-slate-400">{body}</p></Reveal>)}</div></div></section>

    <section className="container-pmv py-16 sm:py-24"><div className="grid gap-10 lg:grid-cols-[.58fr_1.42fr] lg:items-start lg:gap-14"><Reveal><p className="eyebrow">Start a request</p><h2 className="mt-4 font-display text-3xl font-bold tracking-[-.035em] text-white sm:text-4xl">Two minutes. No account. Real reply.</h2><p className="mt-5 max-w-md text-sm leading-7 text-slate-400">Tell us what needs to happen, where, and when. We reply with what Pinnacle handles directly, what a qualified provider covers, and what it will run.</p><ul className="mt-5 space-y-2 text-sm text-slate-300"><li className="flex items-start gap-2"><span className="mt-1 text-gold">✓</span>No signup, no long form</li><li className="flex items-start gap-2"><span className="mt-1 text-gold">✓</span>Priced up front when we can</li><li className="flex items-start gap-2"><span className="mt-1 text-gold">✓</span>Same team across every request you send</li></ul><p className="mt-5 flex items-center gap-2 text-sm font-semibold text-white"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,.6)]"/>A real person replies within two business hours.</p></Reveal><ScopeWizard source="home" compact/></div></section>

    <section className="pmv-trust-strip border-y border-gold/15"><div className="container-pmv grid gap-8 py-10 md:grid-cols-3">{[['Nationwide support','Business operations, administration, documents, signing, RON, and coordination available across the United States.'],['South Florida field coverage','Direct local support for cleaning, inspections, property visits, mobile notary, courthouse runs, and on-site requests.'],['One-time or ongoing service','Use Pinnacle for one defined task, a recurring need, a property portfolio, or a project involving several providers.']].map(([a,b])=><Reveal key={a}><strong className="font-display text-xl font-bold tracking-[-.02em] text-white">{a}</strong><p className="mt-2 text-sm leading-6 text-slate-400">{b}</p></Reveal>)}</div></section>

    <PublicMetricsBand/>
    <CaseStudyStrip className="border-b border-white/10"/>

    <CtaBand title="What do you need handled?" body="Tell us the work, location, timing, and outcome. No account is required to start." primary={{to:CLIENT_SIGNUP,label:'Scope a Request'}} secondary={{to:'/contact',label:'Contact Pinnacle'}}/>
  </main><Footer/></div>
}
