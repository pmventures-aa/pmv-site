import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Panel, EmptyState, StatCard, SkeletonStatCard, SkeletonTable } from '../../components/admin/ui'
import { DashboardWelcome } from '../../components/DashboardWelcome'
import { describeActivity, timeAgo, type ActivityEvent } from '../../lib/activity'
import { useAppPath } from '../../lib/basePath'
import { useLiveRefresh } from '../../lib/liveRefresh'
import { hqEmployeeExperience, hqWorkspaceCopy } from '../../lib/workspace'
import { Icon } from '../../components/kit/Icon'
import { AddToCalendarButton, CalendarSubscribePanel } from '../../components/kit/AddToCalendar'

interface Stats {
  clients: number
  open_tickets: number
  open_matters: number
  pending_tasks: number
  pending_calls: number
  open_invoices: number
}
interface Appointment { id:string; title:string|null; starts_at:string; client_name:string|null; client_email:string; client_user_id:string }
interface OverdueTask { id:string; title:string; due_date:string; client_user_id:string; client_name:string|null; client_email:string }
interface OverdueInvoice { id:string; amount_cents:number; due_date:string; client_user_id:string; client_name:string|null; client_email:string }
interface StaleTicket { id:string; subject:string; created_at:string; client_user_id:string; client_name:string|null; client_email:string }
interface StaleInquiry { id:string; name:string; email:string; created_at:string }
interface QuoteAttention { id:string; quote_number:string; title:string; recipient_name:string; recipient_email:string; total_cents:number; sent_at?:string|null; decided_at?:string|null; status?:string }
interface NeedsAttention { overdue_tasks:OverdueTask[]; overdue_invoices:OverdueInvoice[]; stale_tickets:StaleTicket[]; stale_inquiries:StaleInquiry[]; stale_quotes?:QuoteAttention[]; accepted_quotes?:QuoteAttention[] }
interface DashboardResponse { stats:Stats; upcoming_appointments:Appointment[]; recent_activity:ActivityEvent[]; needs_attention:NeedsAttention }

function money(cents:number):string { return `$${(cents/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}` }
function StatLink({label,value,to,accent}:{label:string;value:number|string;to?:string;accent?:'gold'|'sea'|'coral'|'green'|'red'}) { const content=<StatCard label={label} value={value} accent={accent}/>; return to?<Link to={to} className="block">{content}</Link>:content }

