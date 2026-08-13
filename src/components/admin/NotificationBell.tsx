import { useCallback, useEffect, useRef } from 'react'
import { api } from '../../lib/api'
import { describeActivity, type ActivityEvent } from '../../lib/activity'
import { playNotificationSound, soundKindFor } from '../../lib/sound'

const POLL_MS = 3_000
interface EventPref {event_key:string;in_app_enabled:number;desktop_enabled:number;sound_enabled:number}

/** Plays sound and desktop alerts for new HQ activity. The visible bell is NotificationFeedPanel. */
export function NotificationBell() {
  const prefsRef=useRef<Map<string,EventPref>>(new Map())
  const prevCountRef=useRef(0)
  const latestSeenIdRef=useRef<string|null>(null)

  useEffect(()=>{api.get<{events:EventPref[]}>('/admin/notification-center').then(r=>{prefsRef.current=new Map((r.events||[]).map(v=>[v.event_key,v]))}).catch(()=>{})},[])

  const deliverLocal=useCallback((event:ActivityEvent)=>{
    const pref=prefsRef.current.get(event.kind)
    if(pref?.sound_enabled)playNotificationSound(soundKindFor(event.kind))
    if(pref?.desktop_enabled&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
      try{new Notification('Pinnacle HQ',{body:describeActivity(event),tag:`pmv-${event.id}`})}catch{/* browser policy */}
    }
  },[])

  const loadCount=useCallback(async()=>{
    try{
      const r=await api.get<{count:number}>('/admin/activity/unread-count')
      if(r.count>prevCountRef.current){
        try{const latest=await api.get<{events:ActivityEvent[]}>('/admin/activity');const event=latest.events[0];if(event&&event.id!==latestSeenIdRef.current){latestSeenIdRef.current=event.id;deliverLocal(event)}}catch{/* retry next poll */}
      }
      prevCountRef.current=r.count
    }catch{/* retry next poll */}
  },[deliverLocal])

  useEffect(()=>{loadCount();const timer=window.setInterval(loadCount,POLL_MS);const onFocus=()=>void loadCount();const onVisibility=()=>{if(document.visibilityState==='visible')void loadCount()};const onActivity=()=>void loadCount();const onRefresh=()=>void loadCount();window.addEventListener('focus',onFocus);window.addEventListener('pmv:activity',onActivity);window.addEventListener('pmv:refresh',onRefresh);document.addEventListener('visibilitychange',onVisibility);return()=>{window.clearInterval(timer);window.removeEventListener('focus',onFocus);window.removeEventListener('pmv:activity',onActivity);window.removeEventListener('pmv:refresh',onRefresh);document.removeEventListener('visibilitychange',onVisibility)}},[loadCount])

  return null
}
