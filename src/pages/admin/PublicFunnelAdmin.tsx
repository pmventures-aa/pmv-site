import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { services } from '../../data/services'
import { useAppPath } from '../../lib/basePath'
import ClientBannersAdmin from './ClientBannersAdmin'
import { SkeletonTable } from '../../components/admin/ui'

type CaseStudy={id:string;service_key:string|null;guide_slug:string|null;audience:string|null;headline:string;outcome:string;timeline_label:string;redacted_location:string|null;image_url:string|null;image_alt:string|null;published:number;sort_order:number}
type Rule={key:string;label:string;base_price_cents:number;per_sqft_cents:number;minimum_price_cents:number;range_low_percent:number;range_high_percent:number;active:number}
type Scope={id:string;job_type:string;contact_name:string;email:string;status:string;response_due_at:string;estimate_low_cents:number|null;estimate_high_cents:number|null}
type Slot={id:string;job_type:string;starts_at:string;ends_at:string;capacity:number;booked_count:number;active:number;internal_note:string|null}
type Data={case_studies:CaseStudy[];quote_rules:Rule[];scope_requests:Scope[];booking_slots:Slot[]}

const blank={headline:'',outcome:'',timeline_label:'',redacted_location:'',service_key:'',guide_slug:'',audience:'',image_url:'',image_alt:'',published:false,sort_order:0}
const blankSlot={job_type:'cleaning_turnover',starts_at:'',ends_at:'',capacity:1,internal_note:''}
const serviceChoices=Array.from(new Map(services.map(item=>[item.key,item])).values())
const guideChoices=['property-cleaning-turnover','local-support-south-florida','eviction-turnover-support','switching-pos-payment-providers','moving-data-between-systems','managing-business-transition','ongoing-administrative-support']
const audienceChoices=[['landlord','Landlord'],['agent-broker','Agent / broker'],['investor','Investor'],['business-owner','Business owner'],['operator','Operator'],['attorney','Attorney'],['corporate','Corporate']]

const TABS=[
  {key:'estimates',label:'Quotes',job:'Set the starting prices shown on the public quote tool.',action:'Edit prices'},
  {key:'booking',label:'Appointments',job:'Publish real times customers can book online.',action:'Add a time'},
  {key:'proof',label:'Proof',job:'Show redacted completed jobs on the public site.',action:'Add a job'},
  {key:'banners',label:'Login notices',job:'Messages clients see when they sign in.',action:'Edit notices'},
] as const
type TabKey=(typeof TABS)[number]['key']

