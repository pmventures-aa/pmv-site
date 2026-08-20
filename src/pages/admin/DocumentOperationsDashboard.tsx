import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, ChevronDown, FileCheck2, FileClock, Files, History, LockKeyhole, Send, Share2, ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { useLiveRefresh } from '../../lib/liveRefresh'
import { Panel, Tag } from '../../components/admin/ui'
import { DocumentWorkspaceNav } from '../../components/admin/DocumentWorkspaceNav'
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
    <DocumentWorkspaceNav />

    {/* Primary: the working document area sits at the top, so selecting a
        document opens it in view instead of pushing it below a screenful of
        dashboard chrome. The operations overview and governance panels are
        demoted to a collapsed section below. */}
    <DocumentCenter/>

    <details className="group mt-5 rounded-xl border border-white/10 bg-white/[.015]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[.02] [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2"><ShieldCheck size={15} className="text-gold"/>Operations overview & governance</span>
        <span className="flex items-center gap-3 text-[11px] font-medium text-slate-500">
          <span className="hidden sm:inline">{metrics.active} active · {metrics.inFlight} in flight · {metrics.completed} completed</span>
          <ChevronDown size={15} className="transition group-open:rotate-180"/>
        </span>
      </summary>
      <div className="space-y-5 border-t border-white/10 p-4">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-white/[.06] sm:grid-cols-3 xl:grid-cols-6">{[
          ['Active Docs',metrics.active,Files],['Versioned',metrics.versioned,FileClock],['Shared',metrics.shared,Share2],['Archived',metrics.archived,Archive],['In Flight',metrics.inFlight,Send],['Completed',metrics.completed,FileCheck2],
        ].map(([label,value,Icon]:any)=><div key={label} className="bg-navy-950/75 px-4 py-4"><div className="flex items-center gap-2 text-slate-500"><Icon size={14}/><span className="text-[10px] font-bold uppercase tracking-[.12em]">{label}</span></div><p className="mt-2 text-2xl font-extrabold text-white">{value}</p></div>)}</div>

        <div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
          <Panel><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-extrabold text-white">Recently updated</p><p className="mt-1 text-xs text-slate-500">The working documents most recently changed in HQ.</p></div><History size={17} className="text-gold"/></div><div className="mt-4 divide-y divide-white/[.06]">{recent.length===0?<p className="py-4 text-xs text-slate-500">No working documents yet.</p>:recent.map(d=><div key={d.id} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{d.title}</p><p className="mt-1 text-[11px] text-slate-500">{d.folder} · v{d.version_count} · {d.share_count} shares</p></div><span className="shrink-0 text-[11px] text-slate-600">{new Date(d.updated_at).toLocaleDateString()}</span></div>)}</div></Panel>
          <Panel><p className="text-xs font-extrabold text-white">Governance shortcuts</p><p className="mt-1 text-xs leading-5 text-slate-500">Sensitive document operations should always have an evidence and access path.</p><div className="mt-4 space-y-2"><Link to={p('audit-log')} className="flex min-h-11 items-center justify-between rounded-xl border border-white/10 px-3.5 py-3 text-sm font-semibold text-slate-300 hover:border-gold/25 hover:text-gold"><span className="flex items-center gap-2"><ShieldCheck size={15}/>Document & access audit</span><Tag>Audit</Tag></Link><Link to={p('security-center')} className="flex min-h-11 items-center justify-between rounded-xl border border-white/10 px-3.5 py-3 text-sm font-semibold text-slate-300 hover:border-gold/25 hover:text-gold"><span className="flex items-center gap-2"><LockKeyhole size={15}/>Security & sessions</span><Tag>Security</Tag></Link><Link to={p('envelopes')} className="flex min-h-11 items-center justify-between rounded-xl border border-white/10 px-3.5 py-3 text-sm font-semibold text-slate-300 hover:border-gold/25 hover:text-gold"><span className="flex items-center gap-2"><FileCheck2 size={15}/>Executed evidence packages</span><Tag>Evidence</Tag></Link></div></Panel>
        </div>

        <DocumentGovernanceWorkbench/>
      </div>
    </details>
  </div>
}
