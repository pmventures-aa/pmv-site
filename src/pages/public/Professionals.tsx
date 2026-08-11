import { Link } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { Reveal } from '../../components/public/motion'
import { CtaBand, btnOutline, btnPrimary } from '../../components/public/ui'
import { Icon, type IconName } from '../../components/kit/Icon'
import { usePageMeta } from '../../lib/usePageMeta'

const VENDOR_SIGNUP='/admin/vendor-signup'
const providerGroups:{icon:IconName;title:string;body:string}[]=[
  {icon:'briefcase',title:'Licensed and regulated professionals',body:'Attorneys, notaries, tax and accounting professionals, inspectors, and other providers whose work may require active credentials.'},
  {icon:'building',title:'Property and field professionals',body:'Inspectors, photographers, contractors, trades, property managers, field representatives, repair vendors, and local property support.'},
  {icon:'reports',title:'Business and financial specialists',body:'Bookkeepers, accountants, funding partners, operational consultants, administrative professionals, and project-based business support.'},
  {icon:'services',title:'Technology and payments specialists',body:'POS, payments, implementation, integration, training, systems, data migration, and related operational technology services.'},
  {icon:'file',title:'Mobile and document providers',body:'Notaries, couriers, signing professionals, document runners, and other mobile services.'},
  {icon:'team',title:'Other specialized providers',body:'If your work addresses a defined business, property, operational, or professional need, we can review whether it fits the network.'},
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
    <section className="container-pmv py-16 sm:py-20"><Reveal className="grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-end"><div><p className="eyebrow">Pinnacle Professional Network</p><h1 className="mt-4 max-w-4xl font-display text-4xl font-medium leading-[1.08] text-white sm:text-6xl">Work with Pinnacle as an independent professional.</h1><p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">We maintain a network of independent professionals and service providers we can contact when a client needs specialized expertise, local field work, or additional support.</p><div className="mt-8 flex flex-wrap gap-3"><a href={VENDOR_SIGNUP} className={btnPrimary}>Apply to Join</a><Link to="/contact" className={btnOutline}>Contact Us</Link></div></div><div className="border-l border-white/10 pl-6"><p className="text-sm font-semibold text-white">Independent provider relationship</p><p className="mt-2 text-sm leading-6 text-slate-400">Approved providers may be contacted for specific assignments based on client need, specialty, location, qualifications, availability, and past performance. Approval does not create an employment relationship or guarantee work.</p></div></Reveal></section>

    <section className="border-y border-white/10 bg-navy-900/30"><div className="container-pmv py-14 sm:py-16"><Reveal className="max-w-3xl"><p className="eyebrow">How assignments work</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">We contact providers when there is a specific need.</h2><p className="mt-4 text-sm leading-6 text-slate-300">Client requests are reviewed first. When outside support is appropriate, Pinnacle identifies providers whose experience and availability fit the assignment.</p></Reveal><div className="mt-8 divide-y divide-white/10 border-y border-white/10">{[
      ['01','We define the assignment','We establish the work, timing, location, access needs, and expected deliverables.'],
      ['02','We select appropriate providers','Specialty, geography, credentials, availability, and prior work help determine who is contacted.'],
      ['03','You review the details','You decide whether the assignment fits your availability and capabilities before accepting it.'],
      ['04','The work stays coordinated','Relevant client communication, documents, access, tasks, and follow-up remain connected through Pinnacle.'],
      ['05','We review performance','Quality, completeness, communication, and reliability are considered for future assignments.'],
    ].map(([n,t,b])=><Reveal key={n} className="grid gap-3 py-5 sm:grid-cols-[48px_1fr]"><span className="text-xs font-semibold text-gold">{n}</span><div><h3 className="font-semibold text-white">{t}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{b}</p></div></Reveal>)}</div></div></section>

    <section className="container-pmv py-14 sm:py-16"><Reveal className="max-w-3xl"><p className="eyebrow">Provider review</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Requirements depend on the work you want to perform.</h2><p className="mt-4 text-sm leading-6 text-slate-300">The application asks for information and documents that are relevant to your selected services. Additional verification may be required before certain assignments.</p></Reveal><div className="mt-8 grid gap-x-10 md:grid-cols-2">{standards.map(([title,body])=><Reveal key={title} className="border-t border-white/10 py-5"><h3 className="font-semibold text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{body}</p></Reveal>)}</div></section>

    <section className="border-y border-white/10 bg-navy-900/30"><div className="container-pmv py-14 sm:py-16"><Reveal className="max-w-3xl"><p className="eyebrow">Provider categories</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">A network built around different types of client work.</h2></Reveal><div className="mt-8 grid gap-x-10 md:grid-cols-2 xl:grid-cols-3">{providerGroups.map(group=><Reveal key={group.title} className="border-t border-white/10 py-5"><div className="flex items-start gap-3"><span className="mt-0.5 text-gold"><Icon name={group.icon} size={18}/></span><div><h3 className="font-semibold text-white">{group.title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{group.body}</p></div></div></Reveal>)}</div></div></section>

    <section className="container-pmv py-14 sm:py-16"><Reveal className="grid gap-9 lg:grid-cols-[.8fr_1.2fr]"><div><p className="eyebrow">Application process</p><h2 className="mt-3 font-display text-3xl font-medium text-white">Complete one provider profile.</h2><p className="mt-4 text-sm leading-6 text-slate-400">The application works on mobile or desktop and only asks for additional information when it applies to the services you select.</p></div><div className="divide-y divide-white/10 border-y border-white/10">{[
      ['Apply','Provide your contact information, business details, services, and service area.'],
      ['Verify','Upload the identity and service-specific documents required for your application.'],
      ['Review','Pinnacle reviews the application, documents, and qualifications.'],
      ['Approve','Approved providers receive the access appropriate to their provider role.'],
      ['Assignments','When a client need fits your profile, Pinnacle can contact you with the details.'],
    ].map(([title,body])=><div key={title} className="py-4"><h3 className="text-sm font-semibold text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{body}</p></div>)}</div></Reveal></section>

    <section className="container-pmv pb-14 sm:pb-16"><Reveal className="border-l-2 border-gold bg-white/[.02] px-6 py-5"><p className="eyebrow">Already invited?</p><h2 className="mt-2 text-xl font-semibold text-white">Use the private application link in your email.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">An invitation connects your application to information Pinnacle may have already discussed with you. If the link expires before you finish, Pinnacle can issue a new one.</p></Reveal></section>

    <CtaBand title="Interested in working with Pinnacle?" body="Tell us what services you provide, where you work, and the types of assignments that fit your experience." primary={{to:VENDOR_SIGNUP,label:'Start Provider Application'}} secondary={{to:'/contact',label:'Contact Pinnacle'}}/>
  </main><Footer/></div>
}
