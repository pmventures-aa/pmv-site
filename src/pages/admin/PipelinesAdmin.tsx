import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, Tag, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { LeadConversionDialog } from '../../components/admin/LeadConversionDialog'
import { toast } from '../../components/kit/toast'
import { KanbanBoard, StageSelect, type KanbanColumn } from '../../components/admin/Kanban'
import { lifecycleLabel } from '../../../shared/lifecycle'
import { useAppPath } from '../../lib/basePath'
import { useLiveRefresh } from '../../lib/liveRefresh'

interface LeadRecord { id:string; name:string; email:string; phone:string|null; company_name:string|null; record_type:'person'|'business'; lifecycle_stage:string; source:string|null; service_name:string|null; owner_name:string|null; owner_email:string|null; message:string; status:string; created_at:string; updated_at:string|null }
interface PipelineItem { id:string; client_user_id:string; client_name:string|null; client_email:string; status:string; created_at:string; submitted_at?:string|null; title?:string; type?:string; service_key?:string; service_name?:string; assigned_rep_name?:string|null; assigned_rep_email?:string|null; is_unassigned?:number; may_require_attorney_coordination?:number; amount_requested_cents?:number|null; use_of_funds?:string|null }
interface QuoteItem { id:string; quote_number:string; status:string; title:string; recipient_name:string; recipient_email:string; recipient_company:string|null; total_cents:number; valid_until:string|null; sent_at:string|null; created_at:string }

const LEAD_COLUMNS:KanbanColumn[]=[{key:'new',label:'New'},{key:'contacted',label:'Contacted'},{key:'qualified',label:'Qualified'},{key:'lost',label:'Lost'}]
const QUOTE_COLUMNS:KanbanColumn[]=[{key:'draft',label:'Draft'},{key:'sent',label:'Sent'},{key:'viewed',label:'Viewed'},{key:'accepted',label:'Accepted'},{key:'declined',label:'Declined'}]

// The pipeline follows the client journey instead of raw database tables:
// win the work (leads, quotes), deliver it (onboarding, projects, tasks),
// then the capital work that often follows.
const MODULE_TABS=[
  {key:'inquiries',label:'Leads',group:'Win the work',hint:'New and working prospects'},
  {key:'quotes',label:'Quotes',group:'Win the work',hint:'Branded quotes awaiting a decision'},
  {key:'service_applications',label:'Onboarding',group:'Deliver the work',hint:'Service enrollment moving to active'},
  {key:'matters',label:'Projects',group:'Deliver the work',hint:'Multi-step engagements in flight'},
  {key:'tasks',label:'Tasks',group:'Deliver the work',hint:'Discrete work items'},
  {key:'funding',label:'Funding',group:'Capital',hint:'Third-party funding applications'},
] as const
type ModuleKey=(typeof MODULE_TABS)[number]['key']
const PATCH_PATH:Record<'matters'|'tasks'|'funding',string>={matters:'/portal/matters',tasks:'/portal/tasks',funding:'/portal/funding'}

interface JourneyCounts { leads:number; quotes:number; onboarding:number; delivery:number; funding:number }
const JOURNEY_STAGES:{key:keyof JourneyCounts;label:string;module:ModuleKey;caption:string}[]=[
  {key:'leads',label:'Leads',module:'inquiries',caption:'in play'},
  {key:'quotes',label:'Quotes',module:'quotes',caption:'awaiting decision'},
  {key:'onboarding',label:'Onboarding',module:'service_applications',caption:'enrolling'},
  {key:'delivery',label:'Delivery',module:'matters',caption:'projects + tasks open'},
  {key:'funding',label:'Funding',module:'funding',caption:'applications live'},
]

function money(cents?:number|null){return typeof cents==='number'?`$${(cents/100).toLocaleString()}`:'Not provided'}
function lifecycleTone(stage:string):'gold'|'green'|'blue'|'slate'|'red'{if(stage==='opportunity')return'gold';if(stage==='prospect')return'blue';if(stage==='lost')return'red';if(stage==='converted')return'green';return'slate'}
function ageDays(value:string|null|undefined){if(!value)return 0;const parsed=Date.parse(value.includes('T')?value:value.replace(' ','T')+'Z');return Number.isFinite(parsed)?Math.max(0,Math.floor((Date.now()-parsed)/86400000)):0}
function ageLabel(value:string|null|undefined){const days=ageDays(value);if(days===0)return'Today';if(days===1)return'1 day';return`${days} days`}

