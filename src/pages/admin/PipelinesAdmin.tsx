import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, Tag, StatCard, inputCls } from '../../components/admin/ui'
import { LeadConversionDialog } from '../../components/admin/LeadConversionDialog'
import { toast } from '../../components/kit/toast'
import { KanbanBoard, StageSelect, type KanbanColumn } from '../../components/admin/Kanban'
import { useAppPath } from '../../lib/basePath'
import { useLiveRefresh } from '../../lib/liveRefresh'

interface LeadRecord { id:string; name:string; email:string; phone:string|null; company_name:string|null; record_type:'person'|'business'; lifecycle_stage:string; source:string|null; service_name:string|null; owner_name:string|null; owner_email:string|null; message:string; status:string; created_at:string; updated_at:string|null }
interface PipelineItem { id:string; client_user_id:string; client_name:string|null; client_email:string; status:string; created_at:string; submitted_at?:string|null; title?:string; type?:string; service_key?:string; service_name?:string; assigned_rep_name?:string|null; assigned_rep_email?:string|null; is_unassigned?:number; may_require_attorney_coordination?:number; amount_requested_cents?:number|null; use_of_funds?:string|null }
const LEAD_COLUMNS:KanbanColumn[]=[{key:'new',label:'New'},{key:'contacted',label:'Contacted'},{key:'qualified',label:'Qualified'},{key:'lost',label:'Lost'}]
const MODULE_TABS=[{key:'inquiries',label:'Leads & Prospects'},{key:'service_applications',label:'Service Applications'},{key:'matters',label:'Matters'},{key:'tasks',label:'Tasks'},{key:'funding',label:'Funding'}] as const
type ModuleKey=(typeof MODULE_TABS)[number]['key']
const PATCH_PATH:Record<'matters'|'tasks'|'funding',string>={matters:'/portal/matters',tasks:'/portal/tasks',funding:'/portal/funding'}
function money(cents?:number|null){return typeof cents==='number'?`$${(cents/100).toLocaleString()}`:'Not provided'}
function lifecycleTone(stage:string):'gold'|'green'|'blue'|'slate'|'red'{if(stage==='opportunity')return'gold';if(stage==='prospect')return'blue';if(stage==='lost')return'red';if(stage==='converted')return'green';return'slate'}
function ageDays(value:string|null|undefined){if(!value)return 0;const parsed=Date.parse(value.includes('T')?value:value.replace(' ','T')+'Z');return Number.isFinite(parsed)?Math.max(0,Math.floor((Date.now()-parsed)/86400000)):0}
function ageLabel(value:string|null|undefined){const days=ageDays(value);if(days===0)return'Today';if(days===1)return'1 day';return`${days} days`}

