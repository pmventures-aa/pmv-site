import { Link } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { Reveal } from '../../components/public/motion'
import { btnOutline, btnPrimary } from '../../components/public/ui'
import { BrandMark3D } from '../../components/ui'
import { services, type ServiceInfo } from '../../data/services'
import { usePageMeta } from '../../lib/usePageMeta'

const CLIENT_SIGNUP = '/portal/signup'

type HubConfig = {
  eyebrow: string
  title: string
  intro: string
  statement: string
  serviceSlugs: string[]
  themes: [string, string][]
  metaTitle: string
  metaDescription: string
}

const HUBS: Record<'business'|'property'|'mobile', HubConfig> = {
  business: {
    eyebrow: 'Business & Operations',
    title: 'Support for the systems, projects, and decisions behind the business.',
    intro: 'Pinnacle works alongside owners and teams when operations need more structure, a transition needs coordination, or important work is sitting between departments, vendors, and providers.',
    statement: 'Use us for a defined project or as an ongoing operational resource. The point is not to add another layer. It is to give the work a clear owner.',
    serviceSlugs: ['consulting','merchant-services','administrative-support','funding'],
    themes: [
      ['Operational projects','Process changes, vendor transitions, launches, and work that needs someone driving the next step.'],
      ['Systems & technology','POS, payments, CRM, software, data preparation, implementation, training, and vendor coordination.'],
      ['Administrative capacity','Reliable help with records, follow-up, scheduling, communication, and recurring operational work.'],
      ['Business readiness','Organizing information, financing conversations, and projects that require stronger preparation before execution.'],
    ],
    metaTitle: 'Business & Operations Support',
    metaDescription: 'Business consulting, POS and payment transitions, administrative support, project coordination, and funding readiness support from Pinnacle Management Ventures.',
  },
  property: {
    eyebrow: 'Property Care & Field Services',
    title: 'From a simple deep clean to a complete property turnover.',
    intro: 'Pinnacle gives owners, landlords, agents, investors, and asset teams one place to request the practical work a property needs: cleaning, inspections, REO support, eviction-related coordination, access, vendors, documentation, and ready-to-market follow-through.',
    statement: 'Request one service for one address or coordinate several steps across a property or portfolio. South Florida field coverage includes clear status updates and agreed completion documentation.',
    serviceSlugs: ['property-management','property-inspections'],
    themes: [
      ['Cleaning & turnovers','Routine, deep, move-out, rent-ready, REO, and vacant-property cleaning coordinated to the actual condition and outcome.'],
      ['Inspections & documentation','Occupancy checks, condition observations, progress photos, before-and-after reporting, and defined site audits.'],
      ['Eviction & possession support','Administrative documents, process coordination, authorized posting or delivery, attorney handoff, lockout logistics, and post-possession turnover within the permitted scope.'],
      ['REO & property preservation','Securing, debris, access, vendor work, exterior needs, hazard follow-up, and ready-to-market coordination for vacant or bank-owned assets.'],
    ],
    metaTitle: 'Property & Field Services',
    metaDescription: 'South Florida property cleaning, deep cleaning, inspections, eviction support, REO and vacant-property preservation, turnovers, vendor coordination, and documented field services.',
  },
  mobile: {
    eyebrow: 'Documents & Mobile',
    title: 'Prepare it, move it, file it, sign it, or get it where it needs to go.',
    intro: 'Pinnacle provides practical document support without turning every request into a larger project. We can organize and prepare permitted client-directed paperwork, coordinate filing or delivery, schedule mobile notarization, and keep confirmation connected to the client record.',
    statement: 'These services are intentionally straightforward: clear scope, clear handling requirements, and clear confirmation when the assignment is complete.',
    serviceSlugs: ['document-preparation','mobile-notary','document-courier'],
    themes: [
      ['Document preparation','Organize information, format permitted client-directed documents, and assemble business or property packets.'],
      ['Mobile notary','Coordinate eligible Florida notarizations at a convenient South Florida location.'],
      ['Document delivery','Point-to-point pickup and delivery for business, real estate, and time-sensitive documents.'],
      ['Assignment tracking','Keep timing, handling instructions, communication, and completion details organized.'],
      ['Filing & process support','Coordinate copies, delivery, courthouse or agency runs, receipts, and follow-up for defined administrative filings.'],
    ],
    metaTitle: 'Mobile Notary & Document Services',
    metaDescription: 'South Florida mobile notary, document courier, signing support, and tracked local document services from Pinnacle Management Ventures.',
  },
}

