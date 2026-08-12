import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { Reveal } from '../../components/public/motion'
import { CARE_PLANS, CARE_PLAN_FAMILIES, formatPrice, type PlanFamilyKey, type PlanService, type PlanTier } from '../../../shared/carePlans'
import { usePageMeta } from '../../lib/usePageMeta'
import { api, ApiError } from '../../lib/api'

type IntakeState = Record<string, string | boolean | string[]>

const PROPERTY_TYPES = ['Single-family rental','Condo','Townhome','Multi-unit (2-4)','Small multi-family (5-20)','Vacation / seasonal','Commercial','Vacant / REO','Not sure yet']
const OCCUPANCY = ['Currently occupied by tenant','Vacant / on market','Vacant / off market','Transitioning (move-in or move-out soon)','Owner-occupied part of the year']
const USE_PURPOSE = ['Long-term rental','Short-term rental','Personal / second home','Investor hold','REO / bank-owned','For sale']
const INDUSTRIES = ['Real estate','Legal / professional services','Retail','Restaurant / hospitality','Health / wellness','Non-profit','Home services / contractor','Property services','Other']
const TEAM_SIZES = ['Solo / owner-only','2-5 people','6-15 people','16-50 people','50+ people']
const LEGAL_ROLES = ['Solo attorney','Small firm partner','Paralegal','Real estate closing / title','Lender','Firm operations manager','Other']
const LEGAL_VOLUMES = ['Under 5 per month','5-15 per month','15-50 per month','50+ per month']

export default function CarePlans(){
  usePageMeta('Pinnacle Care Plans - Property, Ops, and Legal & Notary Retainers','Monthly care plans from Pinnacle Management Ventures: Property Care with cleaning, inspections, BPO and CAM coordination; Ops-on-Call retainers; and a Legal & Notary Pass for firms.')
  const [params]=useSearchParams()
  const initialFamily=(params.get('family') as PlanFamilyKey|null)
  const [family,setFamily]=useState<PlanFamilyKey>(initialFamily && CARE_PLAN_FAMILIES.includes(initialFamily) ? initialFamily : 'property')
  const [selectedTier,setSelectedTier]=useState<string|null>(params.get('tier')||null)
  const familyDef=CARE_PLANS[family]

  return <div className="min-h-screen bg-navy-950"><Header/><main>
    <section className="pmv-hero-story relative overflow-hidden border-b border-white/[.08]"><div className="pmv-hero-gold" aria-hidden="true"/><div className="container-pmv relative z-10 py-16 sm:py-20 lg:py-24"><Reveal className="max-w-4xl"><p className="eyebrow">Care Plans - MRR-based professional retainers</p><h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.04] tracking-[-.03em] text-white sm:text-6xl">Retain us monthly. Handle the work the moment it comes up.</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">Three families of monthly plans: <strong className="text-white">Property Care</strong> for owners and investors, <strong className="text-white">Ops-on-Call</strong> for business owners without an admin, and a <strong className="text-white">Legal & Notary Pass</strong> for solo attorneys and firms. Every plan includes a saved profile, priority scheduling, and a real discount on everything past the included volume.</p><p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">Prices reflect coordination + service delivery, not licensed property management or legal representation. Licensed work is coordinated through our credentialed partners (broker, CAM, attorneys) when it applies.</p></Reveal></div></section>

    <section className="border-b border-white/10 bg-navy-900/40 sticky top-[68px] z-20 backdrop-blur"><div className="container-pmv flex flex-wrap gap-2 py-3">{CARE_PLAN_FAMILIES.map(key=>{const cfg=CARE_PLANS[key];const active=family===key;return <button key={key} type="button" onClick={()=>{setFamily(key);setSelectedTier(null)}} className={`rounded-full border px-4 py-2 text-xs font-bold transition ${active?'border-gold/60 bg-gold/15 text-gold':'border-white/10 bg-white/[.02] text-slate-300 hover:border-white/25 hover:text-white'}`}>{cfg.eyebrow}</button>})}</div></section>

    <section className="container-pmv py-14 sm:py-18"><Reveal className="max-w-3xl"><p className="eyebrow">{familyDef.eyebrow}</p><h2 className="mt-3 font-display text-3xl font-bold tracking-[-.03em] text-white sm:text-5xl">{familyDef.headline}</h2><p className="mt-5 text-base leading-7 text-slate-300">{familyDef.intro}</p><p className="mt-3 text-xs leading-6 text-slate-500">{familyDef.benchmark}</p></Reveal>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {familyDef.tiers.map(tier=><TierCard key={tier.key} tier={tier} selected={selectedTier===tier.key} onSelect={()=>setSelectedTier(tier.key)}/>)}
      </div>
    </section>

    <ServiceMenu key={family} family={family}/>

    <section id="intake" className="border-y border-gold/15 bg-gradient-to-br from-gold/[.05] via-transparent to-transparent"><div className="container-pmv py-14 sm:py-18"><Reveal className="grid gap-6 lg:grid-cols-[.6fr_1.4fr]"><div><p className="eyebrow">Start intake</p><h2 className="mt-3 font-display text-3xl font-bold tracking-[-.03em] text-white sm:text-4xl">Pick your services, add the details we need, and we take it from there.</h2><p className="mt-4 max-w-md text-sm leading-6 text-slate-400">No account, no card. Every selection you make is saved on the request so we open the conversation with actual context instead of a generic email.</p><p className="mt-4 flex items-center gap-2 text-sm font-semibold text-white"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,.55)]"/>A real person replies within two business hours.</p></div><CarePlanIntake family={family} initialTier={selectedTier}/></Reveal></div></section>
  </main><Footer/></div>
}

