import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { api, ApiError } from '../../lib/api'
import { Icon, type IconName } from '../kit/Icon'

type ScopeResponse = { confirmation_url:string }
type Form = { job_type:string;location_type:'onsite'|'remote';city:string;state:string;postal_code:string;timing:string;details:string;contact_name:string;email:string;phone:string;follow_up_opt_in:boolean;website:string }

const jobs:{value:string;label:string;body:string;icon:IconName}[]=[
  {value:'cleaning_turnover',label:'Clean or make a property rent-ready',body:'Deep clean, move-out, REO, vacant-property, or turnover work.',icon:'building'},
  {value:'property_inspection',label:'Get eyes on a property',body:'Inspection, photos, occupancy check, access, or condition report.',icon:'building'},
  {value:'documents_notary',label:'Prepare, sign, or move a document',body:'Preparation, mobile notary, RON, filing, courier, or courthouse run.',icon:'file'},
  {value:'eviction_reo',label:'Handle an eviction or REO property',body:'Administrative coordination, possession handoff, and turnover.',icon:'shield'},
  {value:'business_operations',label:'Add capacity to the business',body:'Operations, admin, follow-up, vendors, or ongoing office help.',icon:'briefcase'},
  {value:'pos_payments',label:'Fix or switch a system or POS',body:'Payments, software, data prep, vendor change, or implementation.',icon:'activity'},
  {value:'other',label:'Something else',body:'Describe the outcome. We will help scope it.',icon:'support'},
]
const remoteJobs=new Set(['business_operations','pos_payments','documents_notary','other'])
const serviceJobs:Record<string,string>={
  consulting:'business_operations',
  merchant_services:'pos_payments',
  admin_support:'documents_notary',
  document_courier:'documents_notary',
  mobile_notary:'documents_notary',
  remote_online_notary:'documents_notary',
  property_management:'cleaning_turnover',
  property_inspections:'property_inspection',
}
const timings=['As soon as possible','Within 2–3 business days','This week','I have a specific date','Flexible / planning ahead']

