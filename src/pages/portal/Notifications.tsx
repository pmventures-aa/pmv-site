import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { Card, PageHeader, EmptyState, SkeletonRows } from '../../components/ui'
import { describeActivity, timeAgo, type ActivityEvent } from '../../lib/activity'

interface Preference { event_key:string;label:string;category:string;description:string|null;in_app_enabled:number;email_enabled:number }
interface Nurture { status:string;enrolled_at:string;next_step:number;last_sent_at:string|null }

export default function Notifications() {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [prefs,setPrefs]=useState<Preference[]>([])
  const [nurture,setNurture]=useState<Nurture|null>(null)
  const [calendarInvites,setCalendarInvites]=useState<boolean|null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,setSaving]=useState(false)

  useEffect(() => {
    Promise.all([
      api.get<{ events: ActivityEvent[] }>('/portal/notifications'),
      api.get<{ events:Preference[];nurture:Nurture|null }>('/portal/notification-preferences'),
    ]).then(([notifications,preferences])=>{setEvents(notifications.events);setPrefs(preferences.events);setNurture(preferences.nurture)}).finally(() => setLoading(false))
    api.get<{ enabled:boolean }>('/me/calendar-invites').then(r=>setCalendarInvites(r.enabled)).catch(()=>{})
    api.post('/portal/notifications/mark-seen').catch(() => {})
  }, [])

  async function toggleCalendarInvites(){
    const next=!(calendarInvites??true)
    setCalendarInvites(next)
    try{await api.patch('/me/calendar-invites',{enabled:next})}catch{setCalendarInvites(!next)}
  }

  const groups=useMemo(()=>{const map=new Map<string,Preference[]>();for(const p of prefs){if(!map.has(p.category))map.set(p.category,[]);map.get(p.category)!.push(p)}return [...map.entries()]},[prefs])
  function toggle(key:string,field:'in_app_enabled'|'email_enabled'){setPrefs(rows=>rows.map(p=>p.event_key===key?{...p,[field]:p[field]?0:1}:p))}
  async function save(){setSaving(true);try{await api.patch('/portal/notification-preferences',{preferences:prefs.map(p=>({event_key:p.event_key,in_app_enabled:!!p.in_app_enabled,email_enabled:!!p.email_enabled}))})}finally{setSaving(false)}}
  async function setCampaign(status:'active'|'paused'|'unsubscribed'){setSaving(true);try{await api.patch('/portal/notification-preferences',{nurture_status:status});setNurture(n=>n?{...n,status}:n)}finally{setSaving(false)}}

  return (
    <div>
      <PageHeader eyebrow="Updates" title="Notifications" subtitle="Delivery preferences and recent activity." />
      {loading ? <Card><SkeletonRows rows={5} cols={3} /></Card> : <>
        <Card className="mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-white">How should we keep you updated?</h2><p className="mt-0.5 max-w-2xl text-xs text-slate-400">Portal, email, or both. Required account notices can still send.</p></div><button disabled={saving} onClick={save} className="btn-gold">{saving?'Saving…':'Save preferences'}</button></div>
          <div className="mt-5 space-y-5">{groups.map(([category,rows])=><div key={category}><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-gold">{category}</p><div className="divide-y divide-white/5 border-y border-white/10">{rows.map(p=><div key={p.event_key} className="grid gap-3 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="text-sm font-medium text-white">{p.label}</p><p className="mt-0.5 text-xs text-slate-500">{p.description}</p></div><label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={!!p.in_app_enabled} onChange={()=>toggle(p.event_key,'in_app_enabled')}/>Portal</label><label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={!!p.email_enabled} onChange={()=>toggle(p.event_key,'email_enabled')}/>Email</label></div>)}</div></div>)}</div>
          {nurture&&<div className="mt-6 border-t border-white/10 pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium text-white">Pinnacle discovery emails</p><p className="mt-1 text-xs leading-5 text-slate-500">A short two-week welcome series that helps you discover services and portal tools at your own pace. Current status: <span className="text-slate-300">{nurture.status}</span>.</p></div><div className="flex gap-2">{nurture.status==='active'?<button className="btn-outline" disabled={saving} onClick={()=>setCampaign('paused')}>Pause</button>:<button className="btn-outline" disabled={saving} onClick={()=>setCampaign('active')}>Resume</button>}<button className="text-xs text-slate-500 hover:text-white" disabled={saving} onClick={()=>setCampaign('unsubscribed')}>Stop series</button></div></div></div>}
        </Card>

        <Card className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Calendar invites</h2>
              <p className="mt-0.5 max-w-2xl text-xs text-slate-400">Attach a standard calendar invite (.ics) to your appointment emails so requests and confirmations drop straight into your calendar. Updates and cancellations sync automatically.</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={calendarInvites??true} onChange={toggleCalendarInvites} />
              {(calendarInvites??true) ? 'On' : 'Off'}
            </label>
          </div>
        </Card>

        <h2 className="mb-2 text-sm font-semibold text-white">Recent updates</h2>
        {events.length === 0 ? <Card><EmptyState label="Nothing yet: you'll see updates here as your work progresses." /></Card> : <Card className="divide-y divide-white/5 !p-0">{events.map((e) => <div key={e.id} className="px-3 py-2.5 text-sm"><p className="text-slate-200">{describeActivity(e)}</p><p className="mt-0.5 text-xs text-slate-500">{timeAgo(e.created_at)}</p></div>)}</Card>}
      </>}
    </div>
  )
}
