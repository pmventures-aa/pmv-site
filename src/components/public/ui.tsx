import { motion } from 'motion/react'
import type { ServiceInfo } from '../../data/services'
import { Reveal, RevealHeading, StaggerGroup, staggerItem } from './motion'
import { ViewTransitionLink } from './ViewTransitionLink'

export const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-md bg-gold px-6 py-3 text-sm font-semibold text-navy-950 transition-colors duration-200 hover:bg-gold-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950'
export const btnOutline = 'inline-flex items-center justify-center gap-2 rounded-md border border-white/18 px-6 py-3 text-sm font-semibold text-slate-100 transition-colors duration-200 hover:border-gold/55 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950'
export const panelCls = 'rounded-lg border border-white/10 bg-navy-900/55 p-6 sm:p-8'

export function TagLine({ tag, popular }: { tag: string; popular?: boolean }) { return <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold/85">{tag}{popular ? ' · Featured' : ''}</p> }
export function MotionStage() { return <div className="pmv-motion-stage" aria-hidden="true"><div className="pmv-orbit pmv-orbit-one"/><div className="pmv-orbit pmv-orbit-two"/><motion.div className="pmv-stage-card pmv-stage-card-back" animate={{y:[0,-5,0]}} transition={{duration:10,repeat:Infinity,ease:'easeInOut'}}><span>Property</span><strong>Field work</strong><small>Visits · Vendors · Documents</small></motion.div><motion.div className="pmv-stage-card pmv-stage-card-main" animate={{y:[0,5,0]}} transition={{duration:9,repeat:Infinity,ease:'easeInOut'}}><div className="pmv-stage-topline"><span>Pinnacle workspace</span><i/></div><div className="pmv-stage-bars"><b/><b/><b/></div><div className="pmv-stage-grid"><span/><span/><span/><span/></div><div className="pmv-stage-footer"><span>Projects</span><span>Messages</span><span>Documents</span></div></motion.div><motion.div className="pmv-stage-card pmv-stage-card-front" animate={{y:[0,-6,0]}} transition={{duration:8.5,repeat:Infinity,ease:'easeInOut'}}><span>Operations</span><strong>Next step ready</strong><small>Consulting · Systems · Support</small></motion.div><motion.div className="pmv-stage-pill pmv-stage-pill-one" animate={{y:[0,-8,0]}} transition={{duration:7,repeat:Infinity,ease:'easeInOut'}}>Client update</motion.div><motion.div className="pmv-stage-pill pmv-stage-pill-two" animate={{y:[0,6,0]}} transition={{duration:8,repeat:Infinity,ease:'easeInOut'}}>Assigned</motion.div></div> }
export function PageIntro({ kicker, title, subtitle, align='left' }: { kicker:string; title:string; subtitle?:string; align?:'left'|'center' }) { const centered=align==='center';return <div className={`${centered?'mx-auto max-w-4xl text-center':'max-w-4xl'}`}><Reveal><p className="eyebrow">{kicker}</p></Reveal><RevealHeading className="mt-4"><h1 className="pmv-h1">{title}</h1></RevealHeading>{subtitle&&<Reveal delay={0.06}><p className={`mt-5 max-w-2xl text-lg leading-8 text-slate-300 ${centered?'mx-auto':''}`}>{subtitle}</p></Reveal>}</div> }

function CtaLink({to,label,className}:{to:string;label:string;className:string}){return /^https?:\/\//i.test(to)?<a href={to} className={className}>{label}</a>:<ViewTransitionLink to={to} className={className}>{label}</ViewTransitionLink>}
export function CtaBand({ title, body, primary, secondary }: { title:string; body:string; primary:{to:string;label:string}; secondary?:{to:string;label:string} }) {
  return <section className="border-y border-white/10 bg-navy-900/55"><Reveal className="container-pmv flex flex-col items-start gap-8 py-14 sm:py-16 lg:flex-row lg:items-center lg:justify-between"><div className="max-w-2xl"><p className="eyebrow">Next step</p><h2 className="mt-3 font-display text-3xl font-bold tracking-[-.03em] text-white sm:text-4xl">{title}</h2><p className="mt-4 max-w-xl text-base leading-7 text-slate-300">{body}</p></div><div className="flex flex-wrap gap-3"><CtaLink to={primary.to} label={primary.label} className={btnPrimary}/>{secondary&&<CtaLink to={secondary.to} label={secondary.label} className={btnOutline}/>}</div></Reveal></section>
}

export function SplitFeatures({ items }: { items:[string,string][] }) { return <StaggerGroup className="divide-y divide-white/10 border-y border-white/10">{items.map(([title,body],i)=><motion.div key={title} variants={staggerItem} className="grid gap-3 py-6 sm:grid-cols-[72px_minmax(0,1fr)] sm:gap-7"><span className="font-display text-sm text-gold/75">{String(i+1).padStart(2,'0')}</span><div className="grid gap-2 md:grid-cols-[minmax(180px,.6fr)_minmax(0,1fr)] md:gap-8"><h3 className="text-base font-semibold text-white">{title}</h3><p className="text-sm leading-6 text-slate-400">{body}</p></div></motion.div>)}</StaggerGroup> }
export function Faq({ items }: { items:[string,string][] }) {
  // Emit FAQPage structured data so these questions can earn rich results.
  // `<` is escaped to keep the JSON-LD from breaking out of the script tag.
  const faqLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  }).replace(/</g, '\\u003c')
  return <div className="border-y border-white/10">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqLd }} />
    {items.map(([question,answer])=><details key={question} className="group border-b border-white/[.07] py-5 last:border-b-0"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-white transition-colors hover:text-gold marker:content-none">{question}<span className="shrink-0 text-gold transition duration-200 group-open:rotate-45">+</span></summary><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{answer}</p></details>)}
  </div>
}
export function ServiceList({ items, compact=false }: { items:ServiceInfo[]; compact?:boolean }) { return <StaggerGroup className="border-y border-white/10">{items.map((s,i)=><motion.div key={s.slug} variants={staggerItem} className="border-b border-white/[.075] last:border-b-0"><ViewTransitionLink to={`/services/${s.slug}`} className="group grid gap-4 py-6 sm:grid-cols-[54px_minmax(180px,.7fr)_minmax(0,1fr)_auto] sm:items-start sm:gap-6"><span className="pt-0.5 font-display text-xs text-gold/65">{String(i+1).padStart(2,'0')}</span><div><h3 className="text-base font-semibold text-white transition-colors group-hover:text-gold">{s.title}</h3>{s.popular&&<span className="mt-2 inline-block text-[10px] font-semibold uppercase tracking-[.12em] text-gold/75">Featured</span>}</div>{!compact?<p className="max-w-2xl text-sm leading-6 text-slate-400">{s.shortDescription}</p>:<span/>}<span className="text-sm font-medium text-slate-500 transition group-hover:translate-x-1 group-hover:text-gold">View ›</span></ViewTransitionLink></motion.div>)}</StaggerGroup> }
