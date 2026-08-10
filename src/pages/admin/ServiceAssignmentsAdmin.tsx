import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, Tag, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { DateSelect } from '../../components/kit/DateSelect'
import { Icon } from '../../components/kit/Icon'
import { toast } from '../../components/kit/toast'
import { useAppPath } from '../../lib/basePath'
import { useLiveRefresh } from '../../lib/liveRefresh'
import { parseOptions, questionVisible, type AnswerMap, type IntakeQuestion, type IntakeValue } from '../../lib/intake'

interface ClientOption { id:string; full_name:string|null; email:string; phone:string|null; business_name:string|null }
interface WorkspaceService { key:string; name:string; description:string|null; category:string|null; estimated_minutes:number; question_count:number; client_service_id:string|null; client_service_status:string|null; draft_application_id:string|null; draft_submission_source:string|null }
interface Workspace { client:ClientOption; services:WorkspaceService[] }
interface PrefillResponse { application:{id:string;client_user_id:string;service_key:string;service_name:string;client_name:string|null;client_email:string;status:string;submission_source:string;client_signed_at:string|null}; questions:IntakeQuestion[]; answers:AnswerMap }

function CompactField({ q, value, onChange, answers }:{q:IntakeQuestion;value:IntakeValue|undefined;onChange:(v:IntakeValue)=>void;answers:AnswerMap}) {
  if (!questionVisible(q, answers)) return null
  const options = parseOptions(q.options)
  const wrap = (child:React.ReactNode) => <label className={q.input_type==='textarea'?'sm:col-span-2':''}><span className="mb-1.5 block text-xs font-medium text-slate-300">{q.label}{q.required&&<span className="text-gold"> *</span>}</span>{q.help_text&&<span className="mb-2 block text-[11px] leading-4 text-slate-500">{q.help_text}</span>}{child}</label>
  if(q.input_type==='single_select') return wrap(<select className={inputCls} value={typeof value==='string'?value:''} onChange={(e)=>onChange(e.target.value)}><option value="">Choose…</option>{options.map((o)=><option key={o.value} value={o.value}>{o.label}</option>)}</select>)
  if(q.input_type==='toggle') return wrap(<select className={inputCls} value={typeof value==='boolean'?(value?'yes':'no'):''} onChange={(e)=>onChange(e.target.value==='yes'?true:e.target.value==='no'?false:'')}><option value="">Choose…</option><option value="yes">Yes</option><option value="no">No</option></select>)
  if(q.input_type==='multi_select') { const selected=Array.isArray(value)?value:[]; return wrap(<div className="flex flex-wrap gap-2">{options.map((o)=><button type="button" key={o.value} onClick={()=>onChange(selected.includes(o.value)?selected.filter((x)=>x!==o.value):[...selected,o.value])} className={`rounded-md border px-3 py-2 text-xs ${selected.includes(o.value)?'border-gold/50 bg-gold/10 text-gold':'border-white/10 text-slate-400 hover:border-white/20'}`}>{o.label}</button>)}</div>) }
  if(q.input_type==='date') return wrap(<DateSelect value={typeof value==='string'?value:''} onChange={onChange} ariaLabel={q.label}/>)
  if(q.input_type==='textarea') return wrap(<textarea className={`${inputCls} min-h-24`} value={typeof value==='string'?value:''} onChange={(e)=>onChange(e.target.value)}/>)
  if(q.input_type==='file') return <div className="sm:col-span-2 rounded-md border border-white/10 bg-white/[.02] p-3 text-xs text-slate-500"><strong className="text-slate-300">{q.label}</strong><br/>The client uploads this file securely from their portal.</div>
  const type=q.input_type==='number'||q.input_type==='currency'?'number':'text'
  return wrap(<input className={inputCls} type={type} value={typeof value==='string'||typeof value==='number'?value:''} onChange={(e)=>onChange(e.target.value)}/>)
}

