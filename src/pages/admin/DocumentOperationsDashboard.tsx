import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, BookOpen, FileCheck2, FileClock, Files, History, LockKeyhole, Send, Share2, ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { useLiveRefresh } from '../../lib/liveRefresh'
import { Panel, Tag, btnSecondary } from '../../components/admin/ui'
import DocumentCenter from './DocumentCenter'
import DocumentGovernanceWorkbench from './DocumentGovernanceWorkbench'

type Doc={id:string;title:string;folder:string;version_count:number;share_count:number;updated_at:string;status:string}
type Envelope={id:string;title:string;public_id:string;status:string;created_at:string;completed_signer_count:number;signer_count:number}

export default function DocumentOperationsDashboard(){
  const p=useAppPath(),[docs,setDocs]=useState<Doc[]>([]),[archived,setArchived]=useState<Doc[]>([]),[envelopes,setEnvelopes]=useState<Envelope[]>([])
  const load=useCallback(async()=>{const [a,b,e]=await Promise.all([api.get<{documents:Doc[]}>('/admin/documents-workspace').catch(()=>({documents:[]})),api.get<{documents:Doc[]}>('/admin/documents-workspace?status=archived').catch(()=>({documents:[]})),api.get<{envelopes:Envelope[]}>('/admin/envelopes').catch(()=>({envelopes:[]}))]);setDocs(a.documents);setArchived(b.documents);setEnvelopes(e.envelopes)},[])
  useEffect(()=>{void load()},[load]);useLiveRefresh(load)
  const metrics=useMemo(()=>({active:docs.length,versioned:docs.filter(d=>d.version_count>1).length,shared:docs.filter(d=>d.share_count>0).length,archived:archived.length,inFlight:envelopes.filter(e=>['sent','viewed','in_progress'].includes(e.status)).length,completed:envelopes.filter(e=>e.status==='completed').length}),[docs,archived,envelopes])
  const recent=useMemo(()=>docs.slice().sort((a,b)=>new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime()).slice(0,5),[docs])
  return <div>
    <Panel className="mb-5 !p-0 overflow-hidden border-gold/15 bg-gradient-to-br from-gold/[.055] via-white/[.018] to-transparent">
      <div className="border-b border-white/10 px-4 py-5 sm:px-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-gold/80">Document Control</p><h2 className="mt-2 text-xl font-extrabold tracking-tight text-white">Enterprise document operations</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Manage working documents, controlled sharing, version history, signature transactions, evidence, and governance from one operational system.</p></div><div className="flex flex-wrap gap-2"><Link to={p('envelopes')} className={btnSecondary}><Send size={14}/>Envelope Workspace</Link><Link to={p('esign-platform')} className={btnSecondary}><ShieldCheck size={14}/>E-Sign Platform</Link><Link to={p('community-documents')} className={btnSecondary}><BookOpen size={14}/>Template Library</Link></div></div></div>
      <div className="grid grid-cols-2 gap-px bg-white/[.06] sm:grid-cols-3 xl:grid-cols-6">{[
        ['Active Docs',metrics.active,Files],['Versioned',metrics.versioned,FileClock],['Shared',metrics.shared,Share2],['Archived',metrics.archived,Archive],['In Flight',metrics.inFlight,Send],['Completed',metrics.completed,FileCheck2],
      ].map(([label,value,Icon]:any)=><div key={label} className="bg-navy-950/75 px-4 py-4"><div className="flex items-center gap-2 text-slate-500"><Icon size={14}/><span className="text-[10px] font-bold uppercase tracking-[.12em]">{label}</span></div><p className="mt-2 text-2xl font-extrabold text-white">{value}</p></div>)}</div>
    </Panel>

    <div className="mb-5 grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
      <Panel><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-extrabold text-white">Recently updated</p><p className="mt-1 text-xs text-slate-500">The working documents most recently changed in HQ.</p></div><History size={17} className="text-gold"/></div><div className="mt-4 divide-y divide-white/[.06]">{recent.length===0?<p className="py-4 text-xs text-slate-500">No working documents yet.</p>:recent.map(d=><div key={d.id} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{d.title}</p><p className="mt-1 text-[11px] text-slate-500">{d.folder} · v{d.version_count} · {d.share_count} shares</p></div><span className="shrink-0 text-[11px] text-slate-600">{new Date(d.updated_at).toLocaleDateString()}</span></div>)}</div></Panel>
      <Panel><p className="text-xs font-extrabold text-white">Governance shortcuts</p><p className="mt-1 text-xs leading-5 text-slate-500">Sensitive document operations should always have an evidence and access path.</p><div className="mt-4 space-y-2"><Link to={p('audit-log')} className="flex min-h-11 items-center justify-between rounded-xl border border-white/10 px-3.5 py-3 text-sm font-semibold text-slate-300 hover:border-gold/25 hover:text-gold"><span className="flex items-center gap-2"><ShieldCheck size={15}/>Document & access audit</span><Tag>Audit</Tag></Link><Link to={p('security-center')} className="flex min-h-11 items-center justify-between rounded-xl border border-white/10 px-3.5 py-3 text-sm font-semibold text-slate-300 hover:border-gold/25 hover:text-gold"><span className="flex items-center gap-2"><LockKeyhole size={15}/>Security & sessions</span><Tag>Security</Tag></Link><Link to={p('envelopes')} className="flex min-h-11 items-center justify-between rounded-xl border border-white/10 px-3.5 py-3 text-sm font-semibold text-slate-300 hover:border-gold/25 hover:text-gold"><span className="flex items-center gap-2"><FileCheck2 size={15}/>Executed evidence packages</span><Tag>Evidence</Tag></Link></div></Panel>
    </div>

    <DocumentGovernanceWorkbench/>
    <DocumentCenter/>
  </div>
}