export function ScopeWizard({source='scope-page',compact=false}:{source?:string;compact?:boolean}){
  const navigate=useNavigate();const [params]=useSearchParams()
  const serviceKey=params.get('service')||''
  const offeringId=params.get('offering')||''
  const preselected=params.get('job')||serviceJobs[serviceKey]||''
  const requestSource=params.get('source')||source
  const [step,setStep]=useState(0);const [busy,setBusy]=useState(false);const [error,setError]=useState('')
  const [form,setForm]=useState<Form>({job_type:jobs.some(j=>j.value===preselected)?preselected:'',location_type:remoteJobs.has(preselected)?'remote':'onsite',city:'',state:'',postal_code:'',timing:'',details:'',contact_name:'',email:'',phone:'',follow_up_opt_in:false,website:''})
  const update=<K extends keyof Form>(key:K,value:Form[K])=>setForm(current=>({...current,[key]:value}))
  const chooseJob=(value:string)=>{setForm(current=>({...current,job_type:value,location_type:remoteJobs.has(value)?'remote':'onsite'}));setError('')}
  function next(){
    if(step===0&&!form.job_type)return setError('Choose the kind of work you need.')
    if(step===1&&form.location_type==='onsite'&&(!form.city.trim()||!form.state.trim()))return setError('Enter the city and state for the on-site work.')
    if(step===2&&!form.timing)return setError('Choose the timing that is closest to what you need.')
    setError('');setStep(value=>Math.min(3,value+1))
  }
  async function submit(){
    if(!form.contact_name.trim())return setError('Enter your name.')
    if(!form.email.includes('@'))return setError('Enter a valid email address.')
    setBusy(true);setError('')
    try{
      const response=await api.post<ScopeResponse>('/scope-requests',{...form,source:requestSource,service_key:serviceKey||undefined,offering_id:offeringId||undefined,audience:params.get('audience')||undefined,guide_slug:params.get('guide')||undefined})
      navigate(response.confirmation_url)
    }catch(err){setError(err instanceof ApiError?err.message:'We could not submit the request. Call (561) 388-7879 if the need is urgent.')}
    finally{setBusy(false)}
  }
  return <div className={`overflow-hidden rounded-2xl border border-white/10 bg-navy-900/75 shadow-[0_24px_80px_rgba(0,0,0,.24)] ${compact?'':'max-w-5xl'}`}>
    <div className="border-b border-white/10 px-5 py-4 sm:px-7"><div className="flex items-center justify-between gap-5"><div><p className="eyebrow">Tell us what needs to happen</p><p className="mt-1 text-xs text-slate-500">No account · about two minutes · real reply within 2 business hours</p></div><span className="text-xs font-bold text-gold">{step+1} / 4</span></div><div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full bg-gold" animate={{width:`${(step+1)*25}%`}}/></div></div>
    <div className="p-5 sm:p-7"><AnimatePresence mode="wait" initial={false}>
      <motion.div key={step} initial={{opacity:0,x:16}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-12}} transition={{duration:.18}}>
        {step===0&&<div><h3 className="text-xl font-bold text-white">What outcome are you after?</h3><p className="mt-1 text-sm text-slate-400">Pick the closest fit. You can add detail in a moment.</p><div className="mt-5 grid gap-2 sm:grid-cols-2">{jobs.map(job=><button key={job.value} type="button" onClick={()=>chooseJob(job.value)} className={`flex min-h-[88px] items-start gap-3 rounded-xl border p-4 text-left transition ${form.job_type===job.value?'border-gold/55 bg-gold/[.08]':'border-white/10 bg-white/[.02] hover:border-white/25'}`}><span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-navy-950 text-gold"><Icon name={job.icon} size={17}/></span><span><strong className="block text-sm text-white">{job.label}</strong><span className="mt-1 block text-xs leading-5 text-slate-400">{job.body}</span></span></button>)}</div></div>}
        {step===1&&<div><h3 className="text-xl font-bold text-white">Where does the work need to happen?</h3><div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" onClick={()=>update('location_type','onsite')} className={`rounded-xl border p-4 text-left ${form.location_type==='onsite'?'border-gold/50 bg-gold/[.07]':'border-white/10'}`}><strong className="text-sm text-white">At a location</strong><span className="mt-1 block text-xs text-slate-400">A property, office, courthouse, care facility, or other site.</span></button><button type="button" onClick={()=>update('location_type','remote')} className={`rounded-xl border p-4 text-left ${form.location_type==='remote'?'border-gold/50 bg-gold/[.07]':'border-white/10'}`}><strong className="text-sm text-white">Remote or nationwide</strong><span className="mt-1 block text-xs text-slate-400">Business support, documents, coordination, or RON.</span></button></div>{form.location_type==='onsite'&&<div className="mt-5 grid gap-3 sm:grid-cols-[1fr_100px_130px]"><input className="input" placeholder="City" value={form.city} onChange={e=>update('city',e.target.value)}/><input className="input" placeholder="State" maxLength={2} value={form.state} onChange={e=>update('state',e.target.value.toUpperCase())}/><input className="input" placeholder="ZIP code" value={form.postal_code} onChange={e=>update('postal_code',e.target.value)}/></div>}</div>}
        {step===2&&<div><h3 className="text-xl font-bold text-white">How soon do you need it?</h3><div className="mt-5 grid gap-2 sm:grid-cols-2">{timings.map(item=><button key={item} type="button" onClick={()=>update('timing',item)} className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold ${form.timing===item?'border-gold/50 bg-gold/[.07] text-white':'border-white/10 text-slate-300 hover:border-white/25'}`}>{item}</button>)}</div><textarea className="input mt-5 min-h-28 resize-y" placeholder="What should be true when the work is finished? Add any deadline, access issue, document, property condition, or other detail that matters." value={form.details} onChange={e=>update('details',e.target.value)}/></div>}
        {step===3&&<div><h3 className="text-xl font-bold text-white">Last step - where should we reply?</h3><div className="mt-5 grid gap-3 sm:grid-cols-2"><input className="input" autoComplete="name" placeholder="Your name" value={form.contact_name} onChange={e=>update('contact_name',e.target.value)}/><input className="input" type="email" autoComplete="email" placeholder="Email address" value={form.email} onChange={e=>update('email',e.target.value)}/><input className="input sm:col-span-2" type="tel" autoComplete="tel" placeholder="Phone (optional)" value={form.phone} onChange={e=>update('phone',e.target.value)}/><input aria-hidden="true" tabIndex={-1} autoComplete="off" className="hidden" value={form.website} onChange={e=>update('website',e.target.value)}/></div><label className="mt-4 flex items-start gap-3 text-xs leading-5 text-slate-400"><input type="checkbox" className="mt-0.5 accent-gold" checked={form.follow_up_opt_in} onChange={e=>update('follow_up_opt_in',e.target.checked)}/><span>Send up to three helpful follow-up emails about this request if I do not book. I can unsubscribe at any time. Service-related replies are sent either way.</span></label><p className="mt-4 rounded-lg border border-gold/15 bg-gold/[.04] px-4 py-3 text-xs leading-5 text-slate-300"><strong className="text-white">Response promise:</strong> a person will review your request and reply within two business hours.</p></div>}
      </motion.div>
    </AnimatePresence>{error&&<p role="alert" className="mt-4 rounded-lg border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-sm text-red-200">{error}</p>}<div className="mt-6 flex items-center justify-between gap-3">{step>0?<button type="button" className="btn-outline" onClick={()=>{setError('');setStep(value=>value-1)}}>Back</button>:<span/>}{step<3?<button type="button" className="btn-gold" onClick={next}>Continue</button>:<button type="button" className="btn-gold" disabled={busy} onClick={()=>void submit()}>{busy?'Sending request…':'Send My Request'}</button>}</div></div>
  </div>
}
