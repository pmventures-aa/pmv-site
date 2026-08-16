import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { ViewTransitionLink } from '../../components/public/ViewTransitionLink'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { AmbientGlow, Reveal } from '../../components/public/motion'
import { btnOutline, btnPrimary, CtaBand } from '../../components/public/ui'
import { usePageMeta } from '../../lib/usePageMeta'
import { CaseStudyStrip } from '../../components/public/Proof'

export type ProjectGuide = {
  slug: string
  eyebrow: string
  title: string
  summary: string
  fit: string[]
  owns: string[]
  needs: string[]
  steps: [string,string][]
  related: {label:string;to:string}[]
}

export const projectGuides: ProjectGuide[] = [
  {
    slug:'switching-pos-payment-providers',
    eyebrow:'POS & Payments',
    title:'Switching POS or payment providers without losing control of the transition',
    summary:'A processor or POS change touches more than pricing. It can involve data, hardware, integrations, funding, staff training, customer records, reporting, and multiple vendors. Pinnacle can coordinate the change from the first inventory through cutover and follow-up.',
    fit:['You have chosen a new provider but need someone to organize the move.','You are still comparing options and need operational context, not just a sales pitch.','The current system has data, integration, service, or workflow problems that need to be mapped before a switch.'],
    owns:['Current-state inventory and transition checklist','Vendor and stakeholder coordination','Data-export and migration tracking','Hardware, gateway, integration, and funding dependencies','Cutover planning, issue tracking, and post-launch follow-up'],
    needs:['Current provider and system details','Key business workflows and integrations','Important dates or contract constraints','The people who need to approve or participate in the transition'],
    steps:[['Map what cannot break','Document the systems, data, workflows, devices, funding needs, and dependencies that matter before anyone starts moving things.'],['Build the handoff plan','Put responsibilities, deadlines, vendor steps, and open questions in one place.'],['Coordinate cutover','Keep the implementation moving and surface blockers before they become launch-day surprises.'],['Close the loop','Verify deposits, reporting, integrations, user access, and any remaining cleanup after launch.']],
    related:[{label:'Business Consulting & Operations',to:'/services/business-operations'},{label:'Moving data between systems',to:'/projects/moving-data-between-systems'}],
  },
  {
    slug:'moving-data-between-systems',
    eyebrow:'Data & Systems',
    title:'Moving business data between systems without turning it into a guessing game',
    summary:'Data migrations often fail in the handoffs: what can be exported, what the new system accepts, who owns the cleanup, and what gets verified afterward. Pinnacle can keep the source, destination, vendors, files, mapping decisions, and validation work connected.',
    fit:['You are replacing software and need to move customer, transaction, inventory, membership, or operational data.','Two vendors are involved and each expects the other side to define the migration.','You already have exports but need help organizing, mapping, validating, or coordinating the import.'],
    owns:['Export and source-data inventory','Field mapping and file coordination','Vendor communication and issue tracking','Migration checkpoints and exception lists','Post-import validation and cleanup tracking'],
    needs:['Source and destination systems','Available exports, samples, or field lists','Critical records that must be preserved','Any regulatory, retention, or timing constraints'],
    steps:[['Inventory the source','Confirm what exists, what can be exported, and what matters to the business.'],['Map the destination','Identify where each important data element belongs and flag gaps early.'],['Coordinate the move','Keep files, approvals, vendor questions, and import steps organized.'],['Validate the result','Check the migrated records against the source and document exceptions that still need attention.']],
    related:[{label:'Business Consulting & Operations',to:'/services/business-operations'},{label:'POS & payment transitions',to:'/projects/switching-pos-payment-providers'}],
  },
  {
    slug:'managing-business-transition',
    eyebrow:'Operational Transition',
    title:'When a business change has too many moving parts for one team to absorb',
    summary:'Some projects are difficult because no single vendor, employee, or advisor owns the whole transition. Pinnacle can sit across the moving pieces, keep decisions and dependencies visible, and make sure the next step always has an owner.',
    fit:['A system, vendor, location, process, or operating model is changing.','The work crosses several departments or outside providers.','Important tasks are being handled, but nobody has a reliable view of the full project.'],
    owns:['Scope, workstream, and dependency tracking','Vendor and internal-team coordination','Decision logs, blockers, and follow-up','Document and information collection','Implementation closeout and handoff'],
    needs:['The outcome you are trying to reach','Key stakeholders and vendors','Known deadlines, commitments, and risks','Existing project notes, contracts, or working documents'],
    steps:[['Define the outcome','Get specific about what is changing and what a successful end state looks like.'],['Separate the workstreams','Turn a broad transition into manageable responsibilities and dependencies.'],['Keep the middle connected','Track decisions, blockers, documents, vendors, and next actions as the project moves.'],['Finish deliberately','Confirm what is complete, what carries forward, and who owns the operating state after the transition.']],
    related:[{label:'Business Consulting & Operations',to:'/services/business-operations'},{label:'Ongoing administrative support',to:'/projects/ongoing-administrative-support'}],
  },
  {
    slug:'local-support-south-florida',
    eyebrow:'South Florida Field Support',
    title:'When you need a dependable person on the ground in South Florida',
    summary:'Remote ownership works until something needs to be seen, verified, delivered, opened, documented, or coordinated in person. Pinnacle provides a local operating layer for clearly defined field and property assignments.',
    fit:['You manage a property, business, vendor, or project remotely.','A location needs inspection, access, documentation, delivery, or follow-up.','You need local confirmation before making a larger decision.'],
    owns:['Field visits and documented observations','Photo and status verification','Vendor access and coordination','Document pickup, delivery, and signing support','Clear follow-up after the visit'],
    needs:['Location and access details','The specific condition, task, or outcome to verify','Any vendor or site contact information','Instructions for documentation and escalation'],
    steps:[['Confirm the assignment','Make the scope, access, timing, and documentation requirements clear.'],['Handle the field work','Complete the visit or coordination with a practical checklist.'],['Document what happened','Provide photos, notes, receipts, confirmations, or other agreed evidence.'],['Escalate what matters','Surface anything that needs a decision instead of burying it in a generic completion note.']],
    related:[{label:'Property & Field Support',to:'/services/property-field'},{label:'Documents & Mobile Services',to:'/services/mobile-documents'}],
  },
  {
    slug:'property-cleaning-turnover',
    eyebrow:'Property Cleaning & Turnover',
    title:'Get the property clean, documented, and ready for what comes next',
    summary:'Whether the need is a deep clean, move-out service, REO cleanup, listing preparation, or a full rent-ready turnover, Pinnacle can define the condition, coordinate access and vendors, and document completion.',
    fit:['A tenant moved out and the property needs to be cleaned and prepared.','A vacant, inherited, REO, or bank-owned property needs attention before inspection, listing, or occupancy.','You need one point of contact across cleaning, debris, access, inspections, and other make-ready work.'],
    owns:['Scope and property-condition intake','Cleaning, deep cleaning, debris, and vendor coordination','Access instructions and scheduling','Before-and-after photo documentation when requested','Open-item tracking through completion'],
    needs:['Property address and authorized access details','Property type, approximate size, and current condition','Photos or known problem areas when available','Target date and the outcome the property needs to meet'],
    steps:[['Confirm the condition','Use photos, a field visit, or owner details to understand the actual cleaning and turnover need.'],['Set the scope','Identify cleaning, debris, access, inspection, and vendor responsibilities before work begins.'],['Coordinate the work','Keep arrival details, property access, updates, and exceptions connected.'],['Document completion','Provide the agreed photos, notes, receipts, and remaining items so the next step is clear.']],
    related:[{label:'Property Care & Field Services',to:'/services/property-field'},{label:'Property inspections',to:'/services/property-inspections'}],
  },
  {
    slug:'eviction-turnover-support',
    eyebrow:'Eviction & Property Recovery Support',
    title:'Keep the eviction process, possession handoff, and property turnover connected',
    summary:'Eviction work can involve notices, records, filing logistics, attorney coordination, service, court milestones, lawful possession, locksmith access, inspection, debris, and cleaning. Pinnacle can coordinate the permitted administrative and field work while keeping legal responsibilities with the appropriate licensed professional.',
    fit:['You need help organizing records or permitted eviction-related documents.','The matter needs filing, service, or attorney coordination and you need someone tracking the handoffs.','A writ or lawful possession date is approaching and the property will need access, documentation, securing, cleaning, or turnover work.'],
    owns:['Administrative intake and document organization','Permitted client-directed preparation, delivery, and filing coordination','Attorney or process-provider handoff when required','Authorized lockout-day and vendor logistics','Post-possession inspection, cleaning, debris, and securing coordination'],
    needs:['Property, tenant, lease, ledger, notice, and case information','Current stage and any deadlines or court documents','Owner or authorized-agent confirmation','Attorney, sheriff, clerk, locksmith, or vendor details already involved'],
    steps:[['Identify the legal stage','Confirm what has and has not happened so administrative support does not outrun the lawful process.'],['Organize the handoffs','Keep permitted documents, service, filing, attorney review, deadlines, and status in one working plan.'],['Prepare for possession','Coordinate only authorized access, officials, locksmiths, vendors, and property documentation.'],['Recover the property','After lawful possession, document condition and coordinate securing, debris, cleaning, inspection, and turnover work.']],
    related:[{label:'Property Care & Field Services',to:'/services/property-field'},{label:'Document Preparation & Filing Support',to:'/services/document-preparation'}],
  },
  {
    slug:'ongoing-administrative-support',
    eyebrow:'Ongoing Operations',
    title:'Ongoing administrative support for work that keeps slipping between roles',
    summary:'Not every operating need justifies another full-time position. Pinnacle can take ownership of defined recurring work, keep it organized, and provide a consistent point of follow-through without forcing the engagement into a one-size-fits-all package.',
    fit:['Recurring administrative work is consuming leadership time.','Several small responsibilities are important but do not cleanly belong to one role.','You need reliable coordination across clients, vendors, records, documents, or follow-up.'],
    owns:['Recurring task and follow-up management','Document and record coordination','Vendor and client communication support','Operational checklists and handoffs','Simple reporting on what is open, complete, and blocked'],
    needs:['The recurring work you want off your plate','Existing tools, systems, and access requirements','Expected response times and escalation rules','A clear owner for final business decisions when needed'],
    steps:[['Define the recurring scope','Separate repeatable work from decisions that should stay with your team.'],['Build the operating rhythm','Set expectations for cadence, communication, documentation, and escalation.'],['Run the work','Keep routine tasks moving without creating another layer of management for you.'],['Review and adjust','Refine the scope as the actual workload becomes clearer.']],
    related:[{label:'Business Consulting & Operations',to:'/services/business-operations'},{label:'Managing a business transition',to:'/projects/managing-business-transition'}],
  },
]

