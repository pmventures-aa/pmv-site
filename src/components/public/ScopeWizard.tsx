import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { api, ApiError } from '../../lib/api'
import { Icon, type IconName } from '../kit/Icon'
import { AddressAutocomplete } from '../kit/AddressAutocomplete'

type ScopeResponse = { confirmation_url:string }
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

// Regex validation - kept intentionally lenient. Email requires a
// user@host.tld shape; phone accepts US-formatted digits with common
// separators, min 10 digits.
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
}
const timings=['As soon as possible','Within 2-3 business days','This week','I have a specific date','Flexible / planning ahead']

// Per-job (or per-service key) targeted questions asked between the
// timing step and the contact step. Keeps intake short but captures the
// operational details we need to actually scope + price.
type Question = {
  key:string
  label:string
  hint?:string
  type:'select'|'multiselect'|'text'|'number'
  options?:string[]
}
const QUESTIONS_BY_JOB:Record<string,Question[]>={
  cleaning_turnover:[
    {key:'clean_type',label:'What kind of clean?',type:'select',options:['Standard turnover','Deep / detail clean','Move-out with punch list','Rent-ready','REO / vacant','Post-eviction / heavy condition','Vacancy maintenance (recurring)']},
    {key:'property_type',label:'Property type',type:'select',options:['Single-family','Condo','Townhome','Multi-unit 2-4','Small multi-family 5-20','Vacation / STR','Commercial']},
    {key:'square_feet',label:'Approx square footage',hint:'Best guess is fine',type:'number'},
    {key:'occupancy',label:'Current occupancy',type:'select',options:['Occupied','Vacant / on market','Vacant / off market','Transitioning','Owner-occupied']},
    {key:'access',label:'Access instructions',hint:'Lockbox, key hidden, tenant present, etc.',type:'text'},
  ],
  property_inspection:[
    {key:'inspection_type',label:'What kind of inspection?',type:'select',options:['Occupancy check (drive-by / knock)','Interior + photo package','Move-in / move-out condition report','Insurance / underwriting package','Rehab / construction progress','30/60/90-day rental','Vacant property check','Damage assessment']},
    {key:'property_type',label:'Property type',type:'select',options:['Single-family','Condo','Townhome','Multi-unit','Commercial','Land / lot']},
    {key:'recurring',label:'One-time or recurring?',type:'select',options:['One-time','Weekly','Bi-weekly','Monthly','Quarterly']},
    {key:'access',label:'Access instructions',type:'text'},
  ],
  documents_notary:[
    {key:'document_kind',label:'What kind of document work?',type:'multiselect',options:['Mobile notary','Remote Online Notary (RON)','Document prep / packet','Courier / delivery','Courthouse filing','Signing coordination','Attorney handoff']},
    {key:'signer_count',label:'How many signers?',type:'select',options:['1','2','3','4+']},
    {key:'has_document',label:'Do you already have the document?',type:'select',options:['Yes, ready to go','Yes, needs review','No, need help preparing it']},
    {key:'meeting_location',label:'Where does it need to happen?',hint:'Address, office, care facility, courthouse, remote…',type:'text'},
  ],
  eviction_reo:[
    {key:'stage',label:'Current stage',type:'select',options:['Pre-notice','Notice served','Filed / awaiting hearing','Judgment entered','Writ / lockout scheduled','Post-possession']},
    {key:'attorney',label:'Is an attorney already involved?',type:'select',options:['Yes','No','Not yet, looking to coordinate one']},
    {key:'property_condition',label:'Expected property condition',type:'select',options:['Normal turnover','Heavy trash / damage expected','Bio-aware condition','Unknown']},
    {key:'needs_after_lockout',label:'What is needed after lawful possession?',type:'multiselect',options:['Locksmith / rekey','Debris haul','Deep clean','Inspection + photos','Board-up / secure','Ready-to-list']},
  ],
  business_operations:[
    {key:'industry',label:'Industry / vertical',type:'select',options:['Real estate','Legal / professional','Retail','Restaurant / hospitality','Health / wellness','Home services / contractor','Property services','Non-profit','Other']},
    {key:'team_size',label:'Team size',type:'select',options:['Solo / owner-only','2-5','6-15','16-50','50+']},
    {key:'need_type',label:'What kind of help?',type:'multiselect',options:['Administrative capacity','Bookkeeping coordination','Vendor management','Client follow-up','Project management','Process documentation','Operational audit','Systems / software']},
    {key:'urgency',label:'Is there a launch date or deadline?',type:'text'},
  ],
  pos_payments:[
    {key:'current_system',label:'Current POS / payment provider',type:'text'},
    {key:'target_system',label:'Target system, if known',type:'text',hint:'Optional - we can help you compare'},
    {key:'business_type',label:'Business type',type:'select',options:['Retail','Restaurant / hospitality','Services','E-commerce','Multi-location','Other']},
    {key:'volume',label:'Approx monthly card volume',type:'select',options:['Under $10k','$10k-$50k','$50k-$250k','$250k-$1M','Over $1M','Not sure']},
    {key:'timeline',label:'Timeline pressure',type:'select',options:['ASAP - system down or provider issues','Within 30 days','1-3 months','No fixed date']},
  ],
  other:[
    {key:'outcome',label:'What outcome are you after?',hint:'Describe the "handled" state so we can scope backwards from it',type:'text'},
  ],
}

