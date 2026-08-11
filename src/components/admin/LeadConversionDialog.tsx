import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Dialog, DialogContent } from '../kit/Dialog'
import { btnOutline, btnPrimary, Tag } from './ui'

interface Preview {
  ready:boolean;blockers:string[];transfer:{notes:number;emails:number;activity:number;list_memberships:number}
  attribution:{source:string|null;record_type:string|null;lifecycle_stage:string|null;lead_status:string|null;service_key:string|null;owner_staff_user_id:string|null;company_name:string|null;created_at:string|null;last_contacted_at:string|null}
  lead:{id:string;name:string;email:string;phone:string|null;company_name:string|null;service_key:string|null};existing_user:any|null
}

export function LeadConversionDialog({leadId,leadName,onClose,onConverted}:{leadId:string;leadName:string;onClose:()=>void;onConverted:(clientUserId:string)=>void}){
  const[preview,setPreview]=useState<Preview|null>(null);const[loading,setLoading]=useState(true);const[busy,setBusy]=useState(false);const[error,setError]=useState<string|null>(null)
  useEffect(()=>{api.get<{preview:Preview}>(`/admin/inquiries/${leadId}/conversion-preview`).then(r=>setPreview(r.preview)).catch(err=>setError(err instanceof ApiError?err.message:'Could not prepare conversion review.')).finally(()=>setLoading(false))},[leadId])
  async function convert(){if(!preview?.ready)return;setBusy(true);setError(null);try{const result=await api.post<{client_user_id:string}>(`/admin/inquiries/${leadId}/convert`);onConverted(result.client_user_id)}catch(err){setError(err instanceof ApiError?err.message:'Could not convert this lead.')}finally{setBusy(false)}}
  return <Dialog open onOpenChange={open=>!open&&onClose()}><DialogContent title="Review client conversion" description={`Confirm what will carry forward before ${leadName} becomes a client account.`} className="max-w-2xl">
    {loading?<p className="text-sm text-slate-400">Preparing conversion impact…</p>:preview?<div className="space-y-5">
      <div className={`rounded-lg border p-4 ${preview.ready?'border-emerald-400/20 bg-emerald-400/[.035]':'border-amber-400/20 bg-amber-400/[.04]'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white">{preview.lead.name}</p><p className="mt-1 text-xs text-slate-400">{preview.lead.company_name||preview.lead.email}</p></div><Tag tone={preview.ready?'green':'gold'}>{preview.ready?'Ready to convert':'Review required'}</Tag></div>{preview.blockers.length>0&&<ul className="mt-3 space-y-1 text-sm text-amber-200">{preview.blockers.map(b=><li key={b}>• {b}</li>)}</ul>}</div>
      <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-500">Relationship history that will carry forward</p><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{[['Notes',preview.transfer.notes],['Emails',preview.transfer.emails],['Activity',preview.transfer.activity],['CRM lists',preview.transfer.list_memberships]].map(([label,value])=><div key={String(label)} className="rounded-md border border-white/10 bg-white/[.02] p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-white">{value}</p></div>)}</div></div>
      <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-500">Attribution snapshot</p><div className="mt-2 grid gap-x-6 gap-y-3 rounded-md border border-white/10 p-4 sm:grid-cols-2"><Fact label="Source" value={preview.attribution.source}/><Fact label="Lifecycle" value={preview.attribution.lifecycle_stage}/><Fact label="Lead status" value={preview.attribution.lead_status}/><Fact label="Service interest" value={preview.attribution.service_key?.replace(/_/g,' ')}/><Fact label="Company" value={preview.attribution.company_name}/><Fact label="Last contacted" value={preview.attribution.last_contacted_at?new Date(preview.attribution.last_contacted_at).toLocaleString():null}/></div><p className="mt-2 text-xs leading-5 text-slate-500">This attribution is stored with the conversion record so the original source and lifecycle context remain available after the lead leaves the active pipeline.</p></div>
      {error&&<p className="text-sm text-rose-300">{error}</p>}
      <div className="flex justify-end gap-3"><button className={btnOutline} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy||!preview.ready} onClick={convert}>{busy?'Converting…':'Convert to client'}</button></div>
    </div>:<p className="text-sm text-rose-300">{error||'Conversion review is unavailable.'}</p>}
  </DialogContent></Dialog>
}
function Fact({label,value}:{label:string;value:string|null|undefined}){return <div><p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm text-slate-200">{value||'Not provided'}</p></div>}
