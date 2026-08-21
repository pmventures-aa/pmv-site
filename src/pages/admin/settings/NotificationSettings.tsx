import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../../lib/api'
import { Panel, btnOutline, btnPrimary } from '../../../components/admin/ui'
import { RichTextComposer } from '../../../components/admin/RichTextComposer'
import { toast } from '../../../components/kit/toast'
import { playNotificationSound, playWelcomeSound, setWelcomeSoundEnabled, welcomeSoundEnabled } from '../../../lib/sound'
import { useAppPath } from '../../../lib/basePath'

interface EventRow {
  event_key:string;label:string;category:string;description:string|null;audience:string
  in_app_enabled:number;email_enabled:number;desktop_enabled:number;sound_enabled:number
  subject:string|null;preheader:string|null;eyebrow:string|null;title:string|null;body_html:string|null;cta_label:string|null;template_enabled:number
}
interface NurtureSummary { status:string;count:number }
interface Delivery { id:string;email:string;full_name:string|null;step_key:string;sent_at:string;status:string }

export default function NotificationSettings() {
  const p = useAppPath()
  const[events,setEvents]=useState<EventRow[]>([])
  const[summary,setSummary]=useState<NurtureSummary[]>([])
  const[deliveries,setDeliveries]=useState<Delivery[]>([])
  const[editing,setEditing]=useState<EventRow|null>(null)
  const[loading,setLoading]=useState(true)
  const[busy,setBusy]=useState(false)
  const[desktopPermission,setDesktopPermission]=useState<string>(()=>typeof Notification==='undefined'?'unsupported':Notification.permission)
  const[welcomeSound,setWelcomeSound]=useState(()=>welcomeSoundEnabled())

  async function load(){
    setLoading(true)
    try{
      const[center,nurture]=await Promise.all([
        api.get<{events:EventRow[]}>('/admin/notification-center'),
        api.get<{summary:NurtureSummary[];deliveries:Delivery[]}>('/admin/nurture-campaign').catch(()=>({summary:[],deliveries:[]})),
      ])
      setEvents(center.events);setSummary(nurture.summary);setDeliveries(nurture.deliveries)
    }catch(err){toast.error(err instanceof ApiError?err.message:'Could not load the Notification Center.')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[])
  const groups=useMemo(()=>{const map=new Map<string,EventRow[]>();for(const e of events){if(!map.has(e.category))map.set(e.category,[]);map.get(e.category)!.push(e)}return[...map.entries()]},[events])
  function setEvent(key:string,field:'in_app_enabled'|'email_enabled'|'desktop_enabled'|'sound_enabled',checked:boolean){setEvents(rows=>rows.map(r=>r.event_key===key?{...r,[field]:checked?1:0}:r))}
  async function requestDesktop(){if(typeof Notification==='undefined')return toast.error('Desktop notifications are not supported in this browser.');const permission=await Notification.requestPermission();setDesktopPermission(permission);permission==='granted'?toast.success('Desktop notifications are enabled for this browser.'):toast.error('Desktop notification permission was not granted.')}
  function toggleWelcomeSound(value:boolean){setWelcomeSound(value);setWelcomeSoundEnabled(value);if(value)playWelcomeSound('staff')}
  async function savePreferences(){setBusy(true);try{await api.patch('/admin/notification-center/preferences',{preferences:events.map(e=>({event_key:e.event_key,in_app_enabled:!!e.in_app_enabled,email_enabled:!!e.email_enabled,desktop_enabled:!!e.desktop_enabled,sound_enabled:!!e.sound_enabled}))});toast.success('Notification channels saved.')}catch{toast.error('Could not save notification channels.')}finally{setBusy(false)}}
  async function saveTemplate(){if(!editing)return;setBusy(true);try{await api.patch(`/admin/notification-center/templates/${encodeURIComponent(editing.event_key)}`,{subject:editing.subject,preheader:editing.preheader,eyebrow:editing.eyebrow,title:editing.title,body_html:editing.body_html,cta_label:editing.cta_label,enabled:!!editing.template_enabled});const list=await api.get<{templates:{id:string;slug:string}[]}>('/admin/email-templates').catch(()=>({templates:[]}));const match=list.templates.find(t=>t.slug===`notify_${editing.event_key}`);if(match)await api.patch(`/admin/email-templates/${match.id}`,{subject:editing.subject||'{{event_subject}}',preheader:editing.preheader||'',eyebrow:editing.eyebrow||'',title:editing.title||'',body_html:editing.body_html||'{{event_body}}',cta_label:editing.cta_label||'',enabled:!!editing.template_enabled});toast.success('Email template saved.');setEditing(null);await load()}catch{toast.error('Could not save the email template.')}finally{setBusy(false)}}

  if(loading)return <p className="text-sm text-slate-400">Loading Notification Center…</p>
  return <div className="space-y-6">
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl"><p className="text-base font-bold text-white">Notification Experience</p><p className="mt-1 text-sm leading-6 text-slate-400">Choose how each event reaches you. Turning off a channel never removes the underlying activity or audit history.</p></div>
        <button onClick={savePreferences} disabled={busy} className={btnPrimary}>{busy?'Saving…':'Save Channels'}</button>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[.018] p-4"><p className="text-sm font-bold text-white">Browser Notifications</p><p className="mt-1 text-xs leading-5 text-slate-500">Current browser permission: <span className="font-bold text-slate-300">{desktopPermission}</span></p><button onClick={requestDesktop} className={`${btnOutline} mt-3 !px-3 !py-2 text-xs`} disabled={desktopPermission==='unsupported'}>{desktopPermission==='granted'?'Permission Granted':'Enable Browser Alerts'}</button></div>
        <div className="rounded-xl border border-white/10 bg-white/[.018] p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold text-white">Sign-In Welcome Sound</p><p className="mt-1 text-xs leading-5 text-slate-500">Play the Pinnacle welcome tone after a successful HQ sign-in on this device.</p></div><input aria-label="Welcome sound" type="checkbox" checked={welcomeSound} onChange={e=>toggleWelcomeSound(e.target.checked)} className="mt-1 h-4 w-4 accent-gold"/></div><div className="mt-3 flex gap-3"><button type="button" onClick={()=>playWelcomeSound('staff')} className="text-xs font-bold text-gold hover:text-gold-300">Test Welcome Tone</button><button type="button" onClick={()=>playNotificationSound('default')} className="text-xs font-bold text-gold hover:text-gold-300">Test Notification Tone</button></div></div>
      </div>
      <div className="mt-7 space-y-7">{groups.map(([category,rows])=><div key={category}><p className="mb-2 text-[11px] font-bold uppercase tracking-[.16em] text-gold">{category}</p><div className="divide-y divide-white/5 rounded-xl border border-white/10 px-4">{rows.map(e=><div key={e.event_key} className="grid gap-3 py-4 lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto_auto_auto] lg:items-center"><div><p className="text-sm font-bold text-white">{e.label}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{e.description}</p></div><Channel label="HQ Bell" checked={!!e.in_app_enabled} onChange={v=>setEvent(e.event_key,'in_app_enabled',v)}/><Channel label="Email" checked={!!e.email_enabled} onChange={v=>setEvent(e.event_key,'email_enabled',v)}/><Channel label="Browser" checked={!!e.desktop_enabled} onChange={v=>setEvent(e.event_key,'desktop_enabled',v)}/><Channel label="Sound" checked={!!e.sound_enabled} onChange={v=>setEvent(e.event_key,'sound_enabled',v)}/><button className="text-xs font-bold text-gold hover:text-gold-300" onClick={()=>setEditing({...e})}>Quick edit</button><Link to={`${p('messages')}?tab=templates&slug=notify_${e.event_key}`} className="text-xs font-bold text-gold hover:text-gold-300">Letter editor</Link></div>)}</div></div>)}</div>
    </Panel>

    <Panel><p className="text-base font-bold text-white">14-Day Client Discovery Campaign</p><p className="mt-1 text-sm leading-6 text-slate-400">New clients are enrolled automatically. The sequence introduces useful portal capabilities over time without turning onboarding into a sales wall.</p><div className="mt-4 flex flex-wrap gap-2">{summary.length?summary.map(s=><span key={s.status} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300"><strong className="text-white">{s.count}</strong> {s.status}</span>):<span className="text-xs text-slate-500">No clients enrolled yet.</span>}</div>{deliveries.length>0&&<div className="mt-5 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="pb-2 font-bold">Client</th><th className="pb-2 font-bold">Campaign Step</th><th className="pb-2 font-bold">Sent</th></tr></thead><tbody className="divide-y divide-white/5">{deliveries.slice(0,12).map(d=><tr key={d.id}><td className="py-2 text-slate-300">{d.full_name||d.email}</td><td className="py-2 text-slate-300">{d.step_key.replace(/_/g,' ')}</td><td className="py-2 text-slate-500">{new Date(d.sent_at).toLocaleString()}</td></tr>)}</tbody></table></div>}</Panel>

    {editing&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4" onMouseDown={()=>setEditing(null)}><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-navy-950 p-6 shadow-2xl" onMouseDown={e=>e.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Branded Event Email</p><h3 className="mt-1 text-xl font-bold text-white">{editing.label}</h3></div><button className={btnOutline} onClick={()=>setEditing(null)}>Close</button></div><p className="mt-3 text-xs leading-5 text-slate-500">Leave a field blank to use the event default. <code>{'{{event_body}}'}</code> inserts event details and <code>{'{{event_subject}}'}</code> inserts the generated subject.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Subject" value={editing.subject||''} onChange={v=>setEditing(x=>x&&({...x,subject:v}))}/><Field label="Preheader" value={editing.preheader||''} onChange={v=>setEditing(x=>x&&({...x,preheader:v}))}/><Field label="Eyebrow" value={editing.eyebrow||''} onChange={v=>setEditing(x=>x&&({...x,eyebrow:v}))}/><Field label="Headline" value={editing.title||''} onChange={v=>setEditing(x=>x&&({...x,title:v}))}/><div className="sm:col-span-2"><span className="mb-2 block text-sm font-bold text-slate-300">Body</span><div className="overflow-hidden rounded-md"><RichTextComposer value={editing.body_html||''} onChange={html=>setEditing(v=>v&&({...v,body_html:html}))} placeholder="Write the email body. {{event_body}} inserts the event details."/></div></div><label className="flex items-center gap-2 text-sm font-medium text-slate-300"><input type="checkbox" checked={!!editing.template_enabled} onChange={e=>setEditing(v=>v&&({...v,template_enabled:e.target.checked?1:0}))}/>Email template enabled</label></div><div className="mt-6 flex justify-end"><button onClick={saveTemplate} disabled={busy} className={btnPrimary}>{busy?'Saving…':'Save Template'}</button></div></div></div>}
  </div>
}
function Channel({label,checked,onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}){return <label className="flex items-center gap-2 text-xs font-semibold text-slate-300"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} className="h-4 w-4 accent-gold"/>{label}</label>}
function Field({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <label><span className="mb-2 block text-sm font-bold text-slate-300">{label}</span><input className="input" value={value} onChange={e=>onChange(e.target.value)}/></label>}