function TierCard({tier,selected,onSelect}:{tier:PlanTier;selected:boolean;onSelect:()=>void}){
  const isCustom=tier.priceCents<=0
  return <article className={`flex flex-col rounded-2xl border p-6 transition ${selected?'border-gold/55 bg-gold/[.06]':tier.featured?'border-gold/30 bg-white/[.03]':'border-white/10 bg-white/[.02]'}`}>
    {tier.featured&&<span className="mb-2 self-start rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.14em] text-gold">Most chosen</span>}
    <h3 className="font-display text-2xl font-bold text-white">{tier.name}</h3>
    <p className="mt-1 text-sm text-slate-400">{tier.tagline}</p>
    <p className="mt-4 font-display text-3xl font-extrabold tracking-[-.02em] text-white">{formatPrice(tier.priceCents)}</p>
    {!isCustom&&<p className="text-[11px] uppercase tracking-[.14em] text-slate-500">Month-to-month · cancel anytime</p>}
    <ul className="mt-5 space-y-2.5 text-sm text-slate-300">{tier.includes.map(item=><li key={item} className="flex gap-2"><span className="mt-1 text-gold">✓</span><span className="leading-6">{item}</span></li>)}</ul>
    <div className="mt-6 rounded-lg border border-white/10 bg-navy-950/40 p-3 text-[11px] leading-5 text-slate-400"><strong className="text-slate-300">Best for:</strong> {tier.bestFor}</div>
    <button type="button" onClick={()=>{onSelect();document.getElementById('intake')?.scrollIntoView({behavior:'smooth',block:'start'})}} className={`mt-6 rounded-lg px-4 py-2.5 text-sm font-bold transition ${selected?'bg-gold text-navy-950 hover:bg-gold-300':tier.featured?'bg-gold text-navy-950 hover:bg-gold-300':'border border-white/15 text-white hover:border-gold/40 hover:text-gold'}`}>{selected?'Selected - continue below':`Choose ${tier.name}`}</button>
  </article>
}

function ServiceMenu({family}:{family:PlanFamilyKey}){
  const services=CARE_PLANS[family].services
  const grouped=services.reduce<Record<string,PlanService[]>>((acc,s)=>{const cat=s.category||'Included';(acc[cat]=acc[cat]||[]).push(s);return acc},{})
  return <section className="border-y border-white/10 bg-navy-900/30"><div className="container-pmv py-14 sm:py-18"><Reveal className="max-w-3xl"><p className="eyebrow">What you can request under this plan</p><h2 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">Full service menu.</h2><p className="mt-4 text-sm leading-7 text-slate-400">Plan credits and priority scheduling apply across every service in this menu. Prices shown are typical retail ranges; plan members get the member discount on top.</p></Reveal>
    <div className="mt-8 grid gap-8 lg:grid-cols-2">{Object.entries(grouped).map(([category,items])=><div key={category}><p className="text-[10px] font-bold uppercase tracking-[.18em] text-gold">{category}</p><ul className="mt-3 divide-y divide-white/10 border-y border-white/10">{items.map(s=><li key={s.key} className="grid gap-1 py-4 sm:grid-cols-[1.4fr_auto] sm:items-center"><div><p className="font-semibold text-white">{s.label}</p><p className="mt-1 text-xs leading-5 text-slate-400">{s.detail}</p></div>{s.priceHint&&<span className="text-xs font-semibold text-gold sm:text-right">{s.priceHint}</span>}</li>)}</ul></div>)}</div>
  </div></section>
}

