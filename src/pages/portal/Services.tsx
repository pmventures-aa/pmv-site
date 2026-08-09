import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { Card, PageHeader, StatusBadge, EmptyState } from '../../components/ui'
import { useAppPath } from '../../lib/basePath'
import { displayValue, type IntakeValue } from '../../lib/intake'

interface CatalogItem { key:string; name:string; description:string; category:string; intake_intro?:string|null; estimated_minutes?:number }
interface Enrolled { service_key:string; name:string; status:string }
interface ApplicationAnswer { question_key:string; question_label:string; step_label:string|null; step_order:number; sort_order:number; value:IntakeValue }
interface Application { id:string; service_key:string; service_name:string; service_description:string|null; status:string; current_step:number; submission_source?:string; assigned_at?:string|null; submitted_at:string|null; created_at:string; updated_at:string; answers:ApplicationAnswer[] }

const STATUS_TONE:Record<string,'gold'|'green'|'blue'|'slate'|'red'>={draft:'gold',requested:'gold',submitted:'blue',in_review:'blue',approved:'green',active:'green',completed:'green',closed:'slate',declined:'red'}
const APPLICATION_LABEL:Record<string,string>={draft:'In progress',submitted:'Application received',in_review:'In review',approved:'Approved',declined:'Declined',closed:'Closed'}
const SERVICE_MODULE_LINKS:Record<string,{to:string;label:string}>={funding:{to:'funding',label:'Open funding workspace →'},property_management:{to:'property-management',label:'Open property workspace →'}}

export default function Services(){
  const p=useAppPath()
  const [catalog,setCatalog]=useState<CatalogItem[]>([])
  const [enrolled,setEnrolled]=useState<Enrolled[]>([])
  const [applications,setApplications]=useState<Application[]>([])
  const [loading,setLoading]=useState(true)

  const load=useCallback(async()=>{
    const[cat,mine,apps]=await Promise.all([
      api.get<{services:CatalogItem[]}>('/portal/services-catalog'),
      api.get<{services:Enrolled[]}>('/portal/services'),
      api.get<{applications:Application[]}>('/portal/service-applications'),
    ])
    setCatalog(cat.services);setEnrolled(mine.services);setApplications(apps.applications)
  },[])
  useEffect(()=>{load().finally(()=>setLoading(false))},[load])

  const enrolledKeys=useMemo(()=>new Set(enrolled.map((item)=>item.service_key)),[enrolled])
  const draftsByService=useMemo(()=>{const map=new Map<string,Application>();for(const app of applications)if(app.status==='draft'&&!map.has(app.service_key))map.set(app.service_key,app);return map},[applications])
  const available=useMemo(()=>catalog.filter((item)=>!enrolledKeys.has(item.key)),[catalog,enrolledKeys])
  const groupedAvailable=useMemo(()=>{
    const groups=new Map<string,CatalogItem[]>()
    for(const item of available){const key=item.category||'Other support';if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(item)}
    return [...groups.entries()]
  },[available])

  return <div>
    <PageHeader eyebrow="Your Pinnacle relationship" title="Services" subtitle="Keep current work easy to find. Additional services stay here to explore when they become relevant — there is no need to take everything on at once."/>

    <Card className="mb-6">
      <div className="mb-4"><h2 className="text-lg font-semibold text-white">What you’re already working on</h2><p className="mt-1 text-sm text-slate-400">Active and enrolled services stay at the top so the work in front of you comes before anything new.</p></div>
      {loading?<p className="text-sm text-slate-400">Loading…</p>:enrolled.length===0?<EmptyState label="No active services yet."/>:<ul className="divide-y divide-white/10 border-y border-white/10">{enrolled.map((item)=>{const link=SERVICE_MODULE_LINKS[item.service_key];return <li key={item.service_key} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><span className="block text-sm font-medium text-white">{item.name}</span>{link&&<Link to={p(link.to)} className="mt-1 inline-block text-xs text-gold hover:underline">{link.label}</Link>}</div><StatusBadge tone={STATUS_TONE[item.status]??'slate'}>{item.status.replace(/_/g,' ')}</StatusBadge></li>})}</ul>}
    </Card>

    {applications.length>0&&<Card className="mb-6">
      <div className="mb-4"><h2 className="text-lg font-semibold text-white">Applications & requests</h2><p className="mt-1 text-sm text-slate-400">Resume something you started or review what Pinnacle has already received.</p></div>
      <div className="divide-y divide-white/10 border-y border-white/10">{applications.map((app)=>{
        const assigned=app.status==='draft'&&app.submission_source==='staff_assigned'
        return <div key={app.id} className="py-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-white">{app.service_name}</p>{assigned&&<span className="text-[10px] font-semibold uppercase tracking-wide text-gold">Requested by Pinnacle</span>}</div><p className="mt-1 text-xs text-slate-500">{app.status==='draft'?(assigned?'Your Pinnacle team started this with you. Review the details before submitting.':`Last saved ${new Date(app.updated_at).toLocaleString()}`):`Submitted ${new Date(app.submitted_at||app.created_at).toLocaleString()}`}</p></div><div className="flex items-center gap-2"><StatusBadge tone={STATUS_TONE[app.status]??'slate'}>{APPLICATION_LABEL[app.status]??app.status.replace(/_/g,' ')}</StatusBadge>{app.status==='draft'&&<Link to={p(`services/${app.service_key}/apply`)} className={`!px-3 !py-1.5 text-xs ${assigned?'btn-gold':'btn-outline'}`}>{assigned?'Review':'Resume'}</Link>}</div></div>
          {app.status!=='draft'&&app.answers.length>0&&<details className="mt-3 border-l border-white/10 pl-4"><summary className="cursor-pointer select-none text-xs font-medium text-gold">Review submitted answers</summary><dl className="mt-3 space-y-2.5">{app.answers.filter((answer)=>!answer.question_key.startsWith('__pmv_signature_')).map((answer)=><div key={`${app.id}-${answer.question_key}`} className="grid gap-0.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-4"><dt className="text-xs text-slate-500">{answer.question_label}</dt><dd className="whitespace-pre-wrap text-sm text-slate-200">{displayValue(answer.value).replace('|',' · ')}</dd></div>)}</dl></details>}
        </div>})}</div>
    </Card>}

    <Card>
      <div className="max-w-2xl"><p className="eyebrow">Discover as you need it</p><h2 className="mt-1 text-lg font-semibold text-white">Other ways Pinnacle can help</h2><p className="mt-1 text-sm leading-6 text-slate-400">Browse without pressure. Starting an application only gathers context for that service; it does not lock you into a package.</p></div>
      {groupedAvailable.length===0&&!loading?<p className="mt-5 text-sm text-slate-500">You’re already enrolled in every currently available service.</p>:<div className="mt-6 space-y-7">{groupedAvailable.map(([category,items])=><section key={category}><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{category.replace(/_/g,' ')}</h3><div className="divide-y divide-white/10 border-y border-white/10">{items.map((item)=>{const draft=draftsByService.get(item.key);return <div key={item.key} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="max-w-2xl"><p className="text-sm font-medium text-white">{item.name}</p><p className="mt-1 text-xs leading-5 text-slate-400">{item.description}</p>{item.estimated_minutes&&<p className="mt-1 text-[11px] text-slate-500">About {item.estimated_minutes} minutes if you decide to apply</p>}</div><Link to={p(`services/${item.key}/apply`)} className="shrink-0 text-sm font-medium text-gold hover:underline">{draft?'Resume':'Learn more & start'} →</Link></div>})}</div></section>)}</div>}
    </Card>
  </div>
}
