import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Download, ShieldAlert } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { Panel, EmptyState, inputCls, btnOutline } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { Dialog, DialogContent } from '../../components/kit/Dialog'
import { timeAgo } from '../../lib/activity'

const ENTITIES = [
  { key: 'inquiries', label: 'Leads' }, { key: 'users', label: 'Users' }, { key: 'matters', label: 'Matters' }, { key: 'tasks', label: 'Tasks' },
  { key: 'invoices', label: 'Invoices' }, { key: 'documents', label: 'Documents' }, { key: 'tickets', label: 'Tickets' }, { key: 'notes', label: 'Notes' },
] as const
type EntityKey = (typeof ENTITIES)[number]['key']

function titleOf(entity: EntityKey, row: any): string {
  switch (entity) {
    case 'users': return `${row.full_name || row.email}: ${String(row.role || 'User').replace(/^./, (m) => m.toUpperCase())}`
    case 'inquiries': return `${row.name || row.email}: Lead`
    case 'matters': case 'tasks': return row.title || 'Untitled'
    case 'invoices': return `$${((row.amount_cents ?? 0) / 100).toLocaleString()} Invoice`
    case 'documents': return row.file_name || row.category || 'Document'
    case 'tickets': return row.subject || 'Untitled Ticket'
    case 'notes': return (row.body || '').slice(0, 80) || 'Note'
  }
}
function titleCase(value:string){return value.replace(/_/g,' ').replace(/\b\w/g,(m)=>m.toUpperCase())}

export default function PermanentDeletions() {
  const [entity,setEntity]=useState<EntityKey>('inquiries');const[records,setRecords]=useState<any[]>([]);const[loading,setLoading]=useState(true);const[loadError,setLoadError]=useState(false);const[target,setTarget]=useState<any|null>(null);const[showLedger,setShowLedger]=useState(false)
  const load=useCallback(async()=>{setLoading(true);try{const res=await api.get<{records:any[]}>(`/admin/records/${entity}/archived`);setRecords(res.records);setLoadError(false)}catch{setLoadError(true)}finally{setLoading(false)}},[entity])
  useEffect(()=>{void load()},[load])
  async function restore(id:string){try{await api.patch(`/admin/records/${entity}/${id}/restore`);toast.success('Record restored.');setRecords(rs=>rs.filter(r=>r.id!==id))}catch(err){toast.error(err instanceof ApiError?err.message:'Could not restore this record.')}}
  const entityLabel=ENTITIES.find(e=>e.key===entity)?.label.toLowerCase()
  return <div>
    <div className="mb-5 rounded-xl border border-rose-400/15 bg-rose-400/[.035] p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex max-w-3xl items-start gap-3"><ShieldAlert size={20} className="mt-0.5 shrink-0 text-rose-300"/><div><p className="text-sm font-bold text-white">Owner Danger Zone</p><p className="mt-1 text-sm leading-6 text-slate-400">Permanent deletion is a controlled owner action. Operational records must be archived first; user accounts must be suspended or inactive. Before deletion, HQ calculates linked-data impact and requires your password, a specific business reason, and an exact typed confirmation.</p><p className="mt-2 text-xs leading-5 text-slate-500">The evidence ledger keeps the deleted record snapshot, dependency summary, actor, and reason after the source row is gone.</p></div></div><div className="flex gap-2"><a className={`${btnOutline} shrink-0 text-xs`} href="/api/admin/permanent-deletions/export.csv" download><Download size={14}/>Export Ledger</a><button className={`${btnOutline} shrink-0 text-xs`} onClick={()=>setShowLedger(true)}>View Deletion Ledger</button></div></div></div>
    <div className="mb-5 flex flex-wrap gap-1.5 border-b border-white/10">{ENTITIES.map(e=><button key={e.key} onClick={()=>setEntity(e.key)} className={`border-b-2 px-3 py-2 text-sm font-bold transition ${entity===e.key?'border-gold text-white':'border-transparent text-slate-400 hover:text-slate-200'}`}>{e.label}</button>)}</div>
    {loading?<p className="text-sm text-slate-400">Loading records…</p>:loadError?<div className="space-y-2 text-sm text-slate-400"><p>Could not load eligible {entityLabel}.</p><button onClick={load} className="font-bold text-gold hover:text-gold-300">Try Again</button></div>:records.length===0?<Panel><EmptyState label={`No ${entity==='users'?'suspended or inactive':'archived'} ${entityLabel}.`}/></Panel>:<div className="space-y-2">{records.map(r=><Panel key={r.id} className="flex flex-wrap items-center justify-between gap-3 !p-4"><div><p className="text-sm font-bold text-white">{titleOf(entity,r)}</p><p className="mt-1 text-xs text-slate-500">{entity==='users'?`Status: ${r.status}${r.last_login_at?` · Last login ${timeAgo(r.last_login_at)}`:''}`:`Archived ${timeAgo(r.archived_at)}${r.archived_reason?`: “${r.archived_reason}”`:''}`}</p></div><div className="flex shrink-0 gap-4">{entity!=='users'&&<button onClick={()=>restore(r.id)} className="text-xs font-bold text-gold hover:text-gold-300">Restore</button>}<button onClick={()=>setTarget(r)} className="text-xs font-bold text-rose-300 hover:text-rose-200">Review Permanent Deletion</button></div></Panel>)}</div>}
    {target&&<PermanentDeleteDialog entity={entity} record={target} onClose={()=>setTarget(null)} onDeleted={()=>{setRecords(rs=>rs.filter(r=>r.id!==target.id));setTarget(null)}}/>}
    {showLedger&&<DeletionLedgerDialog onClose={()=>setShowLedger(false)}/>} 
  </div>
}