export default function PublicFunnelAdmin(){
  const p=useAppPath()
  const [searchParams,setSearchParams]=useSearchParams()
  const tabFromUrl=searchParams.get('tab')
  const [tab,setTabState]=useState<TabKey|null>(TABS.some(item=>item.key===tabFromUrl)?tabFromUrl as TabKey:null)
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(''),[form,setForm]=useState(blank),[slotForm,setSlotForm]=useState(blankSlot)
  const [advancedRules,setAdvancedRules]=useState<Record<string,boolean>>({})
  function setTab(next:TabKey){
    setTabState(next)
    setSearchParams({tab:next},{replace:true})
  }
  const load=()=>api.get<Data>('/admin/public-funnel').then(setData).catch(e=>setError(e instanceof ApiError?e.message:'Could not load website controls.'))
  useEffect(()=>{void load()},[])
  async function create(e:React.FormEvent){e.preventDefault();setBusy('new');try{await api.post('/admin/public-funnel/case-studies',form);setForm(blank);await load()}catch(x){setError(x instanceof ApiError?x.message:'Could not save the case study.')}finally{setBusy('')}}
  async function toggle(item:CaseStudy){setBusy(item.id);try{await api.patch(`/admin/public-funnel/case-studies/${item.id}`,{...item,published:!item.published});await load()}catch(x){setError(x instanceof ApiError?x.message:'Could not update the case study.')}finally{setBusy('')}}
  async function remove(item:CaseStudy){if(!confirm(`Delete "${item.headline}"?`))return;setBusy(item.id);try{await api.del(`/admin/public-funnel/case-studies/${item.id}`);await load()}catch(x){setError(x instanceof ApiError?x.message:'Could not delete the case study.')}finally{setBusy('')}}
  const changeRule=(key:string,patch:Partial<Rule>)=>setData(d=>d?{...d,quote_rules:d.quote_rules.map(r=>r.key===key?{...r,...patch}:r)}:d)
  async function saveRule(r:Rule){setBusy(r.key);try{await api.patch(`/admin/public-funnel/quote-rules/${r.key}`,{base_price:r.base_price_cents/100,minimum_price:r.minimum_price_cents/100,per_sqft:r.per_sqft_cents/100,range_low_percent:r.range_low_percent,range_high_percent:r.range_high_percent,active:!!r.active});await load()}catch(x){setError(x instanceof ApiError?x.message:'Could not save the quote rule.')}finally{setBusy('')}}
  async function createSlot(e:React.FormEvent){e.preventDefault();setBusy('slot-new');setError('');try{await api.post('/admin/public-funnel/booking-slots',{...slotForm,starts_at:new Date(slotForm.starts_at).toISOString(),ends_at:new Date(slotForm.ends_at).toISOString()});setSlotForm(blankSlot);await load()}catch(x){setError(x instanceof ApiError?x.message:'Could not publish the appointment.')}finally{setBusy('')}}
  async function toggleSlot(slot:Slot){setBusy(slot.id);try{await api.patch(`/admin/public-funnel/booking-slots/${slot.id}`,{capacity:slot.capacity,active:!slot.active,internal_note:slot.internal_note||''});await load()}catch(x){setError(x instanceof ApiError?x.message:'Could not update the appointment.')}finally{setBusy('')}}
  async function removeSlot(slot:Slot){if(!confirm('Delete this unbooked appointment?'))return;setBusy(slot.id);try{await api.del(`/admin/public-funnel/booking-slots/${slot.id}`);await load()}catch(x){setError(x instanceof ApiError?x.message:'Could not delete the appointment.')}finally{setBusy('')}}

  const openRequests=data?data.scope_requests.filter(r=>r.status==='new').length:0
  const activeTab=TABS.find(item=>item.key===tab)

  return <div className="space-y-6">
    <header>
      <p className="text-xs font-bold uppercase tracking-[.14em] text-gold">Public website</p>
      <h1 className="mt-2 text-3xl font-bold text-white">Four things visitors can use</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Pick one job. Change only that. Requests from the site still land in Pipeline.</p>
    </header>

    {error&&<div className="rounded-xl border border-red-400/20 bg-red-400/[.06] p-4 text-sm text-red-200">{error}</div>}

    {data&&<div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[.02] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-300"><strong className="text-gold">{data.scope_requests.length}</strong> recent website requests{openRequests>0&&<span className="text-slate-500"> · {openRequests} waiting</span>}</p>
      <Link to={p('pipelines')} className="text-xs font-bold text-gold hover:underline">Open Pipeline</Link>
    </div>}
    {data&&openRequests>0&&<div className="rounded-xl border border-gold/20 bg-gold/[.05] p-4">
      <p className="text-sm font-semibold text-white">Turn a website request into a quote</p>
      <ul className="mt-3 space-y-2">
        {data.scope_requests.filter(r=>r.status==='new').slice(0,6).map(row=>(
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-slate-300">{row.contact_name} · {row.job_type.replace(/_/g,' ')} · {row.email}</span>
            <Link to={`${p('quotes')}?new=1&scope=${encodeURIComponent(row.id)}`} className="text-xs font-bold text-gold hover:underline">Convert to quote</Link>
          </li>
        ))}
      </ul>
    </div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {TABS.map(item=>{
        const count=item.key==='estimates'?data?.quote_rules.filter(r=>r.active).length:item.key==='booking'?data?.booking_slots.filter(s=>s.active).length:item.key==='proof'?data?.case_studies.filter(c=>c.published).length:null
        return <button key={item.key} type="button" onClick={()=>setTab(item.key)} className={`rounded-xl border p-4 text-left transition ${tab===item.key?'border-gold/40 bg-gold/[.07]':'border-white/10 bg-white/[.02] hover:border-white/20'}`}>
          <p className="text-sm font-bold text-white">{item.label}</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">{item.job}</p>
          <p className="mt-3 text-[11px] font-semibold text-gold">{item.action}{count!=null?` · ${count} live`:''}</p>
        </button>
      })}
    </div>

    {tab&&<div className="flex items-center justify-between gap-3">
      <p className="text-sm font-semibold text-white">{activeTab?.label}</p>
      <button type="button" className="text-xs font-semibold text-slate-500 hover:text-gold" onClick={()=>{setTabState(null);setSearchParams({}, {replace:true})}}>Back to all four</button>
    </div>}

    {tab&&tab!=='banners'&&(!data?<SkeletonTable rows={6} cols={4}/>:<>
      {tab==='estimates'&&<section className="rounded-2xl border border-white/10 bg-white/[.02] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-xl font-bold text-white">Starting prices</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">These are planning ranges, not a committed quote. Save each service after you change it.</p></div>
          <a href="https://pinnaclemanagementventures.com/instant-quote" target="_blank" rel="noreferrer" className="text-xs font-bold text-gold hover:underline">View public tool</a>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{data.quote_rules.map(r=>{
          const advanced=!!advancedRules[r.key]
          return <div key={r.key} className="rounded-xl border border-white/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-bold text-white">{r.label}</h3>
              <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={!!r.active} onChange={e=>changeRule(r.key,{active:e.target.checked?1:0})}/>On</label>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <label className="text-slate-400">Starting at<input className="input mt-1" type="number" step=".01" value={r.base_price_cents/100} onChange={e=>changeRule(r.key,{base_price_cents:Number(e.target.value)*100})}/></label>
              <label className="text-slate-400">Never below<input className="input mt-1" type="number" step=".01" value={r.minimum_price_cents/100} onChange={e=>changeRule(r.key,{minimum_price_cents:Number(e.target.value)*100})}/></label>
            </div>
            <button type="button" className="mt-3 text-[11px] font-semibold text-gold" onClick={()=>setAdvancedRules(s=>({...s,[r.key]:!advanced}))}>{advanced?'Hide extra math':'Show extra math'}</button>
            {advanced&&<div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <label className="text-slate-400">Per sq. ft.<input className="input mt-1" type="number" step=".01" value={r.per_sqft_cents/100} onChange={e=>changeRule(r.key,{per_sqft_cents:Number(e.target.value)*100})}/></label>
              <label className="text-slate-400">Low %<input className="input mt-1" type="number" value={r.range_low_percent} onChange={e=>changeRule(r.key,{range_low_percent:Number(e.target.value)})}/></label>
              <label className="text-slate-400">High %<input className="input mt-1" type="number" value={r.range_high_percent} onChange={e=>changeRule(r.key,{range_high_percent:Number(e.target.value)})}/></label>
            </div>}
            <button onClick={()=>void saveRule(r)} disabled={busy===r.key} className="btn-outline mt-4 w-full">{busy===r.key?'Saving…':'Save'}</button>
          </div>
        })}</div>
      </section>}

      {tab==='booking'&&<section className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <form onSubmit={createSlot} className="rounded-2xl border border-white/10 bg-white/[.02] p-5">
          <h2 className="text-xl font-bold text-white">Add an appointment time</h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">Only add times the team can actually keep. If none are published, the site asks people to call instead.</p>
          <div className="mt-5 grid gap-3">
            <select className="input" value={slotForm.job_type} onChange={e=>setSlotForm({...slotForm,job_type:e.target.value})}><option value="cleaning_turnover">Cleaning / turnover</option><option value="property_inspection">Property verification</option></select>
            <label className="text-xs font-bold text-slate-400">Starts<input required type="datetime-local" className="input mt-1" value={slotForm.starts_at} onChange={e=>setSlotForm({...slotForm,starts_at:e.target.value})}/></label>
            <label className="text-xs font-bold text-slate-400">Ends<input required type="datetime-local" className="input mt-1" value={slotForm.ends_at} onChange={e=>setSlotForm({...slotForm,ends_at:e.target.value})}/></label>
            <label className="text-xs font-bold text-slate-400">How many openings<input required min="1" max="25" type="number" className="input mt-1" value={slotForm.capacity} onChange={e=>setSlotForm({...slotForm,capacity:Number(e.target.value)})}/></label>
            <input className="input" placeholder="Internal note (optional)" value={slotForm.internal_note} onChange={e=>setSlotForm({...slotForm,internal_note:e.target.value})}/>
            <button className="btn-gold" disabled={busy==='slot-new'}>{busy==='slot-new'?'Publishing…':'Publish time'}</button>
          </div>
        </form>
        <div className="rounded-2xl border border-white/10 bg-white/[.02] p-5">
          <h2 className="text-xl font-bold text-white">Published times</h2>
          <div className="mt-5 space-y-3">{data.booking_slots.length?data.booking_slots.map(slot=><article key={slot.id} className="flex flex-col gap-3 rounded-xl border border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${slot.active?'bg-emerald-400/10 text-emerald-300':'bg-white/5 text-slate-500'}`}>{slot.active?'Open':'Paused'}</span><strong className="text-sm text-white">{slot.job_type==='cleaning_turnover'?'Cleaning / turnover':'Property verification'}</strong></div><p className="mt-2 text-sm text-slate-300">{new Date(slot.starts_at).toLocaleString()} to {new Date(slot.ends_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</p><p className="mt-1 text-xs text-slate-500">{slot.booked_count} of {slot.capacity} booked{slot.internal_note?` · ${slot.internal_note}`:''}</p></div><div className="flex gap-2"><button className="btn-outline px-3 py-2 text-xs" disabled={busy===slot.id} onClick={()=>void toggleSlot(slot)}>{slot.active?'Pause':'Reopen'}</button>{slot.booked_count===0&&<button className="rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-200" disabled={busy===slot.id} onClick={()=>void removeSlot(slot)}>Delete</button>}</div></article>):<p className="text-sm leading-6 text-slate-500">No times are published. Quote customers will be asked to call or text.</p>}</div>
        </div>
      </section>}

      {tab==='proof'&&<section className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={create} className="rounded-2xl border border-white/10 bg-white/[.02] p-5">
          <h2 className="text-xl font-bold text-white">Add a completed job</h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">Use real work only. Strip names, addresses, faces, and case numbers from copy and photos.</p>
          <div className="mt-5 grid gap-3">
            <input className="input" placeholder="Headline" value={form.headline} onChange={e=>setForm({...form,headline:e.target.value})} required/>
            <textarea className="input min-h-24" placeholder="One-line outcome" value={form.outcome} onChange={e=>setForm({...form,outcome:e.target.value})} required/>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="input" placeholder="Timeline, e.g. 48 hours" value={form.timeline_label} onChange={e=>setForm({...form,timeline_label:e.target.value})} required/>
              <input className="input" placeholder="Area, without a street address" value={form.redacted_location} onChange={e=>setForm({...form,redacted_location:e.target.value})}/>
              <select className="input" value={form.service_key} onChange={e=>setForm({...form,service_key:e.target.value})}><option value="">All services</option>{serviceChoices.map(item=><option key={item.key} value={item.key}>{item.title}</option>)}</select>
              <select className="input" value={form.guide_slug} onChange={e=>setForm({...form,guide_slug:e.target.value})}><option value="">No project guide</option>{guideChoices.map(value=><option key={value} value={value}>{value.replace(/-/g,' ')}</option>)}</select>
              <select className="input" value={form.audience} onChange={e=>setForm({...form,audience:e.target.value})}><option value="">All client types</option>{audienceChoices.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
              <input className="input" type="number" placeholder="Sort order" value={form.sort_order} onChange={e=>setForm({...form,sort_order:Number(e.target.value)})}/>
            </div>
            <input className="input" type="url" placeholder="HTTPS URL for an approved photo" value={form.image_url} onChange={e=>setForm({...form,image_url:e.target.value})}/>
            <input className="input" placeholder="Photo description" value={form.image_alt} onChange={e=>setForm({...form,image_alt:e.target.value})}/>
            <label className="flex gap-3 text-xs leading-5 text-slate-400"><input type="checkbox" className="accent-gold" checked={form.published} onChange={e=>setForm({...form,published:e.target.checked})}/>Publish now</label>
            <button className="btn-gold" disabled={busy==='new'}>{busy==='new'?'Saving…':'Save job'}</button>
          </div>
        </form>
        <div className="rounded-2xl border border-white/10 bg-white/[.02] p-5">
          <h2 className="text-xl font-bold text-white">Library</h2>
          <div className="mt-5 space-y-3">{data.case_studies.length?data.case_studies.map(item=><article key={item.id} className="rounded-xl border border-white/10 p-4"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${item.published?'bg-emerald-400/10 text-emerald-300':'bg-white/5 text-slate-400'}`}>{item.published?'Published':'Draft'}</span><h3 className="mt-3 font-bold text-white">{item.headline}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{item.outcome}</p><div className="mt-3 flex gap-2"><button onClick={()=>void toggle(item)} disabled={busy===item.id} className="btn-outline px-3 py-2 text-xs">{item.published?'Unpublish':'Publish'}</button><button onClick={()=>void remove(item)} disabled={busy===item.id} className="rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-200">Delete</button></div></article>):<p className="text-sm text-slate-500">Nothing is public yet. The site hides this strip instead of inventing jobs.</p>}</div>
        </div>
      </section>}
    </>)}
    {tab==='banners'&&<ClientBannersAdmin embedded />}
  </div>
}
