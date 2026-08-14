import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldAlert, Monitor, Globe, MapPin, Wifi, Clock3 } from 'lucide-react'
import { api } from '../../lib/api'
import { PageIntro, Panel, EmptyState, NoAccess, inputCls, btnOutline, SkeletonTable } from '../../components/admin/ui'
import { useCapabilities } from '../../lib/capabilities'
import { timeAgo, isSecurityKind } from '../../lib/activity'
import { useAppPath } from '../../lib/basePath'

interface AuditEntry {
  id: string
  actor_user_id: string | null
  actor_name: string | null
  actor_email: string | null
  actor_ip: string | null
  actor_user_agent: string | null
  actor_city: string | null
  actor_region: string | null
  actor_country: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  created_at: string
}

const PAGE_SIZE = 50
const SECURITY_ACTIONS = new Set<string>(['login','logout','login_failed','password_changed','password_reset','identity_linked','identity_unlinked','identity_link_failed','permission_changed','user_created','record_archived','record_restored','record_permanently_deleted'])
function isSecurityAction(action: string): boolean { return SECURITY_ACTIONS.has(action) || isSecurityKind(action) }

function describeAction(entry: AuditEntry): string {
  const who = entry.actor_name || entry.actor_email || 'System'
  const what = entry.entity_type ? entry.entity_type.replace(/_/g, ' ') : 'a record'
  switch (entry.action) {
    case 'login': return `${who} signed in`
    case 'logout': return `${who} signed out`
    case 'login_failed': return `Failed sign-in attempt (${entry.actor_email || 'unknown user'})`
    case 'identity_linked': return `${who} connected a sign-in method`
    case 'identity_unlinked': return `${who} removed a sign-in method`
    case 'identity_link_failed': return `Failed sign-in method connection`
    case 'password_changed': return `${who} changed their password`
    case 'password_reset': return `${who} triggered a password reset`
    case 'record_created': return `${who} created ${what}`
    case 'record_updated': return `${who} updated ${what}`
    case 'record_archived': return `${who} archived ${what}`
    case 'record_restored': return `${who} restored ${what}`
    case 'record_permanently_deleted': return `${who} permanently deleted ${what}`
    case 'status_changed': return `${who} changed status on ${what}`
    case 'permission_changed': return `${who} changed permissions`
    case 'client_converted': return `${who} converted a lead to a client`
    case 'file_uploaded': return `${who} uploaded a file`
    case 'email_sent': return `${who} sent an email`
    default: return `${who} · ${entry.action.replace(/_/g, ' ')} (${what})`
  }
}

function formatLocation(entry: AuditEntry): string {
  return [entry.actor_city, entry.actor_region, entry.actor_country].filter(Boolean).join(', ')
}