export function ScopeWizard({source='scope-page',compact=false}:{source?:string;compact?:boolean}){
  const navigate=useNavigate();const [params]=useSearchParams()
  const serviceKey=params.get('service')||''
  const offeringId=params.get('offering')||''
  const preselected=params.get('job')||serviceJobs[serviceKey]||''
  const requestSource=params.get('source')||source
  const [step,setStep]=useState(0);const [busy,setBusy]=useState(false);const [error,setError]=useState('')
  const [form,setForm]=useState<Form>({
    job_type:jobs.some(j=>j.value===preselected)?preselected:'',
    location_type:remoteJobs.has(preselected)?'remote':'onsite',
    address:'',city:'',state:'',postal_code:'',timing:'',details:'',
    contact_name:'',email:'',phone:'',follow_up_opt_in:false,website:'',
    service_answers:{},
  })

  const activeQuestions = useMemo(() => QUESTIONS_BY_JOB[form.job_type] || [], [form.job_type])

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
        service_key:serviceKey||undefined,
        offering_id:offeringId||undefined,
        audience:params.get('audience')||undefined,
        guide_slug:params.get('guide')||undefined,
      })
      navigate(response.confirmation_url)
    }catch(err){setError(err instanceof ApiError?err.message:'We could not submit the request. Call (561) 388-7879 if the need is urgent.')}
    finally{setBusy(false)}
  }

  const totalSteps = activeQuestions.length ? 5 : 4
  const progressPct = ((step + 1) / totalSteps) * 100
  const showQuestionsStep = step === 3 && activeQuestions.length > 0
  const showContactStep = (activeQuestions.length ? step === 4 : step === 3)
  const isLastStep = showContactStep

  return <div className={`overflow-hidden rounded-2xl border border-white/10 bg-navy-900/75 shadow-[0_24px_80px_rgba(0,0,0,.24)] ${compact?'':'max-w-5xl'}`}>
    <div className="border-b border-white/10 px-5 py-4 sm:px-7">
      <div className="flex items-center justify-between gap-5">
        <div><p className="eyebrow">Tell us what needs to happen</p><p className="mt-1 text-xs text-slate-500">No account · about two minutes · real reply within 2 business hours</p></div>
        <span className="text-xs font-bold text-gold">{step+1} / {totalSteps}</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full bg-gold" animate={{width:`${progressPct}%`}}/></div>
    </div>

    <div className="p-5 sm:p-7"><AnimatePresence mode="wait" initial={false}>
      <motion.div key={step} initial={{opacity:0,x:16}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-12}} transition={{duration:.18}}>

        {step===0 && <div>
          <h3 className="text-xl font-bold text-white">What outcome are you after?</h3>
          <p className="mt-1 text-sm text-slate-400">Pick the closest fit. You can add detail in a moment.</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">{jobs.map(job=>
            <button key={job.value} type="button" onClick={()=>chooseJob(job.value)} className={`flex min-h-[88px] items-start gap-3 rounded-xl border p-4 text-left transition ${form.job_type===job.value?'border-gold/55 bg-gold/[.08]':'border-white/10 bg-white/[.02] hover:border-white/25'}`}>
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-navy-950 text-gold"><Icon name={job.icon} size={17}/></span>
              <span><strong className="block text-sm text-white">{job.label}</strong><span className="mt-1 block text-xs leading-5 text-slate-400">{job.body}</span></span>
            </button>)}
          </div>
        </div>}

        {step===1 && <div>
          <h3 className="text-xl font-bold text-white">Where does the work need to happen?</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={()=>update('location_type','onsite')} className={`rounded-xl border p-4 text-left ${form.location_type==='onsite'?'border-gold/50 bg-gold/[.07]':'border-white/10'}`}><strong className="text-sm text-white">At a location</strong><span className="mt-1 block text-xs text-slate-400">A property, office, courthouse, care facility, or other site.</span></button>
            <button type="button" onClick={()=>update('location_type','remote')} className={`rounded-xl border p-4 text-left ${form.location_type==='remote'?'border-gold/50 bg-gold/[.07]':'border-white/10'}`}><strong className="text-sm text-white">Remote or nationwide</strong><span className="mt-1 block text-xs text-slate-400">Business support, documents, coordination, or RON.</span></button>
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
              placeholder="Start typing the property address…"
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
          <textarea className="input mt-5 min-h-28 resize-y" placeholder="What should be true when the work is finished? Add any deadline, access issue, document, property condition, or other detail that matters." value={form.details} onChange={e=>update('details',e.target.value)}/>
        </div>}

        {showQuestionsStep && <div>
          <h3 className="text-xl font-bold text-white">A few details specific to this work</h3>
          <p className="mt-1 text-sm text-slate-400">All optional but they help us reply with real pricing instead of a generic follow-up.</p>
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
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <input className="input" autoComplete="name" placeholder="Your name" value={form.contact_name} onChange={e=>update('contact_name',e.target.value)}/>
            <input className="input" type="email" inputMode="email" autoComplete="email" placeholder="Email address" value={form.email} onChange={e=>update('email',e.target.value)}/>
            <input className="input sm:col-span-2" type="tel" inputMode="tel" autoComplete="tel" placeholder="Phone (optional)" value={form.phone} onChange={e=>update('phone',e.target.value)}/>
            <input aria-hidden="true" tabIndex={-1} autoComplete="off" className="hidden" value={form.website} onChange={e=>update('website',e.target.value)}/>
          </div>
          {form.email && !validEmail(form.email) && <p className="mt-2 text-xs text-amber-300">That doesn't look like a valid email address.</p>}
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
      {step>0 ? <button type="button" className="btn-outline" onClick={()=>{setError('');setStep(v=>v-1)}}>Back</button> : <span/>}
      {!isLastStep
        ? <button type="button" className="btn-gold" onClick={next}>Continue</button>
        : <button type="button" className="btn-gold" disabled={busy} onClick={()=>void submit()}>{busy?'Sending request…':'Send My Request'}</button>}
    </div>
    </div>
  </div>
}