interface Impact {entity:string;id:string;label:string;eligible:boolean;required_state:string;dependencies:Record<string,number>;total_dependencies:number;confirmation:string}
function PermanentDeleteDialog({entity,record,onClose,onDeleted}:{entity:EntityKey;record:any;onClose:()=>void;onDeleted:()=>void}){
  const[impact,setImpact]=useState<Impact|null>(null);const[loading,setLoading]=useState(true);const[password,setPassword]=useState('');const[reason,setReason]=useState('');const[confirmation,setConfirmation]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState<string|null>(null)
  useEffect(()=>{api.get<{impact:Impact}>(`/admin/records/${entity}/${record.id}/deletion-impact`).then(r=>setImpact(r.impact)).catch(err=>setError(err instanceof ApiError?err.message:'Could not calculate deletion impact.')).finally(()=>setLoading(false))},[entity,record.id])
  async function confirm(e:React.FormEvent){e.preventDefault();if(!impact)return;setBusy(true);setError(null);try{await api.del(`/admin/records/${entity}/${record.id}/permanent`,{password,reason,confirmation});toast.success('Record permanently deleted and written to the deletion ledger.');onDeleted()}catch(err){setError(err instanceof ApiError?err.message:'Could not delete this record.')}finally{setBusy(false)}}
  return <Dialog open onOpenChange={open=>!open&&onClose()}><DialogContent title="Permanent Deletion Impact Review" description={`Review every known dependency before deleting “${titleOf(entity,record)}”.`} className="max-w-2xl">
    {loading?<p className="text-sm text-slate-400">Calculating linked-data impact…</p>:impact?<form onSubmit={confirm} className="space-y-5">
      <div className={`rounded-xl border p-4 ${impact.eligible?'border-rose-400/25 bg-rose-400/[.045]':'border-amber-400/25 bg-amber-400/[.045]'}`}><div className="flex items-start gap-3"><AlertTriangle size={18} className={`mt-0.5 shrink-0 ${impact.eligible?'text-rose-300':'text-amber-300'}`}/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-white">{impact.label}</p><p className="mt-1 text-xs text-slate-400">Required State: {impact.required_state}</p></div><span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${impact.eligible?'border-rose-400/30 text-rose-300':'border-amber-400/30 text-amber-300'}`}>{impact.eligible?'Eligible for Deletion':'Not Eligible Yet'}</span></div><p className="mt-3 text-sm text-slate-300">Known Linked Records: <strong className="font-bold text-white">{impact.total_dependencies}</strong></p>{Object.keys(impact.dependencies).length>0&&<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{Object.entries(impact.dependencies).map(([key,value])=><div key={key} className="rounded-lg border border-white/8 bg-black/10 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{titleCase(key)}</p><p className="mt-1 text-lg font-extrabold text-white">{value}</p></div>)}</div>}</div></div></div>
      {!impact.eligible&&<p className="rounded-lg border border-amber-400/20 bg-amber-400/[.04] px-3 py-2 text-sm font-semibold text-amber-200">This record cannot be permanently deleted until it is {impact.required_state}.</p>}
      <label><span className="mb-2 block text-sm font-bold text-slate-300">Business Reason</span><textarea className={`${inputCls} min-h-[92px]`} required minLength={8} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Document the specific business or data-governance reason for deleting this record."/></label>
      <label><span className="mb-2 block text-sm font-bold text-slate-300">Type Exactly to Confirm</span><code className="mb-2 block select-all rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-rose-200">{impact.confirmation}</code><input className={inputCls} required value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off" spellCheck={false}/></label>
      <label><span className="mb-2 block text-sm font-bold text-slate-300">Your Password</span><input className={inputCls} type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
      {error&&<p className="text-sm font-semibold text-rose-300">{error}</p>}
      <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className={btnOutline}>Cancel</button><button type="submit" disabled={busy||!impact.eligible||confirmation!==impact.confirmation||reason.trim().length<8||!password} className="inline-flex items-center justify-center rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40">{busy?'Deleting…':'Delete Permanently'}</button></div>
    </form>:<p className="text-sm font-semibold text-rose-300">{error||'Deletion impact is unavailable.'}</p>}
  </DialogContent></Dialog>
}

