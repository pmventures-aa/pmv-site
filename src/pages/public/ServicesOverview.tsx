import { Link } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { btnPrimary, PageIntro } from '../../components/public/ui'
import { Reveal } from '../../components/public/motion'
import { BrandMark3D } from '../../components/ui'
import { services } from '../../data/services'
import { usePageMeta } from '../../lib/usePageMeta'
import { Icon, type IconName } from '../../components/kit/Icon'

const CLIENT_SIGNUP = 'https://secure.pinnaclemanagementventures.com/signup?source=services-overview'
const hubs:{n:string;icon:IconName;title:string;body:string;to:string;includes:string}[]=[
  {n:'01',icon:'briefcase',title:'Business & Operations',body:'Support for owners and teams working through operational projects, system changes, vendor transitions, recurring administrative work, and business decisions.',to:'/services/business-operations',includes:'Consulting · POS & payments · Administration · Funding'},
  {n:'02',icon:'building',title:'Property & Field',body:'A local operational layer for owners who need property follow-up, documented field work, inspections, access coordination, and vendor support.',to:'/services/property-field',includes:'Owner support · Inspections · Field verification · Vendor coordination'},
  {n:'03',icon:'file',title:'Documents & Mobile',body:'Straightforward local assignments when documents, signers, offices, or destinations require dependable physical handling.',to:'/services/mobile-documents',includes:'Mobile notary · Document courier · Signing support'},
]

export default function ServicesOverview() {
  usePageMeta('Professional Services','Business consulting, POS and payment technology transition support, administrative operations, funding guidance, property support, mobile notary, and document services.')
  return <div className="min-h-screen bg-navy-950"><Header/><main>
    <section className="pmv-hero-story relative overflow-hidden border-b border-white/10"><div className="pmv-hero-gold" aria-hidden="true"/><div className="container-pmv grid gap-10 py-16 sm:py-20 lg:grid-cols-[1fr_.72fr] lg:items-center"><PageIntro kicker="Professional Services" title="Start with what needs to happen." subtitle="Pinnacle is organized around three practical areas of support. Choose the closest fit, or tell us the situation and let us help define the scope."/><Reveal className="relative flex min-h-[250px] items-center justify-center"><div className="pmv-story-orbit" aria-hidden="true"/><BrandMark3D size={180} decorative className="relative z-10"/></Reveal></div></section>

    <section className="container-pmv py-14 sm:py-18"><div className="border-y border-white/10">{hubs.map((hub)=><Reveal key={hub.to}><Link to={hub.to} className="group grid gap-4 border-b border-white/10 py-7 last:border-b-0 sm:grid-cols-[54px_48px_minmax(190px,.72fr)_1.28fr_auto] sm:items-center"><span className="font-display text-xs text-gold/70">{hub.n}</span><span className="text-gold"><Icon name={hub.icon} size={21}/></span><div><h2 className="text-xl font-semibold text-white transition group-hover:text-gold">{hub.title}</h2><p className="mt-1 text-[11px] uppercase tracking-[.11em] text-slate-500">{hub.includes}</p></div><p className="max-w-2xl text-sm leading-7 text-slate-400">{hub.body}</p><span className="text-gold transition-transform group-hover:translate-x-1">→</span></Link></Reveal>)}</div></section>

    <section className="pmv-gold-band border-y border-gold/15"><div className="container-pmv py-14 sm:py-18"><Reveal className="grid gap-8 lg:grid-cols-[.72fr_1.28fr]"><div><p className="eyebrow">How engagements work</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">The scope should match the problem.</h2></div><div className="grid gap-x-8 sm:grid-cols-3">{[
      ['One-time','A defined task or short project with a clear outcome.'],['Project','Hands-on coordination through a transition, implementation, or multi-step initiative.'],['Ongoing','Recurring support when the work needs consistent follow-up without another full-time role.'],
    ].map(([title,body])=><div key={title} className="border-t border-gold/30 py-4"><h3 className="font-semibold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{body}</p></div>)}</div></Reveal></div></section>

    <section className="container-pmv py-14 sm:py-18"><Reveal className="max-w-3xl"><p className="eyebrow">Complete service index</p><h2 className="mt-3 font-display text-3xl font-medium text-white">Looking for something specific?</h2><p className="mt-3 text-sm leading-7 text-slate-400">Individual service pages remain available for detailed scope, common use cases, and intake requirements.</p></Reveal><div className="mt-7 grid border-y border-white/10 sm:grid-cols-2">{services.map((service,i)=><Link key={service.slug} to={`/services/${service.slug}`} className={`group flex items-center justify-between gap-5 border-b border-white/10 py-5 sm:px-5 ${i%2===0?'sm:border-r':''}`}><div><p className="text-xs text-gold/70">{service.tag}</p><h3 className="mt-1 font-semibold text-white group-hover:text-gold">{service.title}</h3></div><span className="text-gold transition group-hover:translate-x-1">→</span></Link>)}</div></section>

    <section className="container-pmv pb-16"><Reveal className="flex flex-col items-start justify-between gap-5 border-t border-gold/20 pt-9 sm:flex-row sm:items-center"><div className="max-w-xl"><h2 className="font-display text-2xl font-medium text-white">Still not sure where it fits?</h2><p className="mt-2 text-sm leading-7 text-slate-400">That is fine. Start with the situation, the deadline, or the outcome you need. We can help sort out the rest.</p></div><a href={CLIENT_SIGNUP} className={btnPrimary}>Tell Us What You Need</a></Reveal></section>
  </main><Footer/></div>
}
