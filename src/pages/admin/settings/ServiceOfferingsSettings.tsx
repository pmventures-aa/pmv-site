import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../../lib/api'
import { Panel, Tag, NoAccess, SkeletonTable } from '../../../components/admin/ui'
import { toast } from '../../../components/kit/toast'
import { OfferingCatalogSettings } from './OfferingCatalogSettings'

interface ServiceRow { key:string; name:string; category:string|null; active:number; question_count:number }

export default function ServiceOfferingsSettings(){
  const [services,setServices]=useState<ServiceRow[]>([])
  const [expanded,setExpanded]=useState<string|null>(null)
  const [loading,setLoading]=useState(true)
  const [forbidden,setForbidden]=useState(false)
  const load=useCallback(async()=>{setLoading(true);try{const res=await api.get<{services:ServiceRow[]}>('/admin/services');setServices(res.services)}catch(err){if(err instanceof ApiError&&err.status===403)setForbidden(true);else toast.error(err instanceof ApiError?err.message:'Could not load service offerings.')}finally{setLoading(false)}},[])
  useEffect(()=>{load()},[load])
  if(forbidden)return <NoAccess label="Service Offerings"/>
  return <div>
    <div className="mb-5 max-w-3xl"><h2 className="text-lg font-semibold text-white">One-time & project offerings</h2><p className="mt-2 text-sm leading-6 text-slate-400">Manage the retail service menu without a deployment. Public and client-facing pricing comes from this catalog. Provider payout guidance is internal to HQ and is never returned by customer-facing APIs.</p></div>
    {loading?<Panel><SkeletonTable rows={4} cols={2}/></Panel>:<div className="space-y-3">{services.map(service=><Panel key={service.key} className="!p-0"><button type="button" className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left" onClick={()=>setExpanded(v=>v===service.key?null:service.key)}><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-white">{service.name}</p><Tag tone={service.active?'green':'red'}>{service.active?'active':'retired'}</Tag>{service.category&&<Tag>{service.category}</Tag>}</div><p className="mt-1 text-xs text-slate-500">Retail menu, provider economics, required documents, and intake prompts</p></div><span className="text-sm text-gold">{expanded===service.key?'−':'＋'}</span></button>{expanded===service.key&&<OfferingCatalogSettings serviceKey={service.key}/>}</Panel>)}</div>}
  </div>
}
