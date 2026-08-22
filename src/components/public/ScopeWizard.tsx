import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { LocateFixed } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { usePublicVisitor } from '../../lib/publicContext'
import { playPublicSound } from '../../lib/sound'
import { Icon, type IconName } from '../kit/Icon'
import { AddressAutocomplete } from '../kit/AddressAutocomplete'
import { jobsForWorld, publicIntakeCopy, worldFromPublicParams } from '../../lib/workspace'
import type { OperatingWorld } from '../../../shared/workspace'
import { resolveScopeEntry, visibleQuestions, type ScopeQuestion } from '../../../shared/scopeEntries'
import type { GeoHit } from '../../../shared/geocode'
import { DEFAULT_SCOPE_REPLY_WINDOW, type PublicSiteConfig } from '../../../shared/siteConfig'
import { OPENING_QUESTION, TIMING_QUESTION, acknowledgement } from '../../../shared/guidedIntake'

function UseMyLocationButton({ onResolved }: { onResolved: (a: GeoHit) => void }) {
  const [state, setState] = useState<'idle' | 'locating' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function run() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState('error'); setMessage('This browser does not support location.')
      return
    }
    setState('locating'); setMessage('')
    navigator.geolocation.getCurrentPosition(async (p) => {
      try {
        const res = await fetch(`/api/geo/reverse?lat=${p.coords.latitude}&lng=${p.coords.longitude}`)
        const data = await res.json().catch(() => ({})) as { result?: GeoHit; error?: string }
        if (!res.ok || !data.result) throw new Error(data.error || 'reverse geocode failed')
        onResolved(data.result)
        setState('ok'); setMessage('')
      } catch (err) {
        setState('error')
        setMessage(err instanceof Error ? err.message : 'Could not resolve address from location.')
      }
    }, (err) => {
      setState('error')
      // PermissionDeniedError.code === 1
      setMessage(err.code === 1 ? 'Location permission was not granted.' : (err.message || 'Location unavailable.'))
    }, { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={run} disabled={state === 'locating'} className="inline-flex items-center gap-1.5 rounded-md border border-white/12 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:border-gold/40 hover:text-gold disabled:opacity-60">
        <LocateFixed size={12} />
        {state === 'locating' ? 'Locating...' : 'Use my current location'}
      </button>
      {state === 'error' && message && <span className="text-[10px] text-amber-300">{message}</span>}
    </div>
  )
}

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
const propertyJobs=new Set(['cleaning_turnover','property_inspection','eviction_reo'])
const flexibleLocationJobs=new Set(['documents_notary','other'])
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

// Session-only draft autosave. Nothing here is sensitive beyond what the
// visitor typed voluntarily, and it never leaves the tab.
const DRAFT_KEY='pmv_scope_draft'
function readScopeDraft(key:string):{form:Form;step:number}|null{
  if(typeof window==='undefined')return null
  try{
    const raw=window.sessionStorage.getItem(DRAFT_KEY)
    if(!raw)return null
    const parsed=JSON.parse(raw) as {key?:unknown;form?:unknown;step?:unknown}
    if(!parsed||parsed.key!==key||!parsed.form||typeof parsed.step!=='number')return null
    return {form:parsed.form as Form,step:parsed.step}
  }catch{return null}
}
function writeScopeDraft(key:string,form:Form,step:number){
  if(typeof window==='undefined')return
  try{window.sessionStorage.setItem(DRAFT_KEY,JSON.stringify({key,form,step}))}catch{/* private mode */}
}
function clearScopeDraft(){
  if(typeof window==='undefined')return
  try{window.sessionStorage.removeItem(DRAFT_KEY)}catch{/* private mode */}
}

const WORLD_DEFAULT_JOB: Partial<Record<OperatingWorld,string>>={property:'cleaning_turnover',documents:'documents_notary',business:'business_operations',funding:'business_operations'}
const WORLD_LABEL: Record<string,string>={property:'property',documents:'document',business:'business',funding:'funding'}

