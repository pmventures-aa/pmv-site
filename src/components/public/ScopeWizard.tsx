import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { api, ApiError } from '../../lib/api'
import { Icon, type IconName } from '../kit/Icon'
import { AddressAutocomplete } from '../kit/AddressAutocomplete'
import { jobsForWorld, publicIntakeCopy, worldFromPublicParams } from '../../lib/workspace'
import { resolveScopeEntry, type ScopeQuestion } from '../../../shared/scopeEntries'

type ScopeResponse = { confirmation_url:string; request_token?:string; setup_url?:string|null; account_status?:string }
type Form = {
  job_type:string
  location_type:'onsite'|'remote'
  address:string
  city:string
  state:string
  postal_code:string
  timing:string
  details:string
  contact_name:string
  email:string
  phone:string
  follow_up_opt_in:boolean
  website:string
  service_answers:Record<string,string|string[]>
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE_RE = /^[\d\s().+\-]{10,}$/
const validEmail = (v:string) => EMAIL_RE.test(v.trim())
const validPhone = (v:string) => !v.trim() || (PHONE_RE.test(v) && v.replace(/\D/g,'').length >= 10)

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
  funding:'business_operations',
}
const timings=['As soon as possible','Within 2-3 business days','This week','I have a specific date','Flexible / planning ahead']


