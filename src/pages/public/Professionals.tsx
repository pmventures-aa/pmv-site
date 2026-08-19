import { ViewTransitionLink } from '../../components/public/ViewTransitionLink'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { Reveal, RevealHeading } from '../../components/public/motion'
import { CtaBand, btnOutline, btnPrimary } from '../../components/public/ui'
import { Icon, type IconName } from '../../components/kit/Icon'
import { StoryImage, ProcessJourney } from '../../components/public/story'
import { usePageMeta } from '../../lib/usePageMeta'

const VENDOR_SIGNUP='/admin/vendor-signup'
const ASSIGNMENT_JOURNEY = [
  { n: '01', label: 'Define', detail: 'We establish the work, timing, location, access needs, and expected deliverables.' },
  { n: '02', label: 'Select', detail: 'Specialty, geography, credentials, availability, and prior work determine who is contacted.' },
  { n: '03', label: 'Review', detail: 'You decide whether the assignment fits your availability and capabilities before accepting.' },
  { n: '04', label: 'Coordinate', detail: 'Relevant client communication, documents, access, and follow-up stay connected through Pinnacle.' },
  { n: '05', label: 'Perform', detail: 'Quality, completeness, communication, and reliability are considered for future assignments.' },
]
const providerGroups:{icon:IconName;title:string;body:string;to:string;cta:string}[]=[
  {icon:'briefcase',title:'Licensed and regulated professionals',body:'Attorneys, notaries, tax and accounting professionals, inspectors, and other providers whose work may require active credentials.',to:'/admin/vendor-signup?track=mobile_notary',cta:'Apply as a signing professional'},
  {icon:'building',title:'Property and field professionals',body:'Inspectors, photographers, contractors, trades, property managers, field representatives, repair vendors, and local property support.',to:'/admin/vendor-signup?track=property_field',cta:'Apply for field assignments'},
  {icon:'reports',title:'Business and financial specialists',body:'Bookkeepers, accountants, funding partners, operational consultants, administrative professionals, and project-based business support.',to:'/admin/vendor-signup?track=bookkeeping_financial',cta:'Apply for financial work'},
  {icon:'services',title:'Technology and payments specialists',body:'POS, payments, implementation, integration, training, systems, data migration, and related operational technology services.',to:'/admin/vendor-signup?track=merchant_technology',cta:'Apply for systems work'},
  {icon:'file',title:'Mobile and document providers',body:'Notaries, couriers, signing professionals, document runners, and other mobile services.',to:'/admin/vendor-signup?track=document_courier',cta:'Apply for document assignments'},
  {icon:'team',title:'Other specialized providers',body:'If your work addresses a defined business, property, operational, or professional need, we can review whether it fits the network.',to:'/admin/vendor-signup?track=other',cta:'Start a provider application'},
]
const standards=[
  ['Relevant experience','We want to understand the work you do well, where you operate, and which assignments fit your actual experience.'],
  ['Appropriate documentation','Licensing, insurance, references, work samples, identity verification, or other records may be required depending on the service.'],
  ['Choice on each assignment','You can review the scope, location, timing, and expectations before accepting an assignment.'],
  ['Limited client access','Providers receive only the client information and access needed for the assignment they are working on.'],
  ['Reliable performance','Communication, timeliness, accuracy, professionalism, and complete deliverables affect future assignment decisions.'],
  ['No guaranteed volume','Network approval does not guarantee assignments, revenue, territory exclusivity, or employment.'],
]

