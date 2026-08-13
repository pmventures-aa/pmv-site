import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { services } from '../../data/services'
import { useAppPath } from '../../lib/basePath'
import ClientBannersAdmin from './ClientBannersAdmin'

type CaseStudy={id:string;service_key:string|null;guide_slug:string|null;audience:string|null;headline:string;outcome:string;timeline_label:string;redacted_location:string|null;image_url:string|null;image_alt:string|null;published:number;sort_order:number}
type Rule={key:string;label:string;base_price_cents:number;per_sqft_cents:number;minimum_price_cents:number;range_low_percent:number;range_high_percent:number;active:number}
type Scope={id:string;job_type:string;contact_name:string;email:string;status:string;response_due_at:string;estimate_low_cents:number|null;estimate_high_cents:number|null}
type Slot={id:string;job_type:string;starts_at:string;ends_at:string;capacity:number;booked_count:number;active:number;internal_note:string|null}
type Data={case_studies:CaseStudy[];quote_rules:Rule[];scope_requests:Scope[];booking_slots:Slot[]}

const blank={headline:'',outcome:'',timeline_label:'',redacted_location:'',service_key:'',guide_slug:'',audience:'',image_url:'',image_alt:'',published:false,sort_order:0}
const blankSlot={job_type:'cleaning_turnover',starts_at:'',ends_at:'',capacity:1,internal_note:''}
const money=(c:number)=>`$${(c/100).toLocaleString()}`
const serviceChoices=Array.from(new Map(services.map(item=>[item.key,item])).values())
const guideChoices=['property-cleaning-turnover','local-support-south-florida','eviction-turnover-support','switching-pos-payment-providers','moving-data-between-systems','managing-business-transition','ongoing-administrative-support']
const audienceChoices=[['landlord','Landlord'],['agent-broker','Agent / broker'],['investor','Investor'],['business-owner','Business owner'],['operator','Operator'],['attorney','Attorney'],['corporate','Corporate']]

// Each tab owns one public-site system so the page reads as a control room
// instead of a junk drawer: estimate math, bookable capacity, and proof.
const TABS=[
  {key:'estimates',label:'Instant Estimates',blurb:'The pricing math behind the public instant-quote tool'},
  {key:'booking',label:'Online Booking',blurb:'Real appointment capacity customers can self-book'},
  {key:'proof',label:'Verified Proof',blurb:'Redacted completed jobs shown on the public site'},
  {key:'banners',label:'Login Banners',blurb:'Announcements clients see when they sign in to the portal'},
] as const
type TabKey=(typeof TABS)[number]['key']

