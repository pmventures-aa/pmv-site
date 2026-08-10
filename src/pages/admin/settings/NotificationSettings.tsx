import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../../../lib/api'
import { Panel, btnOutline, btnPrimary } from '../../../components/admin/ui'
import { toast } from '../../../components/kit/toast'

interface EventRow {
  event_key:string;label:string;category:string;description:string|null;audience:string
  in_app_enabled:number;email_enabled:number
  subject:string|null;preheader:string|null;eyebrow:string|null;title:string|null;body_html:string|null;cta_label:string|null;template_enabled:number
}
interface NurtureSummary { status:string;count:number }
interface Delivery { id:string;email:string;full_name:string|null;step_key:string;sent_at:string;status:string }

export default function NotificationSettings() {
  const [events,setEvents]=useState<EventRow[]>([])
  const [summary,setSummary]=useState<NurtureSummary[]>([])
  const [deliveries,setDeliveries]=useState<Delivery[]>([])
  const [editing,setEditing]=useState<EventRow|null>(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)

  async function load(){
    setLoading(true)
    try{
      const [center,nurture]=await Promise.all([
        api.get<{events:EventRow[]}>('/admin/notification-center'),
        api.get<{summary:NurtureSummary[];deliveries:Delivery[]}>('/admin/nurture-campaign'),
      ])
      setEvents(center.events);setSummary(nurture.summary);setDeliveries(nurture.deliveries)
    }catch(err){toast.error(err instanceof ApiError?err.message:'Could not load notification center.')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[])
  const groups=useMemo(()=>{const map=new Map<string,EventRow[]>();for(const e of events){if(!map.has(e.category))map.set(e.category,[]);map.get(e.category)!.push(e)}return [...map.entries()]},[events])
  function setEvent(key:string,field:'in_app_enabled'|'email_enabled',checked:boolean){setEvents(rows=>rows.map(r=>r.event_key===key?{...r,[field]:checked?1:0}:r))}
  async function savePreferences(){setBusy(true);try{await api.patch('/admin/notification-center/preferences',{preferences:events.map(e=>({event_key:e.event_key,in_app_enabled:!!e.in_app_enabled,email_enabled:!!e.email_enabled}))});toast.success('Your event subscriptions are saved.')}catch{toast.error('Could not save subscriptions.')}finally{setBusy(false)}}
  async function saveTemplate(){if(!editing)return;setBusy(true);try{await api.patch(`/admin/notification-center/templates/${encodeURIComponent(editing.event_key)}`,{subject:editing.subject,preheader:editing.preheader,eyebrow:editing.eyebrow,title:editing.title,body_html:editing.body_html,cta_label:editing.cta_label,enabled:!!editing.template_enabled});toast.success('Email template saved.');setEditing(null);await load()}catch{toast.error('Could not save email template.')}finally{setBusy(false)}}

  if(loading)return <p className="text-sm text-slate-400">Loading notification center…</p>
  return <div className="space-y-6">
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-3xl"><p className="text-sm font-semibold text-white">Your Pinnacle Admin subscriptions</p><p className="mt-1 text-sm leading-6 text-slate-400">Choose exactly which events should reach you in HQ and by email. These are personal to your admin account; audit history is never removed by muting a notification.</p></div><button onClick={savePreferences} disabled={busy} className={btnPrimary}>{busy?'Saving…':'Save subscriptions'}</button></div>
      <div className="mt-6 space-y-6">{groups.map(([category,rows])=><div key={category}><p className="mb-2 text-[11px] font-semibold uppercase tracking-[.16em] text-gold">{category}</p><div className="divide-y divide-white/5 border-y border-white/10">{rows.map(e=><div key={e.event_key} className="grid gap-3 py-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center"><div><p className="text-sm font-medium text-white">{e.label}</p><p className="mt-0.5 text-xs text-slate-500">{e.description}</p></div><label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={!!e.in_app_enabled} onChange={ev=>setEvent(e.event_key,'in_app_enabled',ev.target.checked)}/>HQ bell</label><label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={!!e.email_enabled} onChange={ev=>setEvent(e.event_key,'email_enabled',ev.target.checked)}/>Email me</label><button className="text-xs font-medium text-gold hover:underline" onClick={()=>setEditing({...e})}>Customize email</button></div>)}</div></div>)}</div>
    </Panel>

    <Panel>
      <p className="text-sm font-semibold text-white">14-day client discovery campaign</p><p className="mt-1 text-sm leading-6 text-slate-400">Every new client is automatically enrolled after signup. Day 0 is the welcome email; days 2, 4, 6, 8, 10, 12, and 14 help the client discover Pinnacle naturally without turning the portal into a sales wall.</p>
      <div className="mt-4 flex flex-wrap gap-2">{summary.length?summary.map(s=><span key={s.status} className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-slate-300"><strong className="text-white">{s.count}</strong> {s.status}</span>):<span className="text-xs text-slate-500">No clients enrolled yet.</span>}</div>
      {deliveries.length>0&&<div className="mt-5 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="pb-2">Client</th><th className="pb-2">Campaign step</th><th className="pb-2">Sent</th></tr></thead><tbody className="divide-y divide-white/5">{deliveries.slice(0,12).map(d=><tr key={d.id}><td className="py-2 text-slate-300">{d.full_name||d.email}</td><td className="py-2 text-slate-300">{d.step_key.replace(/_/g,' ')}</td><td className="py-2 text-slate-500">{new Date(d.sent_at).toLocaleString()}</td></tr>)}</tbody></table></div>}
    </Panel>

    {editing&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4" onMouseDown={()=>setEditing(null)}><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/10 bg-navy-950 p-5 shadow-2xl" onMouseDown={e=>e.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Branded event email</p><h3 className="mt-1 text-lg font-semibold text-white">{editing.label}</h3></div><button className={btnOutline} onClick={()=>setEditing(null)}>Close</button></div><p className="mt-3 text-xs leading-5 text-slate-500">Leave a field blank to use the event’s default copy. In custom body HTML, <code>{'{{event_body}}'}</code> inserts the event-specific details and <code>{'{{event_subject}}'}</code> inserts its generated subject.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">
      <label><span className="mb-1 block text-xs text-slate-400">Subject</span><input className="input" value={editing.subject||''} onChange={e=>setEditing(v=>v&&({...v,subject:e.target.value}))}/></label><label><span className="mb-1 block text-xs text-slate-400">Preheader</span><input className="input" value={editing.preheader||''} onChange={e=>setEditing(v=>v&&({...v,preheader:e.target.value}))}/></label><label><span className="mb-1 block text-xs text-slate-400">Eyebrow</span><input className="input" value={editing.eyebrow||''} onChange={e=>setEditing(v=>v&&({...v,eyebrow:e.target.value}))}/></label><label><span className="mb-1 block text-xs text-slate-400">Headline</span><input className="input" value={editing.title||''} onChange={e=>setEditing(v=>v&&({...v,title:e.target.value}))}/></label><label className="sm:col-span-2"><span className="mb-1 block text-xs text-slate-400">Body HTML</span><textarea className="input min-h-[150px]" value={editing.body_html||''} onChange={e=>setEditing(v=>v&&({...v,body_html:e.target.value}))} placeholder="Optional. Use {{event_body}} to preserve the event details."/></label><label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={!!editing.template_enabled} onChange={e=>setEditing(v=>v&&({...v,template_enabled:e.target.checked?1:0}))}/>Email template enabled</label></div><div className="mt-5 flex justify-end"><button onClick={saveTemplate} disabled={busy} className={btnPrimary}>{busy?'Saving…':'Save template'}</button></div></div></div>}
  </div>
}