export default function Professionals(){
  usePageMeta('Pinnacle Professional Network','Apply to join Pinnacle Management Ventures as an independent professional or service provider.')
  return <div className="min-h-screen bg-navy-950"><Header/><main>
    <section className="container-pmv py-16 sm:py-20"><Reveal className="grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-end"><div><p className="eyebrow">Pinnacle Professional Network</p><RevealHeading className="mt-4"><h1 className="pmv-h1 max-w-4xl">Work with Pinnacle as an independent professional.</h1></RevealHeading><p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">We maintain a network of independent professionals and service providers we can contact when a client needs specialized expertise, local field work, or additional support.</p><div className="mt-8 flex flex-wrap gap-3"><a href={`${VENDOR_SIGNUP}?track=property_field`} className={btnPrimary}>Apply to Join</a><ViewTransitionLink to="/contact" className={btnOutline}>Contact Us</ViewTransitionLink></div></div><div className="border-l border-white/10 pl-6"><p className="text-sm font-semibold text-white">Independent provider relationship</p><p className="mt-2 text-sm leading-6 text-slate-400">Approved providers may be contacted for specific assignments based on client need, specialty, location, qualifications, availability, and past performance. Approval does not create an employment relationship or guarantee work.</p><StoryImage slot="field_inspection" className="mt-6" aspect="aspect-[16/10]" /></div></Reveal></section>

    <section className="border-y border-white/10 bg-navy-900/30"><div className="container-pmv py-14 sm:py-16"><Reveal className="max-w-3xl"><p className="eyebrow">How assignments work</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">We contact providers when there is a specific need.</h2><p className="mt-4 text-sm leading-6 text-slate-300">Client requests are reviewed first. When outside support is appropriate, Pinnacle identifies providers whose experience and availability fit the assignment.</p></Reveal><div className="mt-10"><ProcessJourney steps={ASSIGNMENT_JOURNEY} /></div></div></section>

    <section className="container-pmv py-14 sm:py-16"><Reveal className="max-w-3xl"><p className="eyebrow">Provider review</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Requirements depend on the work you want to perform.</h2><p className="mt-4 text-sm leading-6 text-slate-300">The application asks for information and documents that are relevant to your selected services. Additional verification may be required before certain assignments.</p></Reveal><div className="mt-8 grid gap-x-10 md:grid-cols-2">{standards.map(([title,body])=><Reveal key={title} className="border-t border-white/10 py-5"><h3 className="font-semibold text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{body}</p></Reveal>)}</div></section>

    <section className="border-y border-white/10 bg-navy-900/30"><div className="container-pmv py-14 sm:py-16"><Reveal className="max-w-3xl"><p className="eyebrow">Provider categories</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">A network built around different types of client work.</h2><p className="mt-4 text-sm leading-6 text-slate-400">Each category opens a different application track. Questions, documents, and later HQ assignments follow that track.</p></Reveal><div className="mt-8 grid gap-x-10 md:grid-cols-2 xl:grid-cols-3">{providerGroups.map(group=><Reveal key={group.title} className="border-t border-white/10 py-5"><a href={group.to} className="group flex items-start gap-3"><span className="mt-0.5 text-gold"><Icon name={group.icon} size={18}/></span><div><h3 className="font-semibold text-white group-hover:text-gold">{group.title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{group.body}</p><span className="mt-2 inline-flex text-xs font-bold text-gold">{group.cta} →</span></div></a></Reveal>)}</div></div></section>

    <section className="container-pmv py-14 sm:py-16"><Reveal className="grid gap-9 lg:grid-cols-[.8fr_1.2fr]"><div><p className="eyebrow">Application process</p><h2 className="mt-3 font-display text-3xl font-medium text-white">Complete one provider profile.</h2><p className="mt-4 text-sm leading-6 text-slate-400">The application works on mobile or desktop and only asks for additional information when it applies to the services you select.</p></div><div className="divide-y divide-white/10 border-y border-white/10">{[
      ['Apply','Provide your contact information, business details, services, and service area.'],
      ['Verify','Upload the identity and service-specific documents required for your application.'],
      ['Review','Pinnacle reviews the application, documents, and qualifications.'],
      ['Approve','Approved providers receive the access appropriate to their provider role.'],
      ['Assignments','When a client need fits your profile, Pinnacle can contact you with the details.'],
    ].map(([title,body])=><div key={title} className="py-4"><h3 className="text-sm font-semibold text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{body}</p></div>)}</div></Reveal></section>

    <section className="container-pmv pb-14 sm:pb-16"><Reveal className="border-l-2 border-gold bg-white/[.02] px-6 py-5"><p className="eyebrow">Already invited?</p><h2 className="mt-2 text-xl font-semibold text-white">Use the private application link in your email.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">An invitation connects your application to information Pinnacle may have already discussed with you. If the link expires before you finish, Pinnacle can issue a new one.</p><ViewTransitionLink to="/provider-agreement" className="mt-3 inline-flex text-sm font-semibold text-gold hover:text-gold-300">Review the Provider Network Agreement →</ViewTransitionLink></Reveal></section>

    <CtaBand title="Interested in working with Pinnacle?" body="Choose the track closest to the work you can accept. Questions, documents, and later assignments follow that track." primary={{to:`${VENDOR_SIGNUP}?track=property_field`,label:'Start Provider Application'}} secondary={{to:'/contact',label:'Contact Pinnacle'}}/>
  </main><Footer/></div>
}