export default function PublicFunnelAdmin(){
  const p=useAppPath()
  const [searchParams,setSearchParams]=useSearchParams()
  const tabFromUrl=searchParams.get('tab')
  const [tab,setTabState]=useState<TabKey>(TABS.some(item=>item.key===tabFromUrl)?tabFromUrl as TabKey:'estimates')
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(''),[form,setForm]=useState(blank),[slotForm,setSlotForm]=useState(blankSlot)
  function setTab(next:TabKey){
    setTabState(next)
    setSearchParams(next==='estimates'?{}:{tab:next},{replace:true})
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

  return <div className="space-y-6">
    <header>
      <p className="text-xs font-bold uppercase tracking-[.14em] text-gold">Public experience</p>
      <h1 className="mt-2 text-3xl font-bold text-white">Website Studio</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">The controls behind the public site: the instant-estimate math, the appointment capacity customers can book online, and the verified proof the marketing pages show. Requests submitted through the site land in the pipeline automatically.</p>
    </header>

    {error&&<div className="rounded-xl border border-red-400/20 bg-red-400/[.06] p-4 text-sm text-red-200">{error}</div>}

    {data&&<div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[.02] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-300"><strong className="text-gold">{data.scope_requests.length}</strong> recent scope requests from the site{openRequests>0&&<span className="text-slate-500"> · {openRequests} awaiting a reply</span>}</p>
      <Link to={p('pipelines')} className="text-xs font-bold text-gold hover:underline">Work them in the Pipeline</Link>
    </div>}

    <div className="overflow-hidden rounded-xl border border-white/[.08] bg-white/[.018]">
      <div className="flex gap-1 overflow-x-auto px-2 pt-2">
        {TABS.map(item=><button key={item.key} onClick={()=>setTab(item.key)} className={`shrink-0 rounded-t-lg border-b-2 px-3.5 py-2.5 text-sm font-bold transition ${tab===item.key?'border-gold bg-gold/[.06] text-white':'border-transparent text-slate-500 hover:bg-white/[.025] hover:text-slate-200'}`}>{item.label}</button>)}
      </div>
      <p className="border-t border-white/[.08] px-4 py-2.5 text-xs text-slate-500">{TABS.find(item=>item.key===tab)?.blurb}</p>
    </div>

    {tab!=='banners'&&(!data?<p className="text-sm text-slate-400">Loading…</p>:<>
      {tab==='estimates'&&<section className="rounded-2xl border border-white/10 bg-white/[.02] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-xl font-bold text-white">Instant estimate rules</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">These numbers drive the public instant-quote tool. They are planning ranges only, never a committed price. Update them when labor, supply, travel, or market costs change.</p></div>
          <a href="https://pinnaclemanagementventures.com/instant-quote" target="_blank" rel="noreferrer" className="text-xs font-bold text-gold hover:underline">View the public tool ↗</a>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">{data.quote_rules.map(r=><div key={r.key} className="rounded-xl border border-white/10 p-4"><h3 className="font-bold text-white">{r.label}</h3><div className="mt-4 grid grid-cols-2 gap-3 text-xs">{[['Base','base_price_cents'],['Minimum','minimum_price_cents'],['Per sq. ft.','per_sqft_cents']].map(([label,key])=><label key={key} className="text-slate-400">{label}<input className="input mt-1" type="number" step=".01" value={(r[key as keyof Rule] as number)/100} onChange={e=>changeRule(r.key,{[key]:Number(e.target.value)*100})}/></label>)}<label className="text-slate-400">Low %<input className="input mt-1" type="number" value={r.range_low_percent} onChange={e=>changeRule(r.key,{range_low_percent:Number(e.target.value)})}/></label><label className="text-slate-400">High %<input className="input mt-1" type="number" value={r.range_high_percent} onChange={e=>changeRule(r.key,{range_high_percent:Number(e.target.value)})}/></label><label className="flex items-center gap-2 pt-6 text-slate-400"><input type="checkbox" checked={!!r.active} onChange={e=>changeRule(r.key,{active:e.target.checked?1:0})}/>Active</label></div><button onClick={()=>void saveRule(r)} disabled={busy===r.key} className="btn-outline mt-4 w-full">{busy===r.key?'Saving…':'Save Rule'}</button></div>)}</div>
      </section>}

      {tab==='booking'&&<section className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <form onSubmit={createSlot} className="rounded-2xl border border-white/10 bg-white/[.02] p-5"><h2 className="text-xl font-bold text-white">Publish real appointment capacity</h2><p className="mt-2 text-xs leading-5 text-slate-500">Only publish times the field team can honor. Customers with an eligible estimate can confirm an opening immediately; if nothing is published they are asked to call or text instead of receiving a false booking confirmation.</p><div className="mt-5 grid gap-3"><select className="input" value={slotForm.job_type} onChange={e=>setSlotForm({...slotForm,job_type:e.target.value})}><option value="cleaning_turnover">Cleaning / turnover</option><option value="property_inspection">Property verification</option></select><label className="text-xs font-bold text-slate-400">Starts<input required type="datetime-local" className="input mt-1" value={slotForm.starts_at} onChange={e=>setSlotForm({...slotForm,starts_at:e.target.value})}/></label><label className="text-xs font-bold text-slate-400">Ends<input required type="datetime-local" className="input mt-1" value={slotForm.ends_at} onChange={e=>setSlotForm({...slotForm,ends_at:e.target.value})}/></label><label className="text-xs font-bold text-slate-400">Capacity<input required min="1" max="25" type="number" className="input mt-1" value={slotForm.capacity} onChange={e=>setSlotForm({...slotForm,capacity:Number(e.target.value)})}/></label><input className="input" placeholder="Internal note (optional)" value={slotForm.internal_note} onChange={e=>setSlotForm({...slotForm,internal_note:e.target.value})}/><button className="btn-gold" disabled={busy==='slot-new'}>{busy==='slot-new'?'Publishing…':'Publish Appointment'}</button></div></form>
        <div className="rounded-2xl border border-white/10 bg-white/[.02] p-5"><h2 className="text-xl font-bold text-white">Published appointment slots</h2><div className="mt-5 space-y-3">{data.booking_slots.length?data.booking_slots.map(slot=><article key={slot.id} className="flex flex-col gap-3 rounded-xl border border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${slot.active?'bg-emerald-400/10 text-emerald-300':'bg-white/5 text-slate-500'}`}>{slot.active?'Open':'Paused'}</span><strong className="text-sm text-white">{slot.job_type==='cleaning_turnover'?'Cleaning / turnover':'Property verification'}</strong></div><p className="mt-2 text-sm text-slate-300">{new Date(slot.starts_at).toLocaleString()} to {new Date(slot.ends_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</p><p className="mt-1 text-xs text-slate-500">{slot.booked_count} confirmed of {slot.capacity}{slot.internal_note?` · ${slot.internal_note}`:''}</p></div><div className="flex gap-2"><button className="btn-outline px-3 py-2 text-xs" disabled={busy===slot.id} onClick={()=>void toggleSlot(slot)}>{slot.active?'Pause':'Reopen'}</button>{slot.booked_count===0&&<button className="rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-200" disabled={busy===slot.id} onClick={()=>void removeSlot(slot)}>Delete</button>}</div></article>):<p className="text-sm leading-6 text-slate-500">No online appointments are published. Quote customers will be directed to call or text for scheduling rather than receiving a false booking confirmation.</p>}</div></div>
      </section>}

      {tab==='proof'&&<section className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={create} className="rounded-2xl border border-white/10 bg-white/[.02] p-5"><h2 className="text-xl font-bold text-white">Add a verified job</h2><p className="mt-2 text-xs leading-5 text-slate-500">Use real completed work only. Remove addresses, names, case numbers, faces, plates, and identifiers from copy and photos.</p><div className="mt-5 grid gap-3"><input className="input" placeholder="Headline" value={form.headline} onChange={e=>setForm({...form,headline:e.target.value})} required/><textarea className="input min-h-24" placeholder="One-line outcome" value={form.outcome} onChange={e=>setForm({...form,outcome:e.target.value})} required/><div className="grid gap-3 sm:grid-cols-2"><input className="input" placeholder="Timeline, e.g. 48 hours" value={form.timeline_label} onChange={e=>setForm({...form,timeline_label:e.target.value})} required/><input className="input" placeholder="Redacted location" value={form.redacted_location} onChange={e=>setForm({...form,redacted_location:e.target.value})}/><select className="input" value={form.service_key} onChange={e=>setForm({...form,service_key:e.target.value})}><option value="">All services</option>{serviceChoices.map(item=><option key={item.key} value={item.key}>{item.title}</option>)}</select><select className="input" value={form.guide_slug} onChange={e=>setForm({...form,guide_slug:e.target.value})}><option value="">No project guide</option>{guideChoices.map(value=><option key={value} value={value}>{value.replace(/-/g,' ')}</option>)}</select><select className="input" value={form.audience} onChange={e=>setForm({...form,audience:e.target.value})}><option value="">All client types</option>{audienceChoices.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><input className="input" type="number" placeholder="Sort order" value={form.sort_order} onChange={e=>setForm({...form,sort_order:Number(e.target.value)})}/></div><input className="input" type="url" placeholder="HTTPS URL for approved redacted photo" value={form.image_url} onChange={e=>setForm({...form,image_url:e.target.value})}/><input className="input" placeholder="Photo description" value={form.image_alt} onChange={e=>setForm({...form,image_alt:e.target.value})}/><label className="flex gap-3 text-xs leading-5 text-slate-400"><input type="checkbox" className="accent-gold" checked={form.published} onChange={e=>setForm({...form,published:e.target.checked})}/>Publish now; the work and public-use approval are verified.</label><button className="btn-gold" disabled={busy==='new'}>{busy==='new'?'Saving…':'Save Verified Job'}</button></div></form>
        <div className="rounded-2xl border border-white/10 bg-white/[.02] p-5"><h2 className="text-xl font-bold text-white">Case-study library</h2><div className="mt-5 space-y-3">{data.case_studies.length?data.case_studies.map(item=><article key={item.id} className="rounded-xl border border-white/10 p-4"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${item.published?'bg-emerald-400/10 text-emerald-300':'bg-white/5 text-slate-400'}`}>{item.published?'Published':'Draft'}</span><h3 className="mt-3 font-bold text-white">{item.headline}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{item.outcome}</p><div className="mt-3 flex gap-2"><button onClick={()=>void toggle(item)} disabled={busy===item.id} className="btn-outline px-3 py-2 text-xs">{item.published?'Unpublish':'Publish'}</button><button onClick={()=>void remove(item)} disabled={busy===item.id} className="rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-200">Delete</button></div></article>):<p className="text-sm text-slate-500">No proof is public yet. The site intentionally hides this strip instead of inventing jobs or testimonials.</p>}</div></div>
      </section>}
    </>)}
    {tab==='banners'&&<ClientBannersAdmin embedded />}
  </div>
}