export function ScopeWizard({source='scope-page',compact=false}:{source?:string;compact?:boolean}){
  const navigate=useNavigate();const [params]=useSearchParams()
  const serviceKey=params.get('service')||''
  const offeringId=params.get('offering')||''
  const requestSource=params.get('source')||source
  const entry=useMemo(()=>resolveScopeEntry({
    guide:params.get('guide'),
    entry:params.get('entry'),
    service:serviceKey,
    job:params.get('job'),
    offering:offeringId,
    source:requestSource,
  }),[params,serviceKey,offeringId,requestSource])
  const world=worldFromPublicParams({
    world:params.get('world'),
    service:serviceKey,
    job:params.get('job')||entry?.job,
    source:requestSource,
    audience:params.get('audience'),
    family:params.get('family'),
    guide:params.get('guide'),
    entry:params.get('entry'),
  })
  const copy=publicIntakeCopy(world)
  const visibleJobs=jobs.filter((job)=>jobsForWorld(world).includes(job.value))
  const preselected=entry?.job||params.get('job')||serviceJobs[serviceKey]||(visibleJobs.length===1?visibleJobs[0].value:'')
  const initialJob=visibleJobs.some((job)=>job.value===preselected)?preselected:(entry?.job||'')
  const [locked,setLocked]=useState(!!entry)
  const [step,setStep]=useState(initialJob?1:0);const [busy,setBusy]=useState(false);const [error,setError]=useState('')
  const [form,setForm]=useState<Form>({
    job_type:initialJob,
    location_type:(entry?.remoteDefault||remoteJobs.has(initialJob))?'remote':'onsite',
    address:'',city:'',state:'',postal_code:'',timing:'',details:'',
    contact_name:'',email:'',phone:'',follow_up_opt_in:false,website:'',
    service_answers:{},
  })

  const activeQuestions:ScopeQuestion[] = useMemo(() => {
    if(entry && form.job_type===entry.job) return entry.questions
    return resolveScopeEntry({job:form.job_type})?.questions || []
  }, [entry, form.job_type])
  const update=<K extends keyof Form>(key:K,value:Form[K])=>setForm(current=>({...current,[key]:value}))
  const setAnswer=(k:string,v:string|string[])=>setForm(current=>({...current,service_answers:{...current.service_answers,[k]:v}}))
  const chooseJob=(value:string)=>{setForm(current=>({...current,job_type:value,location_type:remoteJobs.has(value)?'remote':'onsite',service_answers:{}}));setError('')}

  function next(){
    if(step===0&&!form.job_type)return setError('Choose the kind of work you need.')
    if(step===1&&form.location_type==='onsite'&&(!form.city.trim()||!form.state.trim()))return setError('Enter the city and state for the on-site work.')
    if(step===2&&!form.timing)return setError('Choose the timing that is closest to what you need.')
    setError('');setStep(value=>Math.min(4,value+1))
  }
  async function submit(){
    if(!form.contact_name.trim())return setError('Enter your name.')
    if(!validEmail(form.email))return setError('Enter a valid email address (e.g. you@example.com).')
    if(!validPhone(form.phone))return setError('Phone number needs at least 10 digits.')
    setBusy(true);setError('')
    try{
      const response=await api.post<ScopeResponse>('/scope-requests',{
        ...form,
        source:requestSource,
        service_key:entry?.serviceKey||serviceKey||undefined,
        offering_id:offeringId||undefined,
        audience:params.get('audience')||undefined,
        guide_slug:params.get('guide')||entry?.id||undefined,
        entry_id:entry?.id||undefined,
      })
      if(response.setup_url&&response.request_token){
        try{sessionStorage.setItem(`pmv_scope_setup_${response.request_token}`,response.setup_url)}catch{/* private mode */}
      }
      navigate(response.confirmation_url)
    }catch(err){setError(err instanceof ApiError?err.message:'We could not submit the request. Call (561) 388-7879 if the need is urgent.')}
    finally{setBusy(false)}
  }

  const selectedLabel=entry && form.job_type===entry.job ? entry.pickerLabel : jobs.find(j=>j.value===form.job_type)?.label
  const totalSteps = activeQuestions.length ? 5 : 4
  const displayTotal = locked ? totalSteps - 1 : totalSteps
  const displayStep = locked ? step : step + 1
  const progressPct = (displayStep / displayTotal) * 100
  const showQuestionsStep = step === 3 && activeQuestions.length > 0
  const showContactStep = (activeQuestions.length ? step === 4 : step === 3)
  const isLastStep = showContactStep
  const detailsPlaceholder = entry?.id==='moving-data-between-systems'
    ? 'Anything else about the source, destination, or records that must survive the move.'
    : world==='property'
    ? 'Address, access, occupancy, condition, and what should be true when the visit is finished.'
    : world==='documents'
      ? 'Document type, signer location, deadline, and whether it needs notary, RON, filing, or courier.'
      : world==='business'
        ? 'The capacity, system, or follow-through gap, plus any deadline that matters.'
        : 'What should be true when the work is finished? Add any deadline, access issue, document, property condition, or other detail that matters.'

  return <div className={`overflow-hidden rounded-2xl border border-white/10 bg-navy-900/75 shadow-[0_24px_80px_rgba(0,0,0,.24)] ${compact?'':'max-w-5xl'}`}>
    <div className="border-b border-white/10 px-5 py-4 sm:px-7">
      <div className="flex items-center justify-between gap-5">
        <div><p className="eyebrow">{selectedLabel||copy.eyebrow}</p><p className="mt-1 text-xs text-slate-500">About two minutes · a workspace is reserved when you send this · reply within 2 business hours</p></div>
        <span className="text-xs font-bold text-gold">{displayStep} / {displayTotal}</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full bg-gold" animate={{width:`${progressPct}%`}}/></div>
    </div>

    <div className="p-5 sm:p-7"><AnimatePresence mode="wait" initial={false}>
      <motion.div key={step} initial={{opacity:0,x:16}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-12}} transition={{duration:.18}}>
        {locked && entry && step>0 && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/25 bg-gold/[.06] px-4 py-3">
          <p className="text-sm text-white"><span className="text-[10px] font-bold uppercase tracking-[.14em] text-gold">This request</span><span className="mt-0.5 block font-semibold">{entry.pickerLabel}</span></p>
          <button type="button" className="text-xs font-bold text-gold hover:underline" onClick={()=>{setLocked(false);setStep(0)}}>Choose a different need</button>
        </div>}

        {step===0 && <div>
          <h3 className="text-xl font-bold text-white">{copy.pickerTitle}</h3>
          <p className="mt-1 text-sm text-slate-400">{world==='general'?'Pick the closest fit. You can add detail in a moment.':'These options stay inside this operating world. You can add detail in a moment.'}</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">{visibleJobs.map(job=>
            <button key={job.value} type="button" onClick={()=>chooseJob(job.value)} className={`flex min-h-[88px] items-start gap-3 rounded-xl border p-4 text-left transition ${form.job_type===job.value?'border-gold/55 bg-gold/[.08]':'border-white/10 bg-white/[.02] hover:border-white/25'}`}>
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-navy-950 text-gold"><Icon name={job.icon} size={17}/></span>
              <span><strong className="block text-sm text-white">{job.label}</strong><span className="mt-1 block text-xs leading-5 text-slate-400">{job.body}</span></span>
            </button>)}
          </div>
        </div>}

        {step===1 && <div>
          <h3 className="text-xl font-bold text-white">{copy.locationTitle}</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={()=>update('location_type','onsite')} className={`rounded-xl border p-4 text-left ${form.location_type==='onsite'?'border-gold/50 bg-gold/[.07]':'border-white/10'}`}><strong className="text-sm text-white">At a location</strong><span className="mt-1 block text-xs text-slate-400">{world==='property'?'The address, unit, or site that needs the visit.':'A property, office, courthouse, care facility, or other site.'}</span></button>
            <button type="button" onClick={()=>update('location_type','remote')} className={`rounded-xl border p-4 text-left ${form.location_type==='remote'?'border-gold/50 bg-gold/[.07]':'border-white/10'}`}><strong className="text-sm text-white">Remote or nationwide</strong><span className="mt-1 block text-xs text-slate-400">{world==='documents'?'RON, document prep, or coordination that does not require a site visit.':'Business support, documents, coordination, or RON.'}</span></button>
          </div>
          {form.location_type==='onsite' && <div className="mt-5 space-y-3">
            <AddressAutocomplete
              value={form.address}
              onChange={(v)=>update('address',v)}
              onSelect={(a)=>{
                update('address',a.line1||form.address)
                if(a.city) update('city',a.city)
                if(a.state) update('state',a.state.slice(0,2).toUpperCase())
                if(a.postal_code) update('postal_code',a.postal_code)
              }}
              placeholder="Start typing the property address"
              inputClassName="input"
            />
            <div className="grid gap-3 sm:grid-cols-[1fr_100px_130px]">
              <input className="input" placeholder="City" value={form.city} onChange={e=>update('city',e.target.value)}/>
              <input className="input" placeholder="State" maxLength={2} value={form.state} onChange={e=>update('state',e.target.value.toUpperCase())}/>
              <input className="input" placeholder="ZIP code" value={form.postal_code} onChange={e=>update('postal_code',e.target.value)}/>
            </div>
          </div>}
        </div>}

        {step===2 && <div>
          <h3 className="text-xl font-bold text-white">How soon do you need it?</h3>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">{timings.map(item=>
            <button key={item} type="button" onClick={()=>update('timing',item)} className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold ${form.timing===item?'border-gold/50 bg-gold/[.07] text-white':'border-white/10 text-slate-300 hover:border-white/25'}`}>{item}</button>)}
          </div>
          <textarea className="input mt-5 min-h-28 resize-y" placeholder={detailsPlaceholder} value={form.details} onChange={e=>update('details',e.target.value)}/>
        </div>}

        {showQuestionsStep && <div>
          <h3 className="text-xl font-bold text-white">{entry && form.job_type===entry.job ? 'A few details specific to this work' : 'A few details specific to this work'}</h3>
          <p className="mt-1 text-sm text-slate-400">{entry?.id==='moving-data-between-systems'?'These questions are for a data move, not a generic operations request.':'All optional, but they help us reply with real pricing instead of a generic follow-up.'}</p>
          <div className="mt-5 space-y-4">{activeQuestions.map((q)=>{
            const val = form.service_answers[q.key]
            return <div key={q.key}>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">{q.label}</label>
              {q.hint && <p className="text-[11px] text-slate-500">{q.hint}</p>}
              {q.type==='select' && <select className="input mt-1" value={typeof val==='string'?val:''} onChange={e=>setAnswer(q.key,e.target.value)}>
                <option value="">Choose…</option>
                {q.options?.map(o=><option key={o} value={o}>{o}</option>)}
              </select>}
              {q.type==='multiselect' && <div className="mt-1 grid gap-1.5 sm:grid-cols-2">{q.options?.map(o=>{
                const arr = Array.isArray(val)?val:[]
                const selected = arr.includes(o)
                return <label key={o} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-xs ${selected?'border-gold/50 bg-gold/[.08] text-white':'border-white/10 text-slate-300'}`}>
                  <input type="checkbox" className="accent-gold" checked={selected} onChange={()=>setAnswer(q.key, selected?arr.filter(x=>x!==o):[...arr,o])}/>
                  <span>{o}</span>
                </label>
              })}</div>}
              {q.type==='text' && <input className="input mt-1" value={typeof val==='string'?val:''} onChange={e=>setAnswer(q.key,e.target.value)} placeholder={q.hint||''}/>}
              {q.type==='number' && <input className="input mt-1" inputMode="numeric" value={typeof val==='string'?val:''} onChange={e=>setAnswer(q.key,e.target.value.replace(/[^\d]/g,''))} placeholder={q.hint||'e.g. 1450'}/>}
            </div>
          })}</div>
        </div>}

        {showContactStep && <div>
          <h3 className="text-xl font-bold text-white">Last step - where should we reply?</h3>
          <p className="mt-1 text-sm text-slate-400">Sending this reserves a client workspace as a lead. You can set a password after, or we will email a setup link. Logging in later is what turns a lead into a prospect.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <input className="input" autoComplete="name" placeholder="Your name" value={form.contact_name} onChange={e=>update('contact_name',e.target.value)}/>
            <input className="input" type="email" inputMode="email" autoComplete="email" placeholder="Email address" value={form.email} onChange={e=>update('email',e.target.value)}/>
            <input className="input sm:col-span-2" type="tel" inputMode="tel" autoComplete="tel" placeholder="Phone (optional)" value={form.phone} onChange={e=>update('phone',e.target.value)}/>
            <input aria-hidden="true" tabIndex={-1} autoComplete="off" className="hidden" value={form.website} onChange={e=>update('website',e.target.value)}/>
          </div>
          {form.email && !validEmail(form.email) && <p className="mt-2 text-xs text-amber-300">That does not look like a valid email address.</p>}
          {form.phone && !validPhone(form.phone) && <p className="mt-2 text-xs text-amber-300">Phone number needs at least 10 digits.</p>}
          <label className="mt-4 flex items-start gap-3 text-xs leading-5 text-slate-400">
            <input type="checkbox" className="mt-0.5 accent-gold" checked={form.follow_up_opt_in} onChange={e=>update('follow_up_opt_in',e.target.checked)}/>
            <span>Send up to three helpful follow-up emails about this request if I do not book. I can unsubscribe at any time. Service-related replies are sent either way.</span>
          </label>
          <p className="mt-4 rounded-lg border border-gold/15 bg-gold/[.04] px-4 py-3 text-xs leading-5 text-slate-300"><strong className="text-white">Response promise:</strong> a person will review your request and reply within two business hours.</p>
        </div>}

      </motion.div>
    </AnimatePresence>
    {error && <p role="alert" className="mt-4 rounded-lg border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-sm text-red-200">{error}</p>}
    <div className="mt-6 flex items-center justify-between gap-3">
      {step>0 ? <button type="button" className="btn-outline" onClick={()=>{setError('');if(locked&&step===1){setLocked(false);setStep(0)}else setStep(v=>v-1)}}>Back</button> : <span/>}
      {!isLastStep
        ? <button type="button" className="btn-gold" onClick={next}>Continue</button>
        : <button type="button" className="btn-gold" disabled={busy} onClick={()=>void submit()}>{busy?'Sending request…':copy.cta}</button>}
    </div>
    </div>
  </div>
}