function optionButtonCls(selected:boolean){
  return `rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${selected?'border-gold/50 bg-gold/[.07] text-white':'border-white/10 text-slate-300 hover:border-white/25'}`
}

function QuestionField({q,val,onChange}:{q:ScopeQuestion;val:string|string[]|undefined;onChange:(v:string|string[])=>void}){
  const useButtons = q.type==='yesno' || (q.type==='select' && (q.options?.length||0) <= 10)
  return <div>
    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">{q.label}</label>
    {q.hint && <p className="text-[11px] text-slate-500">{q.hint}</p>}
    {useButtons && <div className={`mt-2 grid gap-2 ${q.type==='yesno'?'grid-cols-2':(q.options?.length||0)>4?'sm:grid-cols-2':'sm:grid-cols-2'}`}>
      {q.options?.map(o=>{
        const selected = val===o
        return <button key={o} type="button" onClick={()=>onChange(o)} className={optionButtonCls(selected)}>{o}</button>
      })}
    </div>}
    {q.type==='select' && !useButtons && <select className="input mt-1" value={typeof val==='string'?val:''} onChange={e=>onChange(e.target.value)}>
      <option value="">Choose…</option>
      {q.options?.map(o=><option key={o} value={o}>{o}</option>)}
    </select>}
    {q.type==='multiselect' && <div className="mt-2 grid gap-1.5 sm:grid-cols-2">{q.options?.map(o=>{
      const arr = Array.isArray(val)?val:[]
      const selected = arr.includes(o)
      return <button key={o} type="button" onClick={()=>onChange(selected?arr.filter(x=>x!==o):[...arr,o])} className={optionButtonCls(selected)}>{o}</button>
    })}</div>}
    {q.type==='text' && <input className="input mt-1" value={typeof val==='string'?val:''} onChange={e=>onChange(e.target.value)} placeholder={q.hint||''}/>}
    {q.type==='number' && <input className="input mt-1" inputMode="numeric" value={typeof val==='string'?val:''} onChange={e=>onChange(e.target.value.replace(/[^\d]/g,''))} placeholder={q.hint||'e.g. 1450'}/>}
  </div>
}

