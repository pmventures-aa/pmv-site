import { Link } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { Reveal } from '../../components/public/motion'
import { CtaBand, btnOutline, btnPrimary } from '../../components/public/ui'
import { Icon, type IconName } from '../../components/kit/Icon'
import { usePageMeta } from '../../lib/usePageMeta'

const VENDOR_SIGNUP='https://hq.pinnaclemanagementventures.com/vendor-signup'
const providerGroups:{icon:IconName;title:string;body:string}[]=[
  {icon:'briefcase',title:'Licensed & regulated professionals',body:'Real estate brokers, attorneys, notaries, tax/accounting professionals, inspectors, and other providers whose work may require active credentials.'},
  {icon:'building',title:'Property & field professionals',body:'Inspectors, photographers, contractors, trades, property managers, field representatives, repair vendors, and local property support.'},
  {icon:'reports',title:'Business & financial specialists',body:'Bookkeepers, accountants, funding partners, operational consultants, administrative professionals, and project-based business support.'},
  {icon:'services',title:'Technology & payments specialists',body:'POS, payments, implementation, integration, training, systems, data migration, and other operational technology expertise.'},
  {icon:'file',title:'Mobile & document providers',body:'Notaries, couriers, signing professionals, document runners, and other time-sensitive mobile services.'},
  {icon:'team',title:'Specialized professionals',body:'If you solve a defined business, property, operational, or professional need, Pinnacle can review whether your work fits the network.'},
]
const standards=[
  ['Fit before volume','We want to understand the work you are genuinely good at, where you operate, and which assignments you should not receive.'],
  ['Credentials when they matter','Licensing, insurance, references, work samples, identity verification, or other documents may be required based on the service.'],
  ['Assignment-by-assignment choice','A network relationship does not force you to accept work. Review the scope, location, timing, and expectations before confirming an assignment.'],
  ['Client information stays limited','Providers receive only the client information and access needed for the specific assignment. Network membership does not create open access to client accounts.'],
  ['Quality earns confidence','Communication, timeliness, accuracy, professionalism, and clean deliverables all influence whether Pinnacle continues routing appropriate opportunities your way.'],
  ['No guaranteed volume','Pinnacle does not promise assignment frequency, revenue, territory exclusivity, or employment. Opportunities depend on actual client needs and fit.'],
]