const guideServiceKey:Record<string,string>={
  'switching-pos-payment-providers':'merchant_services',
  'moving-data-between-systems':'merchant_services',
  'managing-business-transition':'consulting',
  'local-support-south-florida':'property_inspections',
  'property-cleaning-turnover':'property_management',
  'eviction-turnover-support':'property_management',
  'ongoing-administrative-support':'admin_support',
}

function GuidePage({guide}:{guide:ProjectGuide}){
  usePageMeta(guide.title,guide.summary)
  const [params]=useSearchParams()
  const audience=params.get('audience')||undefined
  const requestUrl=`/scope-request?guide=${encodeURIComponent(guide.slug)}${audience?`&audience=${encodeURIComponent(audience)}`:''}&source=project-${encodeURIComponent(guide.slug)}`
  return <div className="min-h-screen bg-navy-950"><Header/><main>
    <section className="pmv-hero-story relative overflow-hidden border-b border-white/10"><AmbientGlow/><div className="pmv-hero-gold" aria-hidden="true"/><div className="container-pmv relative z-10 py-16 sm:py-20 lg:py-24"><Reveal className="max-w-4xl"><p className="eyebrow">{guide.eyebrow}</p><h1 className="pmv-h1 mt-4">{guide.title}</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">{guide.summary}</p><div className="mt-8 flex flex-wrap gap-3"><ViewTransitionLink className={btnPrimary} to={requestUrl}>Scope This Project</ViewTransitionLink><ViewTransitionLink className={btnOutline} to="/contact">Talk With Pinnacle</ViewTransitionLink></div></Reveal></div></section>

    <section className="container-pmv py-14 sm:py-18"><div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr]"><Reveal><p className="eyebrow">A good fit when</p><h2 className="mt-3 font-display text-3xl font-semibold text-white">You know something needs to move, but the handoffs are the hard part.</h2></Reveal><Reveal><div className="divide-y divide-white/10 border-y border-white/10">{guide.fit.map((item,i)=><div key={item} className="flex gap-4 py-5"><span className="font-display text-xs text-gold/70">0{i+1}</span><p className="text-sm leading-7 text-slate-300">{item}</p></div>)}</div></Reveal></div></section>

    <section className="pmv-gold-band border-y border-gold/15"><div className="container-pmv grid gap-10 py-14 sm:py-18 lg:grid-cols-2"><Reveal><p className="eyebrow">What Pinnacle can own</p><div className="mt-5 space-y-3">{guide.owns.map(item=><div key={item} className="border-l border-gold/35 pl-4 text-sm leading-6 text-slate-300">{item}</div>)}</div></Reveal><Reveal><p className="eyebrow">What helps us start well</p><div className="mt-5 space-y-3">{guide.needs.map(item=><div key={item} className="border-l border-white/15 pl-4 text-sm leading-6 text-slate-400">{item}</div>)}</div></Reveal></div></section>

    <section className="container-pmv py-14 sm:py-18"><Reveal className="grid gap-10 lg:grid-cols-[.72fr_1.28fr]"><div><p className="eyebrow">Typical engagement</p><h2 className="mt-3 font-display text-3xl font-semibold text-white">Enough structure to keep the project moving. No extra ceremony.</h2></div><div className="pmv-process-line">{guide.steps.map(([title,body],i)=><div key={title} className="pmv-process-step"><span>0{i+1}</span><div><h3>{title}</h3><p>{body}</p></div></div>)}</div></Reveal></section>

    <section className="container-pmv pb-14 sm:pb-18"><Reveal className="flex flex-col gap-4 border-t border-white/10 pt-8 sm:flex-row sm:items-center sm:justify-between"><div><p className="eyebrow">Related capabilities</p><div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">{guide.related.map(item=><ViewTransitionLink key={item.to} to={item.to} className="text-sm font-semibold text-gold hover:underline">{item.label} →</ViewTransitionLink>)}</div></div><ViewTransitionLink to="/services" className={btnOutline}>View All Services</ViewTransitionLink></Reveal></section>

    <CaseStudyStrip serviceKey={guideServiceKey[guide.slug]} audience={audience} className="border-t border-white/10"/>
    <CtaBand title="Have a version of this project on your desk right now?" body="Start with the situation. We will help define the right scope and next move." primary={{to:requestUrl,label:'Scope This Project'}} secondary={{to:'/contact',label:'Talk With Pinnacle'}}/>
  </main><Footer/></div>
}

export default function ProjectGuidePage(){
  const {slug}=useParams()
  const guide=projectGuides.find(item=>item.slug===slug)
  if(!guide)return <Navigate to="/services" replace/>
  return <GuidePage guide={guide}/>
}