function ServiceRow({ service }: { service: ServiceInfo }) {
  return (
    <Link to={`/services/${service.slug}`} className="group grid gap-4 border-t border-white/10 py-6 transition-colors hover:border-gold/35 sm:grid-cols-[minmax(180px,.65fr)_1.35fr_auto] sm:items-center">
      <div><p className="text-xs font-semibold uppercase tracking-[.13em] text-gold/75">{service.tag}</p><h3 className="mt-2 text-lg font-semibold text-white transition group-hover:text-gold">{service.title}</h3></div>
      <p className="max-w-2xl text-sm leading-6 text-slate-400">{service.shortDescription}</p>
      <span className="text-sm font-medium text-gold">View service <span className="inline-block transition-transform group-hover:translate-x-1">→</span></span>
    </Link>
  )
}

function HubPage({ hub }: { hub: keyof typeof HUBS }) {
  const cfg = HUBS[hub]
  const hubServices = cfg.serviceSlugs.map((slug) => services.find((service) => service.slug === slug)).filter(Boolean) as ServiceInfo[]
  usePageMeta(cfg.metaTitle, cfg.metaDescription)

  return <div className="min-h-screen bg-navy-950"><Header/><main>
    <section className="pmv-hero-story relative overflow-hidden border-b border-white/[.08]">
      <div className="pmv-hero-gold" aria-hidden="true" />
      <div className="container-pmv grid gap-10 py-16 sm:py-20 lg:grid-cols-[1.12fr_.88fr] lg:items-center lg:py-24">
        <Reveal><p className="eyebrow">{cfg.eyebrow}</p><h1 className="mt-4 max-w-4xl font-display text-4xl font-medium leading-[1.06] tracking-[-.03em] text-white sm:text-6xl">{cfg.title}</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">{cfg.intro}</p><p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">{cfg.statement}</p><div className="mt-8 flex flex-wrap gap-3"><a href={`${CLIENT_SIGNUP}?source=${hub}-hub`} className={btnPrimary}>Start a Request</a><Link to="/services" className={btnOutline}>All Services</Link></div></Reveal>
        <Reveal className="relative flex min-h-[300px] items-center justify-center"><div className="pmv-story-orbit" aria-hidden="true"/><BrandMark3D size={210} decorative className="relative z-10"/><div className="absolute bottom-4 right-0 max-w-[210px] border-l border-gold/35 pl-4 text-sm leading-6 text-slate-300">One client relationship. The right scope for the work.</div></Reveal>
      </div>
    </section>

    <section className="container-pmv py-14 sm:py-18"><Reveal className="grid gap-10 lg:grid-cols-[.7fr_1.3fr]"><div><p className="eyebrow">Where we help</p><h2 className="mt-3 font-display text-3xl font-medium text-white">Common reasons clients bring this work to Pinnacle.</h2></div><div className="grid gap-x-10 sm:grid-cols-2">{cfg.themes.map(([title,body])=><div key={title} className="border-t border-gold/25 py-5"><h3 className="font-semibold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{body}</p></div>)}</div></Reveal></section>

    <section className="border-y border-white/[.08] bg-navy-900/30"><div className="container-pmv py-14 sm:py-18"><Reveal className="mb-7 max-w-3xl"><p className="eyebrow">Services</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Choose a service, or start with the situation.</h2><p className="mt-4 text-sm leading-7 text-slate-400">These pages explain the typical scope in more detail. If your need crosses categories, start a request and we can help organize it.</p></Reveal><div className="border-b border-white/10">{hubServices.map((service)=><ServiceRow key={service.slug} service={service}/>)}</div></div></section>

    <section className="container-pmv py-14 sm:py-18"><Reveal className="grid gap-8 border-y border-gold/20 py-9 lg:grid-cols-[1fr_auto] lg:items-center"><div><p className="eyebrow">Not sure where it fits?</p><h2 className="mt-2 font-display text-3xl font-medium text-white">You can start with the problem instead of the service name.</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">Give us enough context to understand what needs to happen. We will help identify the most practical scope and next step.</p></div><a href={`${CLIENT_SIGNUP}?source=${hub}-hub-bottom`} className={btnPrimary}>Tell Us What You Need</a></Reveal></section>
  </main><Footer/></div>
}

export function BusinessOperationsHub(){ return <HubPage hub="business"/> }
export function PropertyFieldHub(){ return <HubPage hub="property"/> }
export function MobileDocumentHub(){ return <HubPage hub="mobile"/> }