function CarePlanIntake({family,initialTier}:{family:PlanFamilyKey;initialTier:string|null}){
  const familyDef=CARE_PLANS[family]
  const navigate=useNavigate()
  const [tier,setTier]=useState<string|null>(initialTier)
  const [selectedServices,setSelectedServices]=useState<Set<string>>(new Set())
  const [intake,setIntake]=useState<IntakeState>({})
  const [contact,setContact]=useState({contact_name:'',email:'',phone:'',business_name:'',additional_notes:'',website:''})
  const [busy,setBusy]=useState(false);const [error,setError]=useState('')

  const groupedServices=useMemo(()=>{
    const groups:Record<string,PlanService[]>={}
    for(const s of familyDef.services){const cat=s.category||'Included';(groups[cat]=groups[cat]||[]).push(s)}
    return groups
  },[familyDef])

  function toggleService(key:string){setSelectedServices(prev=>{const next=new Set(prev);next.has(key)?next.delete(key):next.add(key);return next})}
  function updateIntake<K extends string>(key:K,value:IntakeState[K]){setIntake(prev=>({...prev,[key]:value}))}

  async function submit(){
    if(!tier)return setError('Choose a plan tier above.')
    if(!contact.contact_name.trim())return setError('Enter your name.')
    if(!contact.email.includes('@'))return setError('Enter a valid email.')
    setBusy(true);setError('')
    try{
      const response=await api.post<{confirmation_url:string}>('/care-plan-leads',{
        plan_family:family,plan_tier:tier,
        contact_name:contact.contact_name,email:contact.email,phone:contact.phone,business_name:contact.business_name,
        additional_notes:contact.additional_notes,website:contact.website,
        services:Array.from(selectedServices),intake,
        source:`care-plans-${family}`,
      })
      navigate(response.confirmation_url)
    }catch(err){setError(err instanceof ApiError?err.message:'We could not submit the request. Call (561) 388-7879 if the need is urgent.')}
    finally{setBusy(false)}
  }

  return <div className="overflow-hidden rounded-2xl border border-white/10 bg-navy-900/70 shadow-[0_28px_80px_rgba(0,0,0,.26)]">
    <div className="border-b border-white/10 px-5 py-4 sm:px-6"><p className="eyebrow">{familyDef.eyebrow} intake</p><p className="mt-1 text-xs text-slate-500">No account · every selection saved on the request</p></div>
    <div className="space-y-6 p-5 sm:p-6">
      <div><p className="text-sm font-bold text-white">Plan tier</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{familyDef.tiers.map(t=><button key={t.key} type="button" onClick={()=>setTier(t.key)} className={`rounded-xl border px-3 py-2.5 text-left transition ${tier===t.key?'border-gold/55 bg-gold/[.08]':'border-white/10 bg-white/[.02] hover:border-white/25'}`}><span className="block text-sm font-bold text-white">{t.name}</span><span className="mt-0.5 block text-[11px] text-slate-400">{formatPrice(t.priceCents)}</span></button>)}</div></div>

      <div><p className="text-sm font-bold text-white">Services you expect to use</p><p className="mt-1 text-xs text-slate-500">Optional but recommended - it lets us pre-scope pricing and staffing.</p><div className="mt-3 space-y-4">{Object.entries(groupedServices).map(([category,items])=><div key={category}><p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold/80">{category}</p><div className="mt-2 grid gap-1.5 sm:grid-cols-2">{items.map(s=><label key={s.key} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-left transition ${selectedServices.has(s.key)?'border-gold/45 bg-gold/[.05]':'border-white/10 bg-white/[.015] hover:border-white/25'}`}><input type="checkbox" checked={selectedServices.has(s.key)} onChange={()=>toggleService(s.key)} className="mt-0.5 accent-gold"/><span className="min-w-0"><span className="block text-xs font-semibold text-white">{s.label}</span>{s.priceHint&&<span className="mt-0.5 block text-[10px] text-slate-500">{s.priceHint}</span>}</span></label>)}</div></div>)}</div></div>

      {familyDef.intakeKind==='property'&&<PropertyIntake intake={intake} update={updateIntake}/>}
      {familyDef.intakeKind==='business'&&<BusinessIntake intake={intake} update={updateIntake}/>}
      {familyDef.intakeKind==='legal'&&<LegalIntake intake={intake} update={updateIntake}/>}

      <div className="border-t border-white/10 pt-5"><p className="text-sm font-bold text-white">Where should we reply?</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><input className="input" autoComplete="name" placeholder="Your name" value={contact.contact_name} onChange={e=>setContact(c=>({...c,contact_name:e.target.value}))}/><input className="input" type="email" autoComplete="email" placeholder="Email" value={contact.email} onChange={e=>setContact(c=>({...c,email:e.target.value}))}/><input className="input" type="tel" autoComplete="tel" placeholder="Phone (optional)" value={contact.phone} onChange={e=>setContact(c=>({...c,phone:e.target.value}))}/><input className="input" placeholder="Business name (optional)" value={contact.business_name} onChange={e=>setContact(c=>({...c,business_name:e.target.value}))}/></div><textarea className="input mt-2 min-h-20" placeholder="Anything else we should know? (Optional)" value={contact.additional_notes} onChange={e=>setContact(c=>({...c,additional_notes:e.target.value}))}/><input aria-hidden="true" tabIndex={-1} autoComplete="off" className="hidden" value={contact.website} onChange={e=>setContact(c=>({...c,website:e.target.value}))}/></div>

      <AnimatePresence>{error&&<motion.p initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0}} role="alert" className="rounded-lg border border-red-400/25 bg-red-400/[.06] px-4 py-3 text-sm text-red-200">{error}</motion.p>}</AnimatePresence>

      <button type="button" onClick={()=>void submit()} disabled={busy} className="w-full rounded-lg bg-gold px-5 py-3 text-sm font-bold text-navy-950 transition hover:bg-gold-300 disabled:opacity-60">{busy?'Sending intake…':`Send ${familyDef.eyebrow} intake`}</button>
      <p className="text-[11px] leading-5 text-slate-500">By submitting you agree to be contacted about this request. Cancel any plan at any time - month-to-month, no long-term commitment.</p>
    </div>
  </div>
}