export default function ServiceAssignmentsAdmin(){
  const p=useAppPath(); const [params]=useSearchParams(); const requestedClient=params.get('client')||''
  const [clients,setClients]=useState<ClientOption[]>([]); const [clientId,setClientId]=useState(requestedClient); const [workspace,setWorkspace]=useState<Workspace|null>(null); const [loading,setLoading]=useState(false); const [search,setSearch]=useState(''); const [editor,setEditor]=useState<PrefillResponse|null>(null); const [answers,setAnswers]=useState<AnswerMap>({}); const [busy,setBusy]=useState(false)
  const loadClients=useCallback(async()=>{try{const r=await api.get<{clients:ClientOption[]}>('/admin/invoice-clients');setClients(r.clients)}catch{}},[])
  const loadWorkspace=useCallback(async(silent=false)=>{if(!clientId){setWorkspace(null);return}if(!silent)setLoading(true);try{const r=await api.get<Workspace>(`/admin/clients/${clientId}/service-workspace`);setWorkspace(r)}catch{if(!silent)setWorkspace(null)}finally{if(!silent)setLoading(false)}},[clientId])
  useEffect(()=>{void loadClients()},[loadClients])
  useEffect(()=>{void loadWorkspace()},[loadWorkspace])
  const backgroundRefresh=useCallback(async()=>{await Promise.all([loadClients(),loadWorkspace(true)])},[loadClients,loadWorkspace])
  useLiveRefresh(backgroundRefresh)
  const filtered=useMemo(()=>workspace?.services.filter((s)=>`${s.name} ${s.description||''} ${s.category||''}`.toLowerCase().includes(search.toLowerCase()))||[],[workspace,search])

  async function assign(service:WorkspaceService){setBusy(true);try{const r=await api.post<{requires_application:boolean;application_id?:string}>(`/admin/clients/${clientId}/services/${service.key}/assign`,{});toast.success(r.requires_application?'Application draft created and client notified.':'Service added to client.');if(r.application_id) await openEditor(r.application_id); await loadWorkspace(true)}catch(err){toast.error(err instanceof ApiError?err.message:'Could not assign service.')}finally{setBusy(false)}}
  async function openEditor(id:string){try{const r=await api.get<PrefillResponse>(`/admin/service-applications/${id}/prefill-form`);setEditor(r);setAnswers(r.answers||{})}catch(err){toast.error(err instanceof ApiError?err.message:'Could not open draft.')}}
  async function savePrefill(){if(!editor)return;setBusy(true);try{await api.patch(`/admin/service-applications/${editor.application.id}/prefill`,{answers});toast.success('Prefill saved. The client will review and sign the latest version.');const r=await api.get<PrefillResponse>(`/admin/service-applications/${editor.application.id}/prefill-form`);setEditor(r);setAnswers(r.answers)}catch(err){toast.error(err instanceof ApiError?err.message:'Could not save draft.')}finally{setBusy(false)}}

  return <div className="mx-auto max-w-[1450px]">
    <PageIntro kicker="Client services" title="Services & Assignments" subtitle="Add services to a client, prepare application details, and keep service ownership organized from one workspace."/>

    <Panel className="mb-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <label><span className="mb-1.5 block text-xs font-medium text-slate-400">Client</span><select className={inputCls} value={clientId} onChange={(e)=>{setClientId(e.target.value);setEditor(null)}}><option value="">Choose a client</option>{clients.map((c)=><option key={c.id} value={c.id}>{c.business_name?`${c.business_name} · `:''}{c.full_name||c.email}</option>)}</select></label>
        {workspace&&<Link to={p(`clients/${workspace.client.id}`)} className={btnOutline}>Open client profile</Link>}
      </div>
    </Panel>

    {!clientId?<EmptyState label="Choose a client to view available services."/>:loading?<p className="text-sm text-slate-400">Loading services…</p>:workspace&&<>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-xl font-semibold text-white">{workspace.client.business_name||workspace.client.full_name||workspace.client.email}</h2><p className="mt-1 text-sm text-slate-500">Available services and current client status.</p></div>
        <input className={`${inputCls} sm:w-72`} placeholder="Search services" value={search} onChange={(e)=>setSearch(e.target.value)}/>
      </div>

      <div className="overflow-hidden rounded-md border border-white/10">
        <div className="hidden grid-cols-[minmax(220px,1.3fr)_minmax(220px,1fr)_150px_170px] gap-4 border-b border-white/10 bg-white/[.02] px-5 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 md:grid">
          <span>Service</span><span>Details</span><span>Status</span><span className="text-right">Action</span>
        </div>
        <div className="divide-y divide-white/10">
          {filtered.map((service)=><div key={service.key} className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(220px,1.3fr)_minmax(220px,1fr)_150px_170px] md:items-center">
            <div><p className="text-xs text-slate-500">{service.category||'Service'}</p><h3 className="mt-1 text-sm font-semibold text-white">{service.name}</h3></div>
            <div><p className="text-sm leading-6 text-slate-400">{service.description||'Professional support from Pinnacle.'}</p><p className="mt-1 text-xs text-slate-500">{Number(service.question_count)>0?`${service.question_count} application questions`:'No application required'}{service.estimated_minutes>0?` · About ${service.estimated_minutes} min`:''}</p></div>
            <div>{service.client_service_status?<Tag tone={service.client_service_status==='active'?'green':'gold'}>{service.client_service_status.replace(/_/g,' ')}</Tag>:<span className="text-xs text-slate-500">Not added</span>}</div>
            <div className="md:text-right">{service.draft_application_id?<button onClick={()=>openEditor(service.draft_application_id!)} className={btnOutline}><span className="inline-flex items-center gap-2"><Icon name="edit" size={14}/>Open draft</span></button>:<button disabled={busy} onClick={()=>assign(service)} className={btnPrimary}><span className="inline-flex items-center gap-2"><Icon name="plus" size={14}/>{Number(service.question_count)>0?'Assign service':'Add service'}</span></button>}</div>
          </div>)}
          {filtered.length===0&&<div className="p-6"><EmptyState label="No services match your search."/></div>}
        </div>
      </div>
    </>}

    {editor&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-5" onMouseDown={(e)=>{if(e.target===e.currentTarget)setEditor(null)}}><div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-xl border border-white/10 bg-navy-950 shadow-2xl sm:rounded-xl"><div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-navy-950/95 px-5 py-4"><div><p className="text-xs text-slate-500">Application prefill</p><h2 className="mt-1 text-xl font-semibold text-white">{editor.application.service_name}</h2><p className="mt-1 text-xs text-slate-500">{editor.application.client_name||editor.application.client_email} · The client reviews and signs before submission.</p></div><button onClick={()=>setEditor(null)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-white/[.04] hover:text-white"><Icon name="close" size={17}/></button></div><div className="p-5"><div className="mb-5 rounded-md border border-white/10 bg-white/[.02] p-4 text-sm leading-6 text-slate-300">Basic client data and previously stored answers are filled when available. Update only what you know. File uploads and the final signature stay with the client.</div><div className="grid gap-4 sm:grid-cols-2">{editor.questions.map((q)=><CompactField key={q.id} q={q} value={answers[q.question_key]} answers={answers} onChange={(v)=>setAnswers((a)=>({...a,[q.question_key]:v}))}/>)}</div><div className="sticky bottom-0 -mx-5 -mb-5 mt-6 flex flex-wrap items-center gap-3 border-t border-white/10 bg-navy-950/95 px-5 py-4"><button onClick={savePrefill} disabled={busy} className={btnPrimary}>{busy?'Saving…':'Save changes'}</button><button onClick={()=>setEditor(null)} className={btnOutline}>Close</button><span className="text-xs text-slate-500">Any saved change requires the client to sign the latest version.</span></div></div></div></div>}
  </div>
}