export default function PipelinesAdmin(){
  const p=useAppPath()
  const[tab,setTab]=useState<ModuleKey>('inquiries')
  const[leads,setLeads]=useState<LeadRecord[]>([])
  const[items,setItems]=useState<PipelineItem[]>([])
  const[columns,setColumns]=useState<KanbanColumn[]>([])
  const[loading,setLoading]=useState(true)
  const[recordType,setRecordType]=useState('')
  const[lifecycle,setLifecycle]=useState('')
  const[query,setQuery]=useState('')
  const[ownerFilter,setOwnerFilter]=useState('')
  const[sourceFilter,setSourceFilter]=useState('')
  const[hideLost,setHideLost]=useState(true)
  const[compact,setCompact]=useState(()=>typeof window!=='undefined'&&window.localStorage.getItem('pmv_pipeline_compact')==='1')
  const[conversionTarget,setConversionTarget]=useState<LeadRecord|null>(null)
  const movingRef=useRef(new Set<string>())

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
      }else{
        const res=await api.get<{statuses:string[];items:PipelineItem[]}>(`/admin/pipeline/${which}`)
        setItems(res.items)
        setColumns(res.statuses.map(status=>({key:status,label:status.replace(/_/g,' ')})))
      }
    }catch(err){if(!silent)toast.error(err instanceof ApiError?err.message:'Could not load pipeline.')}
    finally{if(!silent)setLoading(false)}
  },[recordType,lifecycle])

  useEffect(()=>{void load(tab)},[tab,load])
  const refreshCurrent=useCallback(()=>load(tab,true),[load,tab])
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
  const visibleItems=useMemo(()=>{
    const needle=query.trim().toLowerCase()
    if(!needle)return items
    return items.filter(item=>[item.client_name,item.client_email,item.title,item.type,item.service_name,item.service_key,item.assigned_rep_name,item.assigned_rep_email,item.use_of_funds].some(v=>String(v||'').toLowerCase().includes(needle)))
  },[items,query])
  const pipelineColumns=useMemo(()=>hideLost&&tab==='inquiries'?columns.filter(c=>c.key!=='lost'):columns,[columns,hideLost,tab])
  const qualified=leads.filter(l=>l.status==='qualified').length
  const stale=leads.filter(l=>l.status!=='lost'&&ageDays(l.updated_at||l.created_at)>=7).length
  const unassigned=items.filter(i=>i.is_unassigned).length
  const totalVisible=tab==='inquiries'?filteredLeads.length:visibleItems.length

  function clearFilters(){setQuery('');setRecordType('');setLifecycle('');setOwnerFilter('');setSourceFilter('');setHideLost(true)}
  function toggleDensity(){setCompact(value=>{const next=!value;window.localStorage.setItem('pmv_pipeline_compact',next?'1':'0');return next})}

  return <div className={compact?'[&_.pmv-kanban-card]:text-xs':''}>
    <PageIntro kicker="Revenue & Delivery Workflow" title="Pipelines" subtitle="Prioritize movement, surface stalled work, and keep ownership visible. Lead conversion remains a reviewed lifecycle event with attribution preserved." action={tab==='inquiries'?<Link to={p('inquiries')} className="text-sm font-bold text-gold hover:underline">Open CRM Records</Link>:undefined}/>

    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Visible" value={totalVisible}/>
      <StatCard label={tab==='inquiries'?'Qualified':'Stages'} value={tab==='inquiries'?qualified:columns.length}/>
      <StatCard label={tab==='inquiries'?'Stale 7+ Days':'Unassigned'} value={tab==='inquiries'?stale:unassigned}/>
      <StatCard label="Active View" value={MODULE_TABS.find(t=>t.key===tab)?.label||'Pipeline'}/>
    </div>

    <div className="mb-5 overflow-hidden rounded-xl border border-white/[.08] bg-white/[.018]">
      <div className="flex gap-1 overflow-x-auto border-b border-white/[.08] px-2 pt-2">{MODULE_TABS.map(item=><button key={item.key} onClick={()=>{setTab(item.key);setQuery('')}} className={`shrink-0 rounded-t-lg border-b-2 px-3.5 py-2.5 text-sm font-bold transition ${tab===item.key?'border-gold bg-gold/[.06] text-white':'border-transparent text-slate-500 hover:bg-white/[.025] hover:text-slate-200'}`}>{item.label}</button>)}</div>
      <div className="grid gap-3 p-3 md:grid-cols-[minmax(220px,1fr)_auto] md:items-center">
        <input className={inputCls} placeholder="Search this pipeline" value={query} onChange={e=>setQuery(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          {tab==='inquiries'&&<><select className={`${inputCls} !min-h-10 w-auto min-w-[150px]`} value={recordType} onChange={e=>setRecordType(e.target.value)}><option value="">All record types</option><option value="person">People</option><option value="business">Businesses</option></select><select className={`${inputCls} !min-h-10 w-auto min-w-[150px]`} value={lifecycle} onChange={e=>setLifecycle(e.target.value)}><option value="">All lifecycle stages</option><option value="lead">Lead</option><option value="prospect">Prospect</option><option value="opportunity">Opportunity</option><option value="lost">Lost</option></select><select className={`${inputCls} !min-h-10 w-auto min-w-[150px]`} value={ownerFilter} onChange={e=>setOwnerFilter(e.target.value)}><option value="">All owners</option>{ownerOptions.map(v=><option key={v} value={v}>{v}</option>)}</select><select className={`${inputCls} !min-h-10 w-auto min-w-[150px]`} value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}><option value="">All sources</option>{sourceOptions.map(v=><option key={v} value={v}>{v}</option>)}</select><button type="button" onClick={()=>setHideLost(v=>!v)} className={`rounded-xl border px-3 py-2 text-xs font-bold ${hideLost?'border-gold/30 bg-gold/[.07] text-gold':'border-white/10 text-slate-400'}`}>{hideLost?'Lost Hidden':'Lost Visible'}</button></>}
          <button type="button" onClick={toggleDensity} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:border-gold/30 hover:text-gold">{compact?'Comfortable View':'Compact View'}</button>
          {(query||recordType||lifecycle||ownerFilter||sourceFilter||!hideLost)&&<button type="button" onClick={clearFilters} className="px-2 py-2 text-xs font-bold text-slate-500 hover:text-white">Clear</button>}
        </div>
      </div>
    </div>

    {loading?<Panel><p className="text-sm text-slate-400">Loading pipeline data...</p></Panel>:tab==='inquiries'?(filteredLeads.length===0?<Panel><p className="text-sm font-semibold text-white">No records match this view.</p><p className="mt-1 text-xs text-slate-500">Clear filters or change the lifecycle view to broaden the pipeline.</p></Panel>:<KanbanBoard columns={pipelineColumns} items={filteredLeads} getStatus={lead=>lead.status} onMove={moveLead} renderCard={lead=><div className="pmv-kanban-card"><div className="flex items-start justify-between gap-2"><Link to={p(`leads/${lead.id}`)} className="font-bold text-white hover:text-gold">{lead.name}</Link><Tag tone={lifecycleTone(lead.lifecycle_stage)}>{lead.lifecycle_stage}</Tag></div><p className="mt-1 text-xs text-slate-400">{lead.record_type==='business'?'Business':lead.company_name||'Person'} · {lead.email}</p><div className="mt-2 flex flex-wrap gap-1.5"><Tag tone={ageDays(lead.updated_at||lead.created_at)>=7?'red':'slate'}>{ageLabel(lead.updated_at||lead.created_at)} in pipeline</Tag>{lead.source&&<Tag tone="slate">{lead.source}</Tag>}</div><div className="mt-2 space-y-1 text-[11px] text-slate-500">{lead.service_name&&<p>Service: <span className="text-slate-300">{lead.service_name}</span></p>}{(lead.owner_name||lead.owner_email)&&<p>Owner: <span className="text-slate-300">{lead.owner_name||lead.owner_email}</span></p>}</div>{lead.message&&<p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{lead.message}</p>}<div className="mt-3 flex items-center justify-between gap-2"><Link to={p(`leads/${lead.id}`)} className="text-xs font-bold text-gold hover:underline">Open Profile</Link>{lead.status==='qualified'&&<button onClick={()=>setConversionTarget(lead)} className="text-xs font-bold text-emerald-300 hover:underline">Review Conversion</button>}</div><StageSelect value={lead.status} columns={LEAD_COLUMNS} onChange={status=>moveLead(lead,status)}/></div>}/>):visibleItems.length===0?<Panel><p className="text-sm font-semibold text-white">No work matches this view.</p><p className="mt-1 text-xs text-slate-500">Try a different search or pipeline module.</p></Panel>:<KanbanBoard columns={columns} items={visibleItems} getStatus={i=>i.status} onMove={moveItem} renderCard={i=><div className="pmv-kanban-card"><div className="flex items-start justify-between gap-2"><Link to={p(`clients/${i.client_user_id}`)} className="font-bold text-white hover:text-gold">{i.client_name||i.client_email}</Link><Tag tone={ageDays(i.submitted_at||i.created_at)>=7?'red':'slate'}>{ageLabel(i.submitted_at||i.created_at)}</Tag></div><p className="mt-1 text-xs text-slate-400">{tab==='service_applications'&&(i.service_name??i.service_key)}{tab==='matters'&&(i.title??i.type??'Matter')}{tab==='tasks'&&(i.title??'Task')}{tab==='funding'&&`${money(i.amount_requested_cents)} requested`}</p>{tab==='service_applications'&&<div className="mt-2 flex flex-wrap gap-1.5">{i.is_unassigned?<Tag tone="red">Unassigned</Tag>:<Tag tone="slate">{i.assigned_rep_name||i.assigned_rep_email||'Assigned Team'}</Tag>}{!!i.may_require_attorney_coordination&&<Tag tone="gold">Attorney Coordination Review</Tag>}</div>}{tab==='funding'&&i.use_of_funds&&<p className="mt-2 line-clamp-2 text-xs text-slate-500">{i.use_of_funds}</p>}<StageSelect value={i.status} columns={columns} onChange={status=>moveItem(i,status)}/></div>}/>} 

    {conversionTarget&&<LeadConversionDialog leadId={conversionTarget.id} leadName={conversionTarget.name} onClose={()=>setConversionTarget(null)} onConverted={clientUserId=>{toast.success(`${conversionTarget.name} is now a client.`);setLeads(cur=>cur.filter(lead=>lead.id!==conversionTarget.id));setConversionTarget(null);window.location.href=p(`clients/${clientUserId}`)}}/>}
  </div>
}