interface DeletionRow {id:string;entity_type:string;entity_id:string;record_label:string|null;reason:string;dependency_summary_json:string|null;deleted_by_name:string|null;deleted_by_email:string;deleted_at:string}
function DeletionLedgerDialog({onClose}:{onClose:()=>void}){
  const[rows,setRows]=useState<DeletionRow[]>([]);const[loading,setLoading]=useState(true)
  useEffect(()=>{api.get<{deletions:DeletionRow[]}>('/admin/permanent-deletions').then(r=>setRows(r.deletions)).finally(()=>setLoading(false))},[])
  return <Dialog open onOpenChange={open=>!open&&onClose()}><DialogContent title="Permanent Deletion Ledger" description="Immutable evidence of what was deleted, who authorized it, why, and the known dependency impact at deletion time." className="max-w-3xl">{loading?<p className="text-sm text-slate-400">Loading ledger…</p>:rows.length===0?<EmptyState label="No permanent deletions on record."/>:<div className="max-h-[65vh] space-y-2 overflow-y-auto">{rows.map(r=>{let deps:Record<string,number>={};try{deps=JSON.parse(r.dependency_summary_json||'{}')}catch{};const linked=Object.values(deps).reduce((a,b)=>a+b,0);return <div key={r.id} className="rounded-xl border border-white/10 bg-navy-950 p-4 text-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-white">{r.record_label||titleCase(r.entity_type)}</p><p className="mt-1 text-xs text-slate-500">Deleted by {r.deleted_by_name||r.deleted_by_email} · {timeAgo(r.deleted_at)}</p></div><span className="text-xs font-semibold text-slate-500">{linked} Linked</span></div><p className="mt-2 text-xs text-slate-400"><strong className="font-bold text-slate-300">Reason:</strong> {r.reason}</p></div>})}</div>}</DialogContent></Dialog>
}