type Fingerprint = { rawUa:string; browser:string; os:string; device:string; mobile:string; model:string; platform:string; language:string; timezone:string; postal:string; latitude:string; longitude:string; colo:string; asn:string; network:string }
function parseFingerprint(value: string | null): Fingerprint {
  const [rawUa = '', suffix = ''] = (value || '').split(' | PMV:')
  const meta: Record<string,string> = {}
  suffix.split(';').forEach((pair) => { const i = pair.indexOf('='); if (i > 0) meta[pair.slice(0,i)] = pair.slice(i+1) })
  let browser = 'Unknown browser'
  const browserVersion = rawUa.match(/Edg\/([\d.]+)/)?.[1] || rawUa.match(/Chrome\/([\d.]+)/)?.[1] || rawUa.match(/Firefox\/([\d.]+)/)?.[1] || rawUa.match(/Version\/([\d.]+).*Safari/)?.[1] || ''
  if (/Edg\//.test(rawUa)) browser = 'Edge'
  else if (/Chrome\//.test(rawUa) && !/Chromium/.test(rawUa)) browser = 'Chrome'
  else if (/Firefox\//.test(rawUa)) browser = 'Firefox'
  else if (/Safari\//.test(rawUa) && !/Chrome/.test(rawUa)) browser = 'Safari'
  if (browserVersion) browser += ` ${browserVersion}`
  let os = ''
  const ios = rawUa.match(/(?:iPhone OS|CPU OS) ([\d_]+)/)?.[1]?.replace(/_/g,'.')
  const android = rawUa.match(/Android ([\d.]+)/)?.[1]
  const windows = rawUa.match(/Windows NT ([\d.]+)/)?.[1]
  const mac = rawUa.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g,'.')
  if (ios) os = `iOS ${ios}`
  else if (android) os = `Android ${android}`
  else if (windows) os = `Windows ${windows}`
  else if (mac) os = `macOS ${mac}`
  else if (/Linux/.test(rawUa)) os = 'Linux'
  let device = 'Desktop / laptop'
  if (/iPhone/.test(rawUa)) device = 'iPhone'
  else if (/iPad/.test(rawUa)) device = 'iPad'
  else if (/Android/.test(rawUa) && /Mobile/.test(rawUa)) device = 'Android phone'
  else if (/Android/.test(rawUa)) device = 'Android tablet / device'
  const androidModel = rawUa.match(/Android [^;]+;\s*([^;)]+?)(?: Build|\)|;)/)?.[1]?.trim() || ''
  return { rawUa, browser, os, device, mobile:meta.mobile||'', model:meta.model||androidModel, platform:meta.platform||'', language:meta.language||'', timezone:meta.timezone||'', postal:meta.postal||'', latitude:meta.latitude||'', longitude:meta.longitude||'', colo:meta.colo||'', asn:meta.asn||'', network:meta.network||'' }
}

export default function AuditLogAdmin() {
  const caps = useCapabilities(); const p = useAppPath()
  const [entries,setEntries]=useState<AuditEntry[]>([]); const [actions,setActions]=useState<string[]>([])
  const [filters,setFilters]=useState({action:'',entity_type:'',from:'',to:'',security_only:false,search:''})
  const [loading,setLoading]=useState(true); const [loadingMore,setLoadingMore]=useState(false); const [loadError,setLoadError]=useState(false); const [hasMore,setHasMore]=useState(true)
  const query=useCallback((before?:string)=>{const params=new URLSearchParams();if(filters.action)params.set('action',filters.action);if(filters.entity_type)params.set('entity_type',filters.entity_type);if(filters.from)params.set('from',`${filters.from} 00:00:00`);if(filters.to)params.set('to',`${filters.to} 23:59:59`);if(before)params.set('before',before);params.set('limit',String(PAGE_SIZE));return params.toString()},[filters.action,filters.entity_type,filters.from,filters.to])
  const load=useCallback(async(silent=false)=>{if(!silent)setLoading(true);try{const res=await api.get<{entries:AuditEntry[]}>(`/admin/audit-log?${query()}`);setEntries(res.entries);setHasMore(res.entries.length===PAGE_SIZE);setLoadError(false)}catch{setLoadError(true)}finally{if(!silent)setLoading(false)}},[query])
  useEffect(()=>{load();api.get<{actions:string[]}>('/admin/audit-log/actions').then(r=>setActions(r.actions)).catch(()=>{});const refresh=()=>void load(true);window.addEventListener('pmv:refresh',refresh);return()=>window.removeEventListener('pmv:refresh',refresh)},[load])
  async function loadMore(){if(!entries.length)return;setLoadingMore(true);try{const res=await api.get<{entries:AuditEntry[]}>(`/admin/audit-log?${query(entries[entries.length-1].created_at)}`);setEntries(cur=>[...cur,...res.entries]);setHasMore(res.entries.length===PAGE_SIZE)}finally{setLoadingMore(false)}}
  function exportUrl(){return `/api/admin/audit-log/export.csv?${query()}`}
  const visible=useMemo(()=>{const term=filters.search.trim().toLowerCase();return entries.filter(entry=>{if(filters.security_only&&!isSecurityAction(entry.action))return false;if(!term)return true;const fp=parseFingerprint(entry.actor_user_agent);return [entry.action,entry.actor_name,entry.actor_email,entry.entity_type,entry.entity_id,entry.actor_ip,formatLocation(entry),entry.actor_user_agent,fp.browser,fp.os,fp.device,fp.model,fp.timezone,fp.postal,fp.network,fp.asn].filter(Boolean).join(' ').toLowerCase().includes(term)})},[entries,filters.search,filters.security_only])
  const securityCount=useMemo(()=>entries.filter(e=>isSecurityAction(e.action)).length,[entries])
  if(!caps.loading&&!caps.can_view_audit_log)return <div><PageIntro kicker="Compliance" title="Audit Log"/><NoAccess label="the Audit Log"/></div>
  return <div>
    <PageIntro kicker="Compliance" title="Audit Log" subtitle="Security and record activity with device, network, IP, and approximate location context." action={<a href={exportUrl()} className={btnOutline} download>Export CSV</a>}/>
    <Panel className="mb-5"><div className="grid gap-3 sm:grid-cols-4"><label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Action</span><select className={inputCls} value={filters.action} onChange={e=>setFilters(f=>({...f,action:e.target.value}))}><option value="">All actions</option>{actions.map(a=><option key={a} value={a}>{a.replace(/_/g,' ')}</option>)}</select></label><label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Entity type</span><input className={inputCls} placeholder="e.g. matters" value={filters.entity_type} onChange={e=>setFilters(f=>({...f,entity_type:e.target.value}))}/></label><label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">From</span><input className={inputCls} type="date" value={filters.from} onChange={e=>setFilters(f=>({...f,from:e.target.value}))}/></label><label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">To</span><input className={inputCls} type="date" value={filters.to} onChange={e=>setFilters(f=>({...f,to:e.target.value}))}/></label></div><div className="mt-3 flex flex-wrap items-center gap-3"><input className={`${inputCls} min-w-[200px] flex-1`} type="search" placeholder="Search actor, IP, device, city, network…" value={filters.search} onChange={e=>setFilters(f=>({...f,search:e.target.value}))}/><button type="button" onClick={()=>setFilters(f=>({...f,security_only:!f.security_only}))} className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition ${filters.security_only?'border-rose-500/60 bg-rose-500/15 text-rose-200':'border-rose-500/30 text-rose-300 hover:border-rose-500/60'}`}><ShieldAlert size={13}/> Security only {securityCount>0&&<span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px]">{securityCount}</span>}</button></div></Panel>
    {loading?<Panel><SkeletonTable rows={6} cols={1}/></Panel>:loadError?<div className="space-y-2 text-sm text-slate-400"><p>Couldn't load the audit log.</p><button onClick={()=>load()} className="text-gold hover:underline">Try again</button></div>:visible.length===0?<Panel><EmptyState label="No audit events match these filters."/></Panel>:<><Panel className="divide-y divide-white/5 !p-0">{visible.map(entry=>{const security=isSecurityAction(entry.action);const location=formatLocation(entry);const fp=parseFingerprint(entry.actor_user_agent);const coordinates=fp.latitude&&fp.longitude?`${fp.latitude}, ${fp.longitude}`:'';return <div key={entry.id} className={`px-5 py-4 ${security?'border-l-2 border-l-rose-500/70 bg-rose-500/[.04]':''}`}><div className="flex items-start gap-2">{security&&<ShieldAlert size={14} className="mt-1 shrink-0 text-rose-400"/>}<div className="min-w-0 flex-1"><p className={`text-sm ${security?'font-medium text-rose-100':'text-slate-200'}`}>{describeAction(entry)}</p><div className="mt-2 grid gap-1.5 text-xs text-slate-500 sm:grid-cols-2 xl:grid-cols-3"><span>{timeAgo(entry.created_at)}</span>{location&&<span className="inline-flex items-center gap-1"><MapPin size={11}/>{location}{fp.postal?` ${fp.postal}`:''}</span>}{coordinates&&<span className="inline-flex items-center gap-1"><MapPin size={11}/>{coordinates} <em className="not-italic text-slate-600">approx.</em></span>}{entry.actor_ip&&<span className="inline-flex items-center gap-1"><Globe size={11}/>{entry.actor_ip}</span>}<span className="inline-flex items-center gap-1" title={fp.rawUa}><Monitor size={11}/>{fp.device}{fp.model?` · ${fp.model}`:''} · {fp.browser}{fp.os?` · ${fp.os}`:''}</span>{(fp.network||fp.asn||fp.colo)&&<span className="inline-flex items-center gap-1"><Wifi size={11}/>{fp.network||'Network'}{fp.asn?` · ASN ${fp.asn}`:''}{fp.colo?` · CF ${fp.colo}`:''}</span>}{(fp.timezone||fp.language||fp.platform)&&<span className="inline-flex items-center gap-1"><Clock3 size={11}/>{[fp.timezone,fp.language,fp.platform].filter(Boolean).join(' · ')}</span>}{entry.actor_user_id&&<Link to={p('users')} className="text-slate-400 hover:text-gold hover:underline">Actor profile</Link>}{entry.entity_id&&entry.entity_type==='client'&&<Link to={p(`clients/${entry.entity_id}`)} className="text-gold hover:underline">Open client</Link>}</div></div></div></div>})}</Panel>{hasMore&&<div className="mt-4 text-center"><button onClick={loadMore} disabled={loadingMore} className={`${btnOutline} disabled:opacity-60`}>{loadingMore?'Loading…':'Load more'}</button></div>}</>}
  </div>
}