export default function AdminDashboard(){
  const {user,workspace}=useAuth(); const p=useAppPath(); const[data,setData]=useState<DashboardResponse|null>(null); const[createOpen,setCreateOpen]=useState(false); const[loadError,setLoadError]=useState<string|null>(null)
  const hqCopy = hqWorkspaceCopy(workspace.party_type, workspace.vendor_category, workspace.role_name)
  const experience = hqEmployeeExperience(workspace.role_name)
  const load=useCallback(async()=>{try{const next=await api.get<DashboardResponse>('/admin/dashboard');setData(next);setLoadError(null)}catch(error){setLoadError(error instanceof ApiError?error.message:'The HQ overview could not load.')}},[])
  useEffect(()=>{void load()},[load])
  useLiveRefresh(load)
  const stats=data?.stats; const na=data?.needs_attention; const attentionCount=na?na.overdue_tasks.length+na.overdue_invoices.length+na.stale_tickets.length+na.stale_inquiries.length+(na.stale_quotes?.length||0)+(na.accepted_quotes?.length||0):0
  const quick='group inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/[.08] bg-white/[.018] px-3.5 py-2.5 text-xs font-semibold text-slate-300 transition-all duration-200 hover:-translate-y-px hover:border-gold/30 hover:bg-gold/[.03] hover:text-gold'

  return <div className="pb-24 lg:pb-0">
    {loadError&&<div role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[.04] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-amber-100">Overview data is temporarily unavailable</p><p className="mt-1 text-xs text-slate-400">{loadError} Existing navigation and tools remain available.</p></div><button type="button" onClick={()=>void load()} className="shrink-0 rounded-lg border border-amber-300/25 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-300/10">Try again</button></div>}
    <div className="mb-7">
      <DashboardWelcome name={user?.first_name||user?.full_name} userId={user?.id} variant="admin" subtitle={hqCopy.homeSubtitle}/>
      <div className="mt-4 hidden flex-wrap items-center gap-2 sm:flex">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-600">Quick actions</span>
        {experience.quickActions.map((action) => (
          <Link key={action.to} to={p(action.to)} className={quick}><Icon name={action.icon} size={13}/>{action.label}</Link>
        ))}
      </div>
    </div>

    <section aria-labelledby="workspace-heading">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Operational pulse</p><h2 id="workspace-heading" className="mt-1 font-display text-xl font-medium tracking-tight text-white">Today’s workspace</h2></div>
        <div className="hidden gap-3 text-xs text-slate-500 sm:flex"><Link to={p('clients')} className="hover:text-gold">Clients</Link><Link to={p('pipelines')} className="hover:text-gold">Pipeline</Link><Link to={p('reports')} className="hover:text-gold">Reports</Link></div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {!data ? Array.from({length:6}).map((_,i)=><SkeletonStatCard key={i}/>) : <>
          <StatLink label="Clients" value={stats?.clients??0} to={p('clients')} accent="sea"/>
          <StatLink label="Open Tickets" value={stats?.open_tickets??0} to={p('open-items/tickets')} accent="coral"/>
          <StatLink label="Open Matters" value={stats?.open_matters??0} to={p('open-items/matters')} accent="sea"/>
          <StatLink label="Pending Tasks" value={stats?.pending_tasks??0} to={p('open-items/tasks')} accent="gold"/>
          <StatLink label="Calls Pending" value={stats?.pending_calls??0} to={p('open-items/calls')} accent="coral"/>
          <StatLink label="Open Invoices" value={stats?.open_invoices??0} to={p('invoices')} accent="gold"/>
        </>}
      </div>
    </section>

    {data&&attentionCount>0&&<Panel className="mt-7 !border-gold/20 !p-0 overflow-hidden"><div className="flex items-center justify-between border-b border-white/[.07] px-5 py-4 sm:px-6"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold/70">Priority queue</p><h2 className="mt-1 text-sm font-semibold text-white">Needs attention</h2></div><span className="rounded-full border border-gold/20 bg-gold/[.07] px-2.5 py-1 text-xs font-semibold text-gold">{attentionCount}</span></div><ul className="divide-y divide-white/[.055]">
      {na!.overdue_tasks.map((t)=><li key={`task-${t.id}`} className="px-5 py-4 text-sm transition hover:bg-white/[0.018] sm:px-6"><Link to={p(`clients/${t.client_user_id}`)} className="font-medium text-white hover:text-gold">Overdue task: {t.title}</Link><p className="mt-1.5 text-xs text-slate-500">{t.client_name||t.client_email} · due {new Date(t.due_date).toLocaleDateString()}</p></li>)}
      {na!.overdue_invoices.map((inv)=><li key={`inv-${inv.id}`} className="px-5 py-4 text-sm transition hover:bg-white/[0.018] sm:px-6"><Link to={`${p('invoices')}?invoice=${encodeURIComponent(inv.id)}`} className="font-medium text-white hover:text-gold">Overdue invoice: {money(inv.amount_cents)}</Link><p className="mt-1.5 text-xs text-slate-500">{inv.client_name||inv.client_email} · due {new Date(inv.due_date).toLocaleDateString()}</p></li>)}
      {(na!.stale_quotes||[]).map((q)=><li key={`quote-${q.id}`} className="px-5 py-4 text-sm transition hover:bg-white/[0.018] sm:px-6"><Link to={`${p('quotes')}?quote=${encodeURIComponent(q.id)}`} className="font-medium text-white hover:text-gold">Quote waiting on a reply: {q.quote_number}</Link><p className="mt-1.5 text-xs text-slate-500">{q.recipient_name} · {money(q.total_cents)} · {q.status}</p></li>)}
      {(na!.accepted_quotes||[]).map((q)=><li key={`won-${q.id}`} className="px-5 py-4 text-sm transition hover:bg-white/[0.018] sm:px-6"><Link to={`${p('quotes')}?quote=${encodeURIComponent(q.id)}`} className="font-medium text-white hover:text-gold">Accepted quote needs an invoice: {q.quote_number}</Link><p className="mt-1.5 text-xs text-slate-500">{q.recipient_name} · {money(q.total_cents)}</p></li>)}
      {na!.stale_tickets.map((tk)=><li key={`tk-${tk.id}`} className="px-5 py-4 text-sm transition hover:bg-white/[0.018] sm:px-6"><Link to={p(`clients/${tk.client_user_id}`)} className="font-medium text-white hover:text-gold">No response yet: {tk.subject}</Link><p className="mt-1.5 text-xs text-slate-500">{tk.client_name||tk.client_email} · opened {timeAgo(tk.created_at)}</p></li>)}
      {na!.stale_inquiries.map((i)=><li key={`inq-${i.id}`} className="px-5 py-4 text-sm transition hover:bg-white/[0.018] sm:px-6"><Link to={p(`leads/${i.id}`)} className="font-medium text-white hover:text-gold">Uncontacted lead: {i.name}</Link><p className="mt-1.5 text-xs text-slate-500">{i.email} · submitted {timeAgo(i.created_at)}</p></li>)}
    </ul></Panel>}

    <div className="mt-7 grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
      <Panel className="!p-0 overflow-hidden"><div className="flex items-center justify-between border-b border-white/[.07] px-5 py-4 sm:px-6"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Schedule</p><h2 className="mt-1 text-sm font-semibold text-white">Upcoming appointments</h2></div></div><div className="border-b border-white/[.06] px-5 py-3 sm:px-6"><CalendarSubscribePanel feedPath="/admin/calendar/feed" /></div>{!data?<div className="px-5 py-7"><SkeletonTable rows={3} cols={1} /></div>:data.upcoming_appointments.length===0?<div className="p-5"><EmptyState label="Nothing scheduled."/></div>:<ul className="divide-y divide-white/[.055]">{data.upcoming_appointments.map((a)=><li key={a.id} className="px-5 py-4 text-sm transition hover:bg-white/[0.018] sm:px-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><Link to={p(`clients/${a.client_user_id}`)} className="font-medium text-white hover:text-gold">{a.title||'Appointment'}</Link><p className="mt-1.5 text-xs text-slate-500">{a.client_name||a.client_email} · {new Date(a.starts_at).toLocaleString()}</p></div><AddToCalendarButton event={{id:a.id,title:a.title||'Pinnacle appointment',startsAt:a.starts_at,description:`${a.client_name||a.client_email}`}}/></div></li>)}</ul>}</Panel>
      <Panel className="!p-0 overflow-hidden"><div className="flex items-center justify-between border-b border-white/[.07] px-5 py-4 sm:px-6"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Firm activity</p><h2 className="mt-1 text-sm font-semibold text-white">Recent activity</h2></div><Link to={p('activity')} className="text-xs font-semibold text-gold hover:underline">View all</Link></div>{!data?<div className="px-5 py-7"><SkeletonTable rows={3} cols={1} /></div>:data.recent_activity.length===0?<div className="p-5"><EmptyState label="No activity yet."/></div>:<ul className="divide-y divide-white/[.055]">{data.recent_activity.slice(0,3).map((e)=><li key={e.id} className="px-5 py-4 text-sm transition hover:bg-white/[0.018] sm:px-6"><p className="text-slate-300">{describeActivity(e)}</p><p className="mt-1.5 text-xs text-slate-600">{timeAgo(e.created_at)}</p></li>)}</ul>}</Panel>
    </div>

    {createOpen && <div className="fixed inset-0 z-30 lg:hidden" onClick={()=>setCreateOpen(false)} aria-hidden="true" />}
    <div className="fixed right-4 z-40 lg:hidden" style={{bottom:'calc(env(safe-area-inset-bottom) + 1rem)'}} onKeyDown={(e)=>{ if (e.key === 'Escape' && createOpen) setCreateOpen(false) }}>
      {createOpen&&<div role="menu" aria-label="Quick actions" className="mb-3 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-navy-900/98 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="px-3 pb-2 pt-2"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold">Quick Actions</p><p className="mt-1 text-xs text-slate-500">Start the next HQ task without leaving your place.</p></div>
        {experience.quickActions.slice(0, 3).map((action) => (
          <Link key={action.to} to={p(action.to)} onClick={()=>setCreateOpen(false)} role="menuitem" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-200 transition hover:bg-white/[.05] hover:text-gold"><span className="grid h-9 w-9 place-items-center rounded-lg bg-gold/10 text-gold"><Icon name={action.icon} size={16}/></span><span><strong className="block font-semibold">{action.label}</strong><small className="text-xs text-slate-500">{action.detail}</small></span></Link>
        ))}
      </div>}
      <button type="button" onClick={()=>setCreateOpen(v=>!v)} className="ml-auto flex h-12 items-center gap-2 rounded-full border border-gold/30 bg-gold px-4 text-sm font-bold text-navy-950 shadow-2xl shadow-black/30 transition active:scale-[.98]" aria-expanded={createOpen} aria-haspopup="menu" aria-label={createOpen ? 'Close quick actions' : 'Open quick actions'}><Icon name={createOpen?'close':'plus'} size={17}/><span>{createOpen?'Close':experience.createLabel}</span></button>
    </div>
  </div>
}
