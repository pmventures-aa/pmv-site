import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Panel, EmptyState, StatCard } from '../../components/admin/ui'
import { DashboardWelcome } from '../../components/DashboardWelcome'
import { describeActivity, timeAgo, type ActivityEvent } from '../../lib/activity'
import { useAppPath } from '../../lib/basePath'
import { Icon } from '../../components/kit/Icon'

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
interface NeedsAttention { overdue_tasks:OverdueTask[]; overdue_invoices:OverdueInvoice[]; stale_tickets:StaleTicket[]; stale_inquiries:StaleInquiry[] }
interface DashboardResponse { stats:Stats; upcoming_appointments:Appointment[]; recent_activity:ActivityEvent[]; needs_attention:NeedsAttention }

function money(cents:number):string { return `$${(cents/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}` }
function StatLink({label,value,to}:{label:string;value:number|string;to?:string}) { const content=<StatCard label={label} value={value}/>; return to?<Link to={to} className="block">{content}</Link>:content }
const POLL_MS=60_000

export default function AdminDashboard(){
  const {user}=useAuth(); const p=useAppPath(); const[data,setData]=useState<DashboardResponse|null>(null); const[createOpen,setCreateOpen]=useState(false)
  useEffect(()=>{const load=()=>api.get<DashboardResponse>('/admin/dashboard').then(setData).catch(()=>{});load();const t=setInterval(load,POLL_MS);return()=>clearInterval(t)},[])
  const stats=data?.stats; const na=data?.needs_attention; const attentionCount=na?na.overdue_tasks.length+na.overdue_invoices.length+na.stale_tickets.length+na.stale_inquiries.length:0
  const quick='group inline-flex shrink-0 items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-medium text-slate-200 transition-all duration-200 hover:-translate-y-px hover:border-gold/40 hover:bg-gold/[.035] hover:text-gold'

  return <div className="pb-20 lg:pb-0">
    <DashboardWelcome name={user?.first_name||user?.full_name} userId={user?.id} variant="admin" subtitle={user?.role==='admin'?'Here’s the firm-wide picture and the work that needs attention next.':'Here’s your assigned client work and the next items that need attention.'} className="mb-7"/>

    <section aria-labelledby="workspace-heading">
      <div className="mb-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Operational pulse</p><h2 id="workspace-heading" className="mt-1 font-display text-xl font-medium text-white">Today’s workspace</h2></div>
        <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <Link to={p('inquiries')} className={quick}><Icon name="plus" size={13}/>Add lead</Link>
          <Link to={p('service-assignments')} className={quick}><Icon name="services" size={13}/>Assign service</Link>
          <Link to={p('invoices')} className={quick}><Icon name="billing" size={13}/>New invoice</Link>
          <Link to={p('communications')} className={quick}><Icon name="communications" size={13}/>Communications</Link>
          <Link to={p('clients')} className={quick}>Clients</Link>
          <Link to={p('pipelines')} className={quick}>Pipelines</Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatLink label="Clients" value={stats?.clients??'—'} to={p('clients')}/>
        <StatLink label="Open Tickets" value={stats?.open_tickets??'—'} to={p('open-items/tickets')}/>
        <StatLink label="Open Matters" value={stats?.open_matters??'—'} to={p('open-items/matters')}/>
        <StatLink label="Pending Tasks" value={stats?.pending_tasks??'—'} to={p('open-items/tasks')}/>
        <StatLink label="Calls Pending" value={stats?.pending_calls??'—'} to={p('open-items/calls')}/>
        <StatLink label="Open Invoices" value={stats?.open_invoices??'—'} to={p('invoices')}/>
      </div>
    </section>

    {data&&attentionCount>0&&<Panel className="mt-7 !border-gold/25 !p-0"><div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold/70">Priority queue</p><h2 className="mt-0.5 text-sm font-semibold text-white">Needs attention</h2></div><span className="rounded-full bg-gold/10 px-2.5 py-1 text-xs font-medium text-gold">{attentionCount}</span></div><ul className="divide-y divide-white/5">
      {na!.overdue_tasks.map((t)=><li key={`task-${t.id}`} className="px-5 py-3.5 text-sm transition hover:bg-white/[0.02]"><Link to={p(`clients/${t.client_user_id}`)} className="font-medium text-white hover:text-gold">Overdue task: {t.title}</Link><p className="mt-1 text-xs text-slate-400">{t.client_name||t.client_email} · due {new Date(t.due_date).toLocaleDateString()}</p></li>)}
      {na!.overdue_invoices.map((inv)=><li key={`inv-${inv.id}`} className="px-5 py-3.5 text-sm transition hover:bg-white/[0.02]"><Link to={`${p('invoices')}?q=${encodeURIComponent(inv.client_email)}`} className="font-medium text-white hover:text-gold">Overdue invoice: {money(inv.amount_cents)}</Link><p className="mt-1 text-xs text-slate-400">{inv.client_name||inv.client_email} · due {new Date(inv.due_date).toLocaleDateString()}</p></li>)}
      {na!.stale_tickets.map((tk)=><li key={`tk-${tk.id}`} className="px-5 py-3.5 text-sm transition hover:bg-white/[0.02]"><Link to={p(`clients/${tk.client_user_id}`)} className="font-medium text-white hover:text-gold">No response yet: {tk.subject}</Link><p className="mt-1 text-xs text-slate-400">{tk.client_name||tk.client_email} · opened {timeAgo(tk.created_at)}</p></li>)}
      {na!.stale_inquiries.map((i)=><li key={`inq-${i.id}`} className="px-5 py-3.5 text-sm transition hover:bg-white/[0.02]"><Link to={p(`leads/${i.id}`)} className="font-medium text-white hover:text-gold">Uncontacted lead: {i.name}</Link><p className="mt-1 text-xs text-slate-400">{i.email} · submitted {timeAgo(i.created_at)}</p></li>)}
    </ul></Panel>}

    <div className="mt-7 grid gap-5 lg:grid-cols-2">
      <Panel className="!p-0"><div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Schedule</p><h2 className="mt-0.5 text-sm font-semibold text-white">Upcoming appointments</h2></div></div>{!data?<p className="px-5 py-6 text-sm text-slate-400">Loading…</p>:data.upcoming_appointments.length===0?<div className="p-5"><EmptyState label="Nothing scheduled."/></div>:<ul className="divide-y divide-white/5">{data.upcoming_appointments.map((a)=><li key={a.id} className="px-5 py-3.5 text-sm transition hover:bg-white/[0.02]"><Link to={p(`clients/${a.client_user_id}`)} className="font-medium text-white hover:text-gold">{a.title||'Appointment'}</Link><p className="mt-1 text-xs text-slate-400">{a.client_name||a.client_email} · {new Date(a.starts_at).toLocaleString()}</p></li>)}</ul>}</Panel>
      <Panel className="!p-0"><div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Firm activity</p><h2 className="mt-0.5 text-sm font-semibold text-white">Recent activity</h2></div><Link to={p('activity')} className="text-xs font-medium text-gold hover:underline">View all</Link></div>{!data?<p className="px-5 py-6 text-sm text-slate-400">Loading…</p>:data.recent_activity.length===0?<div className="p-5"><EmptyState label="No activity yet."/></div>:<ul className="divide-y divide-white/5">{data.recent_activity.slice(0,8).map((e)=><li key={e.id} className="px-5 py-3.5 text-sm transition hover:bg-white/[0.02]"><p className="text-slate-200">{describeActivity(e)}</p><p className="mt-1 text-xs text-slate-500">{timeAgo(e.created_at)}</p></li>)}</ul>}</Panel>
    </div>

    <div className="fixed right-4 z-40 lg:hidden" style={{bottom:'calc(env(safe-area-inset-bottom) + 1rem)'}}>
      {createOpen&&<div className="mb-3 w-52 overflow-hidden rounded-xl border border-white/10 bg-navy-900 shadow-2xl">
        <Link to={p('inquiries')} onClick={()=>setCreateOpen(false)} className="flex items-center gap-3 border-b border-white/10 px-4 py-3 text-sm text-slate-200 hover:bg-white/[.04] hover:text-gold"><Icon name="plus" size={15}/>Add lead</Link>
        <Link to={p('service-assignments')} onClick={()=>setCreateOpen(false)} className="flex items-center gap-3 border-b border-white/10 px-4 py-3 text-sm text-slate-200 hover:bg-white/[.04] hover:text-gold"><Icon name="services" size={15}/>Assign service</Link>
        <Link to={p('invoices')} onClick={()=>setCreateOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-slate-200 hover:bg-white/[.04] hover:text-gold"><Icon name="billing" size={15}/>New invoice</Link>
      </div>}
      <button type="button" onClick={()=>setCreateOpen(v=>!v)} className="ml-auto flex h-12 items-center gap-2 rounded-full border border-gold/30 bg-gold px-4 text-sm font-semibold text-navy-950 shadow-2xl shadow-black/30 transition active:scale-[.98]" aria-expanded={createOpen} aria-label="Create new item"><Icon name={createOpen?'close':'plus'} size={17}/><span>{createOpen?'Close':'Create'}</span></button>
    </div>
  </div>
}