export function ScopeWizard({source='scope-page',compact=false}:{source?:string;compact?:boolean}){
  const navigate=useNavigate();const [params]=useSearchParams()
  const visitor=usePublicVisitor()
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
  const hasExplicitIntent=!!(params.get('world')||params.get('service')||params.get('job')||params.get('entry')||params.get('guide')||params.get('family')||params.get('audience'))
  const draftKey=[serviceKey,offeringId,params.get('job'),entry?.id].filter(Boolean).join('|')||'general'
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
  const rememberedWorld=!hasExplicitIntent?visitor.state.world:''
  const worldDefaultJob=rememberedWorld&&rememberedWorld!=='general'?(WORLD_DEFAULT_JOB[rememberedWorld]??''):''
  const initialJob=visibleJobs.some((job)=>job.value===preselected)?preselected:(worldDefaultJob&&visibleJobs.some((job)=>job.value===worldDefaultJob)?worldDefaultJob:(entry?.job||''))
  const restoredDraft=readScopeDraft(draftKey)
  const [locked,setLocked]=useState(!!entry)
  const [step,setStep]=useState<number>(()=>restoredDraft?restoredDraft.step:(initialJob?1:0));const [busy,setBusy]=useState(false);const [error,setError]=useState('')
  const [form,setForm]=useState<Form>(()=>{
    if(restoredDraft)return restoredDraft.form
    return {
      job_type:initialJob,
      location_type:(entry?.remoteDefault||remoteJobs.has(initialJob))?'remote':'onsite',
      address:visitor.state.address.address||'',
      city:visitor.state.address.city||'',
      state:visitor.state.address.state||'',
      postal_code:visitor.state.address.postal_code||'',
      timing:visitor.state.urgency||'',
      details:visitor.state.description||'',
      contact_name:'',email:'',phone:'',follow_up_opt_in:false,website:'',
      service_answers:{},
    }
  })
  const draftHydrated=useRef(false)
  useEffect(()=>{
    if(!draftHydrated.current){draftHydrated.current=true;return}
    writeScopeDraft(draftKey,form,step)
  },[form,step,draftKey])

  // HQ-configurable reply-time promise (falls back to the default phrase).
  const [replyWindow,setReplyWindow]=useState(DEFAULT_SCOPE_REPLY_WINDOW)
  useEffect(()=>{
    let live=true
    api.get<PublicSiteConfig>('/public/site-config').then(r=>{if(live&&r?.scopeReplyWindow)setReplyWindow(r.scopeReplyWindow)}).catch(()=>{})
    return ()=>{live=false}
  },[])

  const catalogQuestions: ScopeQuestion[] = useMemo(() => {
    if(entry && form.job_type===entry.job) return entry.questions
    return resolveScopeEntry({job:form.job_type})?.questions || []
  }, [entry, form.job_type])
  const activeQuestions = useMemo(
    () => visibleQuestions(catalogQuestions, form.service_answers, form.location_type),
    [catalogQuestions, form.service_answers, form.location_type],
  )
  const update=<K extends keyof Form>(key:K,value:Form[K])=>setForm(current=>({...current,[key]:value}))
  const setAnswer=(k:string,v:string|string[])=>setForm(current=>({...current,service_answers:{...current.service_answers,[k]:v}}))
  const chooseJob=(value:string)=>{
    setForm(current=>({...current,job_type:value,location_type:remoteJobs.has(value)?'remote':'onsite',service_answers:{}}))
    setError('')
    setStep(1)
    playPublicSound('step')
  }

  function next(){
    if(step===0&&!form.job_type)return setError('Choose the kind of work you need.')
    if(step===1){
      if(form.location_type==='onsite'&&(!form.city.trim()||!form.state.trim()))return setError('Enter the city and state for the on-site work.')
      if(!form.timing)return setError('Choose the timing that is closest to what you need.')
    }
    setError('');setStep(value=>Math.min(2,value+1));playPublicSound('step')
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
      clearScopeDraft()
      visitor.rememberAddress({address:form.address,city:form.city,state:form.state,postal_code:form.postal_code})
      visitor.rememberUrgency(form.timing)
      visitor.rememberDescription(form.details)
      const submitWorld=worldFromPublicParams({job:form.job_type,service:entry?.serviceKey||serviceKey})
      if(submitWorld!=='general')visitor.setWorld(submitWorld)
      playPublicSound('success')
      navigate(response.confirmation_url)
    }catch(err){setError(err instanceof ApiError?err.message:'We could not submit the request. Call (561) 388-7879 if the need is urgent.')}
    finally{setBusy(false)}
  }

  const selectedLabel=entry && form.job_type===entry.job ? entry.pickerLabel : jobs.find(j=>j.value===form.job_type)?.label
  const totalSteps = 3
  const displayTotal = locked ? totalSteps - 1 : totalSteps
  const displayStep = locked ? step : step + 1
  const progressPct = (displayStep / displayTotal) * 100
  const showDetailsStep = step === 1
  const showContactStep = step === 2
  const isLastStep = showContactStep
  const showLocationToggle = flexibleLocationJobs.has(form.job_type)
  const showAddress = form.location_type==='onsite' || propertyJobs.has(form.job_type)
  const addressLabel = propertyJobs.has(form.job_type) ? 'What is the property address?' : 'Where does this need to happen?'
  const detailsPlaceholder = entry?.id==='moving-data-between-systems'
    ? 'Anything else about the source, destination, or records that must survive the move.'
    : world==='property'
    ? 'Access, condition, or anything else we should know before the visit.'
    : world==='documents'
      ? 'Document type, signer location, deadline, and whether it needs notary, RON, filing, or courier.'
      : world==='business'
        ? 'The capacity, system, or follow-through gap, plus any deadline that matters.'
        : 'What should be true when the work is finished? Add any deadline, access issue, document, property condition, or other detail that matters.'
  const detailsTitle = entry && form.job_type===entry.job ? entry.title : 'A few details specific to this work'

  // Named steps, plus a line that repeats back what they just told us before
  // asking the next thing. Built in shared/guidedIntake so the phrasing and
  // the honesty rule behind it are the same on every questionnaire.
  const stepNames = locked ? ['The details','Where to reply'] : ['The work','The details','Where to reply']
  const activeStepIndex = locked ? step-1 : step
  const helperLine = acknowledgement(
    step===0 ? 'opening' : step===1 ? 'details' : 'contact',
    {
      workLabel: selectedLabel,
      city: form.city,
      state: form.state,
      locationType: form.location_type,
      timing: form.timing,
      firstName: form.contact_name.trim().split(/\s+/)[0] || null,
    },
  )

  return <div className={`overflow-hidden rounded-2xl border border-white/10 bg-navy-900/75 shadow-[0_24px_80px_rgba(0,0,0,.24)] ${compact?'':'max-w-5xl'}`}>
    <div className="border-b border-white/10 px-5 py-4 sm:px-7">
      <div className="flex items-center justify-between gap-5">
        <div><p className="eyebrow">{selectedLabel||copy.eyebrow}</p><p className="mt-1 text-xs text-slate-500">About two minutes · no account needed · a real person replies within {replyWindow}</p></div>
        <span className="shrink-0 text-xs font-bold text-gold">Step {displayStep} of {displayTotal}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        {stepNames.map((name,i)=>(
          <span key={name} className="flex items-center gap-2">
            <span className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${i===activeStepIndex?'text-gold':i<activeStepIndex?'text-slate-300':'text-slate-600'}`}>{name}</span>
            {i<stepNames.length-1 && <span className={`h-px w-5 ${i<activeStepIndex?'bg-gold/50':'bg-white/10'}`}/>}
          </span>
        ))}
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full bg-gold" animate={{width:`${progressPct}%`}} transition={{type:'spring',stiffness:120,damping:22}}/></div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={helperLine} initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:.2}} className="mt-3 flex items-start gap-2 text-sm leading-6 text-slate-300">
          <Icon name="sparkles" size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-gold" /><span>{helperLine}</span>
        </motion.p>
      </AnimatePresence>
    </div>

    <div className="p-5 sm:p-7"><AnimatePresence mode="wait" initial={false}>
      <motion.div key={step} initial={{opacity:0,x:16}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-12}} transition={{duration:.18}}>
        {locked && entry && step>0 && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/25 bg-gold/[.06] px-4 py-3">
          <p className="text-sm text-white"><span className="text-[10px] font-bold uppercase tracking-[.14em] text-gold">This request</span><span className="mt-0.5 block font-semibold">{entry.pickerLabel}</span></p>
          <button type="button" className="text-xs font-bold text-gold hover:underline" onClick={()=>{setLocked(false);setStep(0)}}>Choose a different need</button>
        </div>}

        {step===0 && <div>
          {rememberedWorld&&rememberedWorld!=='general'&&(
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/25 bg-gold/[.06] px-4 py-3">
              <p className="text-sm text-white"><span className="text-[10px] font-bold uppercase tracking-[.14em] text-gold">Remembered</span><span className="mt-0.5 block font-semibold">Earlier you were looking at {WORLD_LABEL[rememberedWorld]??rememberedWorld} support.</span></p>
              <div className="flex items-center gap-3">
                <button type="button" className="text-xs font-bold text-gold hover:underline" onClick={()=>{if(worldDefaultJob)chooseJob(worldDefaultJob)}}>Start there</button>
                <button type="button" className="text-xs font-bold text-slate-400 hover:text-gold hover:underline" onClick={()=>{visitor.clear();setError('')}}>Start fresh</button>
              </div>
            </div>
          )}
          <h3 className="text-xl font-bold text-white">{world==='general'?OPENING_QUESTION:copy.pickerTitle}</h3>
          <p className="mt-1 text-sm text-slate-400">{world==='general'?'Pick the closest fit. The next screen is the questions for that work.':'These options stay inside this operating world. The next screen is the questions for that work.'}</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">{visibleJobs.map(job=>
            <button key={job.value} type="button" onClick={()=>chooseJob(job.value)} className={`flex min-h-[88px] items-start gap-3 rounded-xl border p-4 text-left transition ${form.job_type===job.value?'border-gold/55 bg-gold/[.08]':'border-white/10 bg-white/[.02] hover:border-white/25'}`}>
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-navy-950 text-gold"><Icon name={job.icon} size={17}/></span>
              <span><strong className="block text-sm text-white">{job.label}</strong><span className="mt-1 block text-xs leading-5 text-slate-400">{job.body}</span></span>
            </button>)}
          </div>
        </div>}

        {showDetailsStep && <div>
          <h3 className="text-xl font-bold text-white">{detailsTitle}</h3>
          <p className="mt-1 text-sm text-slate-400">Same structure on every request: location, a yes or no, then photos, reports, or a quick check-in.</p>

          {showLocationToggle && <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={()=>update('location_type','onsite')} className={optionButtonCls(form.location_type==='onsite')}><strong className="block text-white">At a location</strong><span className="mt-1 block text-xs font-normal text-slate-400">A property, office, courthouse, care facility, or other site.</span></button>
            <button type="button" onClick={()=>update('location_type','remote')} className={optionButtonCls(form.location_type==='remote')}><strong className="block text-white">Remote or nationwide</strong><span className="mt-1 block text-xs font-normal text-slate-400">RON, document prep, or coordination that does not require a site visit.</span></button>
          </div>}

          {showAddress && <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">{addressLabel}</label>
              <UseMyLocationButton
                onResolved={(a) => {
                  update('address', a.line1 || '')
                  if (a.city) update('city', a.city)
                  if (a.state) update('state', a.state.slice(0, 2).toUpperCase())
                  if (a.postal_code) update('postal_code', a.postal_code)
                }}
              />
            </div>
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
            <p className="text-[11px] text-slate-500">Use My Current Location prefills the address you are standing at right now. You can still search or type a different service address instead.</p>
          </div>}

          <div className="mt-6 space-y-5">{activeQuestions.map((q)=>
            <QuestionField key={q.key} q={q} val={form.service_answers[q.key]} onChange={(v)=>setAnswer(q.key,v)}/>
          )}</div>

          <div className="mt-6">
            <label className="block text-sm font-semibold text-white">{TIMING_QUESTION}</label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">{timings.map(item=>
              <button key={item} type="button" onClick={()=>update('timing',item)} className={optionButtonCls(form.timing===item)}>{item}</button>)}
            </div>
          </div>
          <textarea className="input mt-5 min-h-24 resize-y" placeholder={detailsPlaceholder} value={form.details} onChange={e=>update('details',e.target.value)}/>
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
          <p className="mt-4 rounded-lg border border-gold/15 bg-gold/[.04] px-4 py-3 text-xs leading-5 text-slate-300"><strong className="text-white">Response promise:</strong> a real person will review your request and reply within {replyWindow}.</p>
        </div>}

      </motion.div>
    </AnimatePresence>
    {error && <p role="alert" className="mt-4 rounded-lg border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-sm text-red-200">{error}</p>}
    <div className="mt-6 flex items-center justify-between gap-3">
      {step>0 ? <button type="button" className="btn-outline" onClick={()=>{setError('');if(locked&&step===1){setLocked(false);setStep(0)}else setStep(v=>v-1)}}>Back</button> : <span/>}
      {step===0
        ? <span/>
        : !isLastStep
          ? <button type="button" className="btn-gold" onClick={next}>Continue</button>
          : <button type="button" className="btn-gold" disabled={busy} onClick={()=>void submit()}>{busy?'Sending request…':copy.cta}</button>}
    </div>
    </div>
  </div>
}