export default function Professionals(){
  usePageMeta('Pinnacle Professional Network','Apply to join Pinnacle Management Ventures as a vetted independent professional or service provider.')
  return <div className="min-h-screen bg-navy-950"><Header/><main>
    <section className="container-pmv py-16 sm:py-20"><Reveal className="grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-end"><div><p className="eyebrow">Pinnacle Professional Network</p><h1 className="mt-4 max-w-4xl font-display text-4xl font-medium leading-[1.08] text-white sm:text-6xl">Bring your expertise. We’ll bring the right assignments when there’s a fit.</h1><p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">Pinnacle builds a vetted network of independent professionals we can call on when a client engagement needs licensed expertise, local field work, specialized knowledge, or another capable set of hands.</p><div className="mt-8 flex flex-wrap gap-3"><a href={VENDOR_SIGNUP} className={btnPrimary}>Apply to Join the Network</a><Link to="/contact" className={btnOutline}>Ask a Provider Question</Link></div></div><div className="border-l border-white/10 pl-6"><p className="text-sm font-semibold text-white">Independent network relationship</p><p className="mt-2 text-sm leading-6 text-slate-400">Approved providers may receive assignment-specific invitations based on client need, specialty, location, qualifications, availability, and prior performance. Joining does not guarantee work volume and does not create an employment relationship.</p></div></Reveal></section>

    <section className="border-y border-white/10 bg-navy-900/30"><div className="container-pmv py-14 sm:py-16"><Reveal className="max-w-3xl"><p className="eyebrow">How work reaches you</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">A network, not a job board.</h2><p className="mt-4 text-sm leading-6 text-slate-300">Pinnacle first understands the client need. We then match an appropriate professional and send a defined assignment rather than exposing every client request to everyone in the network.</p></Reveal><div className="mt-8 divide-y divide-white/10 border-y border-white/10">{[
      ['01','A client need is scoped','Pinnacle determines the work, timing, access, deliverables, and whether a network professional is appropriate.'],
      ['02','We identify a fit','Specialty, geography, credentials, availability, and prior performance help determine who should receive the opportunity.'],
      ['03','You review the assignment','You receive the relevant scope and decide whether you can responsibly accept it. Declining a poor-fit assignment is better than overcommitting.'],
      ['04','Pinnacle coordinates the relationship','Client communication, documents, access, tasks, and follow-up stay connected through Pinnacle instead of becoming disconnected side conversations.'],
      ['05','The work is reviewed','Quality, completeness, professionalism, and reliability become part of the provider relationship and future matching decisions.'],
    ].map(([n,t,b])=><Reveal key={n} className="grid gap-3 py-5 sm:grid-cols-[48px_1fr]"><span className="text-xs font-semibold text-gold">{n}</span><div><h3 className="font-semibold text-white">{t}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{b}</p></div></Reveal>)}</div></div></section>

    <section className="container-pmv py-14 sm:py-16"><Reveal className="max-w-3xl"><p className="eyebrow">What we look for</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Thorough vetting protects the client and the professional.</h2><p className="mt-4 text-sm leading-6 text-slate-300">Not every service requires the same documentation. Pinnacle asks for what is relevant to the work you want to perform and can require additional verification before certain assignments.</p></Reveal><div className="mt-8 grid gap-x-10 md:grid-cols-2">{standards.map(([title,body])=><Reveal key={title} className="border-t border-white/10 py-5"><h3 className="font-semibold text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{body}</p></Reveal>)}</div></section>

    <section className="border-y border-white/10 bg-navy-900/30"><div className="container-pmv py-14 sm:py-16"><Reveal className="max-w-3xl"><p className="eyebrow">Professionals in the network</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Different expertise around one coordinated client relationship.</h2></Reveal><div className="mt-8 grid gap-x-10 md:grid-cols-2 xl:grid-cols-3">{providerGroups.map(group=><Reveal key={group.title} className="border-t border-white/10 py-5"><div className="flex items-start gap-3"><span className="mt-0.5 text-gold"><Icon name={group.icon} size={18}/></span><div><h3 className="font-semibold text-white">{group.title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{group.body}</p></div></div></Reveal>)}</div></div></section>

    <section className="container-pmv py-14 sm:py-16"><Reveal className="grid gap-9 lg:grid-cols-[.8fr_1.2fr]"><div><p className="eyebrow">Provider onboarding</p><h2 className="mt-3 font-display text-3xl font-medium text-white">Apply once. Keep your professional profile ready.</h2><p className="mt-4 text-sm leading-6 text-slate-400">The application is progressive and mobile-friendly. You can upload identity, licensing, insurance, or supporting documents directly from a phone when your specialty requires them.</p></div><div className="divide-y divide-white/10 border-y border-white/10">{[
      ['Apply','Tell us who you are, what you provide, where you work, and how Pinnacle should contact you.'],
      ['Verify','Upload the service-specific documents relevant to the work you want to perform.'],
      ['Review','Pinnacle reviews the fit, qualifications, completeness, and any additional verification required.'],
      ['Approve','Approved providers receive an account and access appropriate to their network role.'],
      ['Match','When a client need fits, Pinnacle can invite you to the specific assignment and keep the work coordinated.'],
    ].map(([title,body])=><div key={title} className="py-4"><h3 className="text-sm font-semibold text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{body}</p></div>)}</div></Reveal></section>

    <section className="container-pmv pb-14 sm:pb-16"><Reveal className="border-l-2 border-gold bg-white/[.02] px-6 py-5"><p className="eyebrow">Already invited?</p><h2 className="mt-2 text-xl font-semibold text-white">Use the private link Pinnacle sent you.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">A direct invitation connects your application to the relationship or specialty Pinnacle already discussed with you. The private link expires after 24 hours; a fresh link can be issued if it expires before you complete onboarding.</p></Reveal></section>

    <CtaBand title="Could your expertise help a Pinnacle client?" body="Tell us what you do, where you work, and what kinds of assignments are genuinely a good fit. We’ll review the relationship before client work or access is assigned." primary={{to:VENDOR_SIGNUP,label:'Start Provider Application'}} secondary={{to:'/contact',label:'Contact Pinnacle'}}/>
  </main><Footer/></div>
}