export default function PipelinesAdmin(){
  const p=useAppPath()
  const[tab,setTab]=useState<ModuleKey>('inquiries')
  const[leads,setLeads]=useState<LeadRecord[]>([])
  const[items,setItems]=useState<PipelineItem[]>([])
  const[quotes,setQuotes]=useState<QuoteItem[]>([])
  const[columns,setColumns]=useState<KanbanColumn[]>([])
  const[counts,setCounts]=useState<JourneyCounts|null>(null)
  const[loading,setLoading]=useState(true)
  const[recordType,setRecordType]=useState('')
  const[lifecycle,setLifecycle]=useState('')
  const[query,setQuery]=useState('')
  const[ownerFilter,setOwnerFilter]=useState('')
  const[sourceFilter,setSourceFilter]=useState('')
  const[hideLost,setHideLost]=useState(true)
  const[compact,setCompact]=useState(()=>typeof window!=='undefined'&&window.localStorage.getItem('pmv_pipeline_compact')==='1')
  const[conversionTarget,setConversionTarget]=useState<LeadRecord|null>(null)
  const[draft,setDraft]=useState({name:'',email:'',source:''})
  const[creating,setCreating]=useState(false)
  const movingRef=useRef(new Set<string>())

  const loadCounts=useCallback(async()=>{
    const results=await Promise.allSettled([
      api.get<{records:LeadRecord[]}>('/admin/crm/records'),
      api.get<{quotes:QuoteItem[]}>('/admin/quotes'),
      api.get<{items:PipelineItem[]}>('/admin/pipeline/service_applications'),
      api.get<{items:PipelineItem[]}>('/admin/pipeline/matters'),
      api.get<{items:PipelineItem[]}>('/admin/pipeline/tasks'),
      api.get<{items:PipelineItem[]}>('/admin/pipeline/funding'),
    ])
    const [crm,quoteRes,apps,matters,tasks,funding]=results
    setCounts({
      leads:crm.status==='fulfilled'?crm.value.records.filter(r=>r.status!=='lost').length:0,
      quotes:quoteRes.status==='fulfilled'?quoteRes.value.quotes.filter(q=>['draft','sent','viewed'].includes(q.status)).length:0,
      onboarding:apps.status==='fulfilled'?apps.value.items.filter(i=>!['completed','declined'].includes(i.status)).length:0,
      delivery:(matters.status==='fulfilled'?matters.value.items.filter(i=>i.status!=='closed').length:0)+(tasks.status==='fulfilled'?tasks.value.items.filter(i=>i.status!=='done').length:0),
      funding:funding.status==='fulfilled'?funding.value.items.filter(i=>!['approved','declined'].includes(i.status)).length:0,
    })
  },[])

  const load=useCallback(async(which:ModuleKey,silent=false)=>{
    if(!silent)setLoading(true)
    try{
      if(which==='inquiries'){
        const params=new URLSearchParams()
        if(recordType)params.set('record_type',recordType)
        if(lifecycle)params.set('lifecycle_stage',lifecycle)
        const res=await api.get<{records:LeadRecord[]}>(`/admin/crm/records?${params.toString()}`)
        setLeads(res.records)
        setColumns(LEAD_COLUMNS)
      }else if(which==='quotes'){
        const res=await api.get<{quotes:QuoteItem[]}>('/admin/quotes')
        setQuotes(res.quotes.filter(q=>!['expired','void'].includes(q.status)))
        setColumns(QUOTE_COLUMNS)
      }else{
        const res=await api.get<{statuses:string[];items:PipelineItem[]}>(`/admin/pipeline/${which}`)
        setItems(res.items)
        setColumns(res.statuses.map(status=>({key:status,label:status.replace(/_/g,' ')})))
      }
    }catch(err){if(!silent)toast.error(err instanceof ApiError?err.message:'Could not load pipeline.')}
    finally{if(!silent)setLoading(false)}
  },[recordType,lifecycle])

  useEffect(()=>{void load(tab)},[tab,load])
  useEffect(()=>{void loadCounts()},[loadCounts])
  const refreshCurrent=useCallback(()=>{void loadCounts();return load(tab,true)},[load,loadCounts,tab])
  useLiveRefresh(refreshCurrent)

  async function moveLead(item:LeadRecord,status:string){
    if(item.status===status||movingRef.current.has(item.id))return
    movingRef.current.add(item.id)
    const previous=item.status
    setLeads(cur=>cur.map(lead=>lead.id===item.id?{...lead,status,updated_at:new Date().toISOString()}:lead))
    try{await api.patch(`/admin/crm/records/${item.id}`,{status});toast.success(`Moved ${item.name} to ${status}.`)}
    catch{setLeads(cur=>cur.map(lead=>lead.id===item.id?{...lead,status:previous}:lead));toast.error('Could not update pipeline stage.')}
    finally{movingRef.current.delete(item.id)}
  }

  async function moveQuote(item:QuoteItem,status:string){
    if(item.status===status||movingRef.current.has(item.id))return
    // Draft quotes are sent from the Quotes workspace (that flow emails the
    // recipient); the board only records final decisions made offline.
    if(!['accepted','declined'].includes(status)){toast.error('Quotes move forward from the Quotes workspace. The board records accepted or declined decisions.');return}
    if(['accepted','declined'].includes(item.status)){toast.error(`Quote ${item.quote_number} is already ${item.status}.`);return}
    movingRef.current.add(item.id)
    const previous=item.status
    setQuotes(cur=>cur.map(q=>q.id===item.id?{...q,status}:q))
    try{await api.patch(`/admin/quotes/${item.id}/status`,{status});toast.success(`Quote ${item.quote_number} marked ${status}.`);void loadCounts()}
    catch(err){setQuotes(cur=>cur.map(q=>q.id===item.id?{...q,status:previous}:q));toast.error(err instanceof ApiError?err.message:'Could not update the quote.')}
    finally{movingRef.current.delete(item.id)}
  }

  async function moveItem(item:PipelineItem,status:string){
    if(item.status===status||movingRef.current.has(item.id))return
    movingRef.current.add(item.id)
    const previous=item.status
    setItems(cur=>cur.map(i=>i.id===item.id?{...i,status}:i))
    try{
      if(tab==='service_applications')await api.patch(`/portal/service-applications/${item.id}/status`,{status})
      else await api.patch(`${PATCH_PATH[tab as keyof typeof PATCH_PATH]}/${item.id}`,{status})
    }catch(err){setItems(cur=>cur.map(i=>i.id===item.id?{...i,status:previous}:i));toast.error(err instanceof ApiError?err.message:'Could not update status.')}
    finally{movingRef.current.delete(item.id)}
  }

  const ownerOptions=useMemo(()=>Array.from(new Set(leads.map(l=>l.owner_name||l.owner_email).filter(Boolean) as string[])).sort(),[leads])
  const sourceOptions=useMemo(()=>Array.from(new Set(leads.map(l=>l.source).filter(Boolean) as string[])).sort(),[leads])
  const filteredLeads=useMemo(()=>{
    const needle=query.trim().toLowerCase()
    return leads.filter(lead=>{
      if(hideLost&&lead.status==='lost')return false
      if(ownerFilter&&(lead.owner_name||lead.owner_email)!==ownerFilter)return false
      if(sourceFilter&&lead.source!==sourceFilter)return false
      if(!needle)return true
      return [lead.name,lead.email,lead.company_name,lead.service_name,lead.source,lead.owner_name,lead.owner_email,lead.message].some(v=>String(v||'').toLowerCase().includes(needle))
    })
  },[leads,query,ownerFilter,sourceFilter,hideLost])
  const filteredQuotes=useMemo(()=>{
    const needle=query.trim().toLowerCase()
    if(!needle)return quotes
    return quotes.filter(q=>[q.quote_number,q.title,q.recipient_name,q.recipient_email,q.recipient_company].some(v=>String(v||'').toLowerCase().includes(needle)))
  },[quotes,query])
  const visibleItems=useMemo(()=>{
    const needle=query.trim().toLowerCase()
    if(!needle)return items
    return items.filter(item=>[item.client_name,item.client_email,item.title,item.type,item.service_name,item.service_key,item.assigned_rep_name,item.assigned_rep_email,item.use_of_funds].some(v=>String(v||'').toLowerCase().includes(needle)))
  },[items,query])
  const pipelineColumns=useMemo(()=>hideLost&&tab==='inquiries'?columns.filter(c=>c.key!=='lost'):columns,[columns,hideLost,tab])
  const activeTab=MODULE_TABS.find(t=>t.key===tab)
  const groups=useMemo(()=>{
    const out:{group:string;tabs:(typeof MODULE_TABS)[number][]}[]=[]
    for(const item of MODULE_TABS){
      const last=out[out.length-1]
      if(last&&last.group===item.group)last.tabs.push(item)
      else out.push({group:item.group,tabs:[item]})
    }
    return out
  },[])

  function clearFilters(){setQuery('');setRecordType('');setLifecycle('');setOwnerFilter('');setSourceFilter('');setHideLost(true)}
  function toggleDensity(){setCompact(value=>{const next=!value;window.localStorage.setItem('pmv_pipeline_compact',next?'1':'0');return next})}

  async function createLead(){
    const name=draft.name.trim()
    const email=draft.email.trim().toLowerCase()
    if(!name||!email){toast.error('Enter a name and email.');return}
    setCreating(true)
    try{
      await api.post('/admin/crm/records',{name,email,source:draft.source.trim()||'Pipeline',record_type:'person',lifecycle_stage:'lead',status:'new'})
      toast.success(`${name} is on the board.`)
      setDraft({name:'',email:'',source:''})
      await Promise.all([load('inquiries',true),loadCounts()])
    }catch(err){
      toast.error(err instanceof ApiError?err.message:'Could not create the lead.')
    }finally{setCreating(false)}
  }

  return <div className={compact?'[&_.pmv-kanban-card]:text-xs':''}>
    <PageIntro kicker="Revenue & Delivery" title="Pipeline" subtitle="One board for the client journey: win the work, deliver it, and track capital work. Add a lead here, then open the CRM for lists and imports." action={<div className="flex flex-wrap items-center gap-2">{tab==='quotes'?<Link to={p('quotes')} className={btnOutline}>Open Quotes</Link>:tab==='inquiries'?<Link to={p('inquiries')} className={btnOutline}>CRM records</Link>:null}</div>}/>

    <div className="mb-5 overflow-hidden rounded-xl border border-white/[.08] bg-white/[.018]">
      <div className="grid grid-cols-2 divide-x divide-white/[.06] sm:grid-cols-5">
        {JOURNEY_STAGES.map((stage,index)=>{
          const active=activeTab&&(stage.module===tab||(stage.key==='delivery'&&(tab==='matters'||tab==='tasks')))
          return <button key={stage.key} type="button" onClick={()=>{setTab(stage.module);setQuery('')}} className={`relative px-4 py-3.5 text-left transition ${active?'bg-gold/[.06]':'hover:bg-white/[.02]'}`}>
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">{index>0&&<span className="text-gold/40" aria-hidden="true">›</span>}{stage.label}</span>
            <span className={`mt-1 block font-display text-2xl font-bold ${active?'text-gold':'text-white'}`}>{counts?counts[stage.key]:'–'}</span>
            <span className="block text-[10px] text-slate-500">{stage.caption}</span>
          </button>
        })}
      </div>
    </div>

    <div className="mb-5 overflow-hidden rounded-xl border border-white/[.08] bg-white/[.018]">
      <div className="flex gap-4 overflow-x-auto border-b border-white/[.08] px-3 pt-2">
        {groups.map(section=><div key={section.group} className="flex shrink-0 items-end gap-1">
          <span className="pb-2.5 pr-1 text-[9px] font-bold uppercase tracking-[.14em] text-slate-600">{section.group}</span>
          {section.tabs.map(item=><button key={item.key} onClick={()=>{setTab(item.key);setQuery('')}} title={item.hint} className={`shrink-0 rounded-t-lg border-b-2 px-3.5 py-2.5 text-sm font-bold transition ${tab===item.key?'border-gold bg-gold/[.06] text-white':'border-transparent text-slate-500 hover:bg-white/[.025] hover:text-slate-200'}`}>{item.label}</button>)}
        </div>)}
      </div>
      <div className="grid gap-3 p-3 md:grid-cols-[minmax(220px,1fr)_auto] md:items-center">
        <input className={inputCls} placeholder={`Search ${activeTab?.label.toLowerCase()||'this pipeline'}`} value={query} onChange={e=>setQuery(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          {tab==='inquiries'&&<><select className={`${inputCls} !min-h-10 w-auto min-w-[150px]`} value={recordType} onChange={e=>setRecordType(e.target.value)}><option value="">All record types</option><option value="person">People</option><option value="business">Businesses</option></select><select className={`${inputCls} !min-h-10 w-auto min-w-[150px]`} value={lifecycle} onChange={e=>setLifecycle(e.target.value)}><option value="">All lifecycle stages</option><option value="lead">Lead</option><option value="prospect">Prospect</option><option value="opportunity">Application</option><option value="lost">Lost</option></select><select className={`${inputCls} !min-h-10 w-auto min-w-[150px]`} value={ownerFilter} onChange={e=>setOwnerFilter(e.target.value)}><option value="">All owners</option>{ownerOptions.map(v=><option key={v} value={v}>{v}</option>)}</select><select className={`${inputCls} !min-h-10 w-auto min-w-[150px]`} value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}><option value="">All sources</option>{sourceOptions.map(v=><option key={v} value={v}>{v}</option>)}</select><button type="button" onClick={()=>setHideLost(v=>!v)} className={`rounded-xl border px-3 py-2 text-xs font-bold ${hideLost?'border-gold/30 bg-gold/[.07] text-gold':'border-white/10 text-slate-400'}`}>{hideLost?'Lost Hidden':'Lost Visible'}</button></>}
          <button type="button" onClick={toggleDensity} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:border-gold/30 hover:text-gold">{compact?'Comfortable View':'Compact View'}</button>
          {(query||recordType||lifecycle||ownerFilter||sourceFilter||!hideLost)&&<button type="button" onClick={clearFilters} className="px-2 py-2 text-xs font-bold text-slate-500 hover:text-white">Clear</button>}
        </div>
      </div>
    </div>

    {tab==='inquiries'&&<form className="mb-4 grid gap-2 rounded-lg border border-white/[.08] bg-white/[.018] p-3 sm:grid-cols-[1fr_1fr_160px_auto]" onSubmit={e=>{e.preventDefault();void createLead()}}>
      <input className={inputCls} placeholder="Name" value={draft.name} onChange={e=>setDraft(current=>({...current,name:e.target.value}))} />
      <input className={inputCls} type="email" placeholder="Email" value={draft.email} onChange={e=>setDraft(current=>({...current,email:e.target.value}))} />
      <input className={inputCls} placeholder="Source" value={draft.source} onChange={e=>setDraft(current=>({...current,source:e.target.value}))} />
      <button type="submit" disabled={creating} className={btnPrimary}>{creating?'Adding…':'Add lead'}</button>
    </form>}

    {loading?<Panel><p className="text-sm text-slate-400">Loading pipeline data...</p></Panel>
    :tab==='inquiries'?(filteredLeads.length===0?<Panel><p className="text-sm font-semibold text-white">No records match this view.</p><p className="mt-1 text-xs text-slate-500">Add a lead above, or clear filters to broaden the view.</p></Panel>:<KanbanBoard columns={pipelineColumns} items={filteredLeads} getStatus={lead=>lead.status} onMove={moveLead} renderCard={lead=><div className="pmv-kanban-card"><div className="flex items-start justify-between gap-2"><Link to={p(`leads/${lead.id}`)} className="font-bold text-white hover:text-gold">{lead.name}</Link><Tag tone={lifecycleTone(lead.lifecycle_stage)}>{lifecycleLabel(lead.lifecycle_stage)}</Tag></div><p className="mt-1 text-xs text-slate-400">{lead.record_type==='business'?'Business':lead.company_name||'Person'} · {lead.email}</p><div className="mt-2 flex flex-wrap gap-1.5"><Tag tone={ageDays(lead.updated_at||lead.created_at)>=7?'red':'slate'}>{ageLabel(lead.updated_at||lead.created_at)} in pipeline</Tag>{lead.source&&<Tag tone="slate">{lead.source}</Tag>}</div><div className="mt-2 space-y-1 text-[11px] text-slate-500">{lead.service_name&&<p>Service: <span className="text-slate-300">{lead.service_name}</span></p>}{(lead.owner_name||lead.owner_email)&&<p>Owner: <span className="text-slate-300">{lead.owner_name||lead.owner_email}</span></p>}</div>{lead.message&&<p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{lead.message}</p>}<div className="mt-3 flex items-center justify-between gap-2"><Link to={p(`leads/${lead.id}`)} className="text-xs font-bold text-gold hover:underline">Open Profile</Link>{lead.status==='qualified'&&<button onClick={()=>setConversionTarget(lead)} className="text-xs font-bold text-emerald-300 hover:underline">Review Conversion</button>}</div><StageSelect value={lead.status} columns={LEAD_COLUMNS} onChange={status=>moveLead(lead,status)}/></div>}/>)
    :tab==='quotes'?(filteredQuotes.length===0?<Panel><p className="text-sm font-semibold text-white">No live quotes.</p><p className="mt-1 text-xs text-slate-500">Build a branded quote in the Quotes workspace and it will appear here as it moves toward a decision.</p><Link to={p('quotes')} className="mt-3 inline-block text-xs font-bold text-gold hover:underline">Open Quotes Workspace</Link></Panel>:<KanbanBoard columns={QUOTE_COLUMNS} items={filteredQuotes} getStatus={q=>q.status} onMove={moveQuote} renderCard={q=><div className="pmv-kanban-card"><div className="flex items-start justify-between gap-2"><span className="font-bold text-white">{q.recipient_company||q.recipient_name}</span><Tag tone={q.status==='accepted'?'green':q.status==='declined'?'red':q.status==='viewed'?'gold':q.status==='sent'?'blue':'slate'}>{q.status}</Tag></div><p className="mt-1 text-xs text-slate-400">{q.quote_number} · {q.title}</p><p className="mt-2 font-display text-lg font-bold text-gold">{money(q.total_cents)}</p><div className="mt-2 flex flex-wrap gap-1.5"><Tag tone={ageDays(q.sent_at||q.created_at)>=7&&!['accepted','declined'].includes(q.status)?'red':'slate'}>{ageLabel(q.sent_at||q.created_at)}{q.sent_at?' since sent':' old'}</Tag>{q.valid_until&&<Tag tone="slate">Valid to {new Date(q.valid_until).toLocaleDateString()}</Tag>}</div><div className="mt-3"><Link to={p('quotes')} className="text-xs font-bold text-gold hover:underline">Open in Quotes</Link></div><StageSelect value={q.status} columns={QUOTE_COLUMNS} onChange={status=>moveQuote(q,status)}/></div>}/>)
    :visibleItems.length===0?<Panel><p className="text-sm font-semibold text-white">No work matches this view.</p><p className="mt-1 text-xs text-slate-500">Try a different search or pipeline section.</p></Panel>:<KanbanBoard columns={columns} items={visibleItems} getStatus={i=>i.status} onMove={moveItem} renderCard={i=><div className="pmv-kanban-card"><div className="flex items-start justify-between gap-2"><Link to={p(`clients/${i.client_user_id}`)} className="font-bold text-white hover:text-gold">{i.client_name||i.client_email}</Link><Tag tone={ageDays(i.submitted_at||i.created_at)>=7?'red':'slate'}>{ageLabel(i.submitted_at||i.created_at)}</Tag></div><p className="mt-1 text-xs text-slate-400">{tab==='service_applications'&&(i.service_name??i.service_key)}{tab==='matters'&&(i.title??i.type??'Project')}{tab==='tasks'&&(i.title??'Task')}{tab==='funding'&&`${money(i.amount_requested_cents)} requested`}</p>{tab==='service_applications'&&<div className="mt-2 flex flex-wrap gap-1.5">{i.is_unassigned?<Tag tone="red">Unassigned</Tag>:<Tag tone="slate">{i.assigned_rep_name||i.assigned_rep_email||'Assigned Team'}</Tag>}{!!i.may_require_attorney_coordination&&<Tag tone="gold">Attorney Coordination Review</Tag>}</div>}{tab==='funding'&&i.use_of_funds&&<p className="mt-2 line-clamp-2 text-xs text-slate-500">{i.use_of_funds}</p>}<StageSelect value={i.status} columns={columns} onChange={status=>moveItem(i,status)}/></div>}/>}

    {conversionTarget&&<LeadConversionDialog leadId={conversionTarget.id} leadName={conversionTarget.name} onClose={()=>setConversionTarget(null)} onConverted={clientUserId=>{toast.success(`${conversionTarget.name} is now a client.`);setLeads(cur=>cur.filter(lead=>lead.id!==conversionTarget.id));setConversionTarget(null);window.location.href=p(`clients/${clientUserId}`)}}/>}
  </div>
}