function InputField({label,children}:{label:string;children:React.ReactNode}){return <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-300">{label}{children}</label>}

function PropertyIntake({intake,update}:{intake:IntakeState;update:(k:string,v:IntakeState[string])=>void}){
  return <div className="border-t border-white/10 pt-5"><p className="text-sm font-bold text-white">About the property</p><div className="mt-3 grid gap-3 sm:grid-cols-2">
    <InputField label="Property address (or city + state)"><input className="input" value={(intake.address||'') as string} onChange={e=>update('address',e.target.value)} placeholder="123 Main St, City, ST"/></InputField>
    <InputField label="Property type"><select className="input" value={(intake.property_type||'') as string} onChange={e=>update('property_type',e.target.value)}><option value="">Choose…</option>{PROPERTY_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></InputField>
    <InputField label="Approximate square footage"><input className="input" inputMode="numeric" placeholder="e.g. 1,450" value={(intake.square_feet||'') as string} onChange={e=>update('square_feet',e.target.value)}/></InputField>
    <InputField label="Bedrooms / bathrooms (optional)"><input className="input" placeholder="e.g. 3 / 2" value={(intake.beds_baths||'') as string} onChange={e=>update('beds_baths',e.target.value)}/></InputField>
    <InputField label="Current occupancy"><select className="input" value={(intake.occupancy||'') as string} onChange={e=>update('occupancy',e.target.value)}><option value="">Choose…</option>{OCCUPANCY.map(t=><option key={t} value={t}>{t}</option>)}</select></InputField>
    <InputField label="Primary use"><select className="input" value={(intake.use_purpose||'') as string} onChange={e=>update('use_purpose',e.target.value)}><option value="">Choose…</option>{USE_PURPOSE.map(t=><option key={t} value={t}>{t}</option>)}</select></InputField>
    <InputField label="Number of properties on plan"><input className="input" inputMode="numeric" placeholder="1" value={(intake.property_count||'') as string} onChange={e=>update('property_count',e.target.value)}/></InputField>
    <InputField label="Access instructions"><input className="input" placeholder="Lockbox, key hidden, tenant present, etc." value={(intake.access_notes||'') as string} onChange={e=>update('access_notes',e.target.value)}/></InputField>
  </div><label className="mt-3 flex items-start gap-2 text-xs text-slate-400"><input type="checkbox" className="mt-0.5 accent-gold" checked={!!intake.wants_bpo} onChange={e=>update('wants_bpo',e.target.checked)}/><span>I would like BPO coordination through your broker partner as part of this plan.</span></label><label className="mt-2 flex items-start gap-2 text-xs text-slate-400"><input type="checkbox" className="mt-0.5 accent-gold" checked={!!intake.wants_cam} onChange={e=>update('wants_cam',e.target.checked)}/><span>The property is in an association and I want CAM liaison support.</span></label></div>
}

function BusinessIntake({intake,update}:{intake:IntakeState;update:(k:string,v:IntakeState[string])=>void}){
  return <div className="border-t border-white/10 pt-5"><p className="text-sm font-bold text-white">About the business</p><div className="mt-3 grid gap-3 sm:grid-cols-2">
    <InputField label="Industry / vertical"><select className="input" value={(intake.industry||'') as string} onChange={e=>update('industry',e.target.value)}><option value="">Choose…</option>{INDUSTRIES.map(t=><option key={t} value={t}>{t}</option>)}</select></InputField>
    <InputField label="Team size"><select className="input" value={(intake.team_size||'') as string} onChange={e=>update('team_size',e.target.value)}><option value="">Choose…</option>{TEAM_SIZES.map(t=><option key={t} value={t}>{t}</option>)}</select></InputField>
    <InputField label="City / state"><input className="input" placeholder="Fort Lauderdale, FL" value={(intake.city_state||'') as string} onChange={e=>update('city_state',e.target.value)}/></InputField>
    <InputField label="Primary systems in use (optional)"><input className="input" placeholder="QuickBooks, Toast, HubSpot, etc." value={(intake.systems||'') as string} onChange={e=>update('systems',e.target.value)}/></InputField>
  </div><InputField label="Top 1-2 things you want off your plate"><textarea className="input mt-2 min-h-20" placeholder="e.g. Client follow-up is slipping; vendor payments need someone owning them." value={(intake.pain_points||'') as string} onChange={e=>update('pain_points',e.target.value)}/></InputField></div>
}

function LegalIntake({intake,update}:{intake:IntakeState;update:(k:string,v:IntakeState[string])=>void}){
  return <div className="border-t border-white/10 pt-5"><p className="text-sm font-bold text-white">About your firm or practice</p><div className="mt-3 grid gap-3 sm:grid-cols-2">
    <InputField label="Role"><select className="input" value={(intake.role||'') as string} onChange={e=>update('role',e.target.value)}><option value="">Choose…</option>{LEGAL_ROLES.map(t=><option key={t} value={t}>{t}</option>)}</select></InputField>
    <InputField label="Firm name (optional)"><input className="input" value={(intake.firm_name||'') as string} onChange={e=>update('firm_name',e.target.value)} placeholder="Optional"/></InputField>
    <InputField label="Typical monthly volume"><select className="input" value={(intake.monthly_volume||'') as string} onChange={e=>update('monthly_volume',e.target.value)}><option value="">Choose…</option>{LEGAL_VOLUMES.map(t=><option key={t} value={t}>{t}</option>)}</select></InputField>
    <InputField label="Primary county / jurisdiction"><input className="input" placeholder="Broward County, etc." value={(intake.jurisdiction||'') as string} onChange={e=>update('jurisdiction',e.target.value)}/></InputField>
  </div><label className="mt-3 flex items-start gap-2 text-xs text-slate-400"><input type="checkbox" className="mt-0.5 accent-gold" checked={!!intake.needs_ron} onChange={e=>update('needs_ron',e.target.checked)}/><span>I need Remote Online Notary (RON) coverage.</span></label><label className="mt-2 flex items-start gap-2 text-xs text-slate-400"><input type="checkbox" className="mt-0.5 accent-gold" checked={!!intake.after_hours} onChange={e=>update('after_hours',e.target.checked)}/><span>My work sometimes requires after-hours coverage.</span></label></div>
}

export function CarePlansConfirmation(){
  const [params]=useSearchParams()
  const token=params.get('token')||''
  usePageMeta('Care Plan intake received - Pinnacle','Your care plan intake has been received. A Pinnacle team member replies within two business hours.')
  return <div className="min-h-screen bg-navy-950"><Header/><main className="container-pmv py-16 sm:py-24"><Reveal className="max-w-2xl"><p className="eyebrow">Intake received</p><h1 className="mt-3 font-display text-4xl font-bold text-white sm:text-5xl">Got it. A person is on this.</h1><p className="mt-5 text-base leading-7 text-slate-300">Your care plan intake was received and every service you selected is on the request. A Pinnacle team member reviews it and replies within two business hours with next-step pricing and scheduling.</p><p className="mt-4 text-sm text-slate-500">Reference token: <code className="text-gold">{token||'(pending)'}</code></p><div className="mt-8 flex flex-wrap gap-3"><Link to="/care-plans" className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-bold text-white hover:border-gold/40 hover:text-gold">Back to Care Plans</Link><Link to="/services" className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-bold text-white hover:border-gold/40 hover:text-gold">Explore other services</Link></div></Reveal></main><Footer/></div>
}
