import { useEffect, useMemo, useState } from 'react'
import { ViewTransitionLink } from './ViewTransitionLink'

type CaseStudy={id:string;service_key:string|null;guide_slug:string|null;audience:string|null;headline:string;outcome:string;timeline_label:string;redacted_location:string|null;image_url:string|null;image_alt:string|null}
type Metrics={properties_served:number;jobs_completed:number;average_response_minutes:number|null;states_covered:number}
type ProofResponse={case_studies:CaseStudy[];metrics:Metrics}

function useProof(serviceKey?:string,audience?:string){
  const [data,setData]=useState<ProofResponse|null>(null)
  useEffect(()=>{const query=new URLSearchParams();if(serviceKey)query.set('service_key',serviceKey);if(audience)query.set('audience',audience);fetch(`/api/public-proof?${query}`).then(r=>r.ok?r.json() as Promise<ProofResponse>:Promise.reject()).then(setData).catch(()=>{})},[serviceKey,audience])
  return data
}
const compactTime=(minutes:number)=>minutes<60?`${minutes} min`:`${Math.round(minutes/6)/10} hr`

export function PublicMetricsBand(){
  const data=useProof();const metrics=data?.metrics
  const items=useMemo(()=>metrics?[{value:metrics.properties_served,label:'properties in the client system'},{value:metrics.jobs_completed,label:'documented field jobs completed'},{value:metrics.average_response_minutes,label:'average first response',format:'time'},{value:metrics.states_covered,label:'states with completed field work'}].filter(item=>Number(item.value)>0):[],[metrics])
  if(!items.length)return null
  return <section className="border-y border-gold/15 bg-gold/[.035]" aria-label="Verified Pinnacle service numbers"><div className="container-pmv grid divide-y divide-white/10 py-2 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">{items.map(item=><div key={item.label} className="px-5 py-7 first:pl-0"><strong className="font-display text-3xl font-bold text-white">{item.format==='time'?compactTime(Number(item.value)):Number(item.value).toLocaleString()}</strong><p className="mt-1 text-[11px] font-semibold uppercase tracking-[.12em] text-slate-500">{item.label}</p></div>)}</div></section>
}

export function CaseStudyStrip({serviceKey,audience,className=''}:{serviceKey?:string;audience?:string;className?:string}){
  const data=useProof(serviceKey,audience);const cases=data?.case_studies||[]
  if(!cases.length)return null
  return <section id="proof" className={className}><div className="container-pmv py-14 sm:py-18"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Selected work</p><h2 className="mt-3 font-display text-3xl font-bold tracking-[-.03em] text-white">Real assignments. Clear outcomes.</h2></div><p className="max-w-md text-xs leading-5 text-slate-500">Published only after privacy review. Locations and identifying details are redacted.</p></div><div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{cases.map(item=><article key={item.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/[.025]">{item.image_url&&<div className="relative h-36 overflow-hidden bg-navy-900"><img src={item.image_url} alt={item.image_alt||''} className="h-full w-full object-cover" loading="lazy"/><span className="absolute bottom-2 left-2 rounded bg-navy-950/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">Address redacted</span></div>}<div className="p-5"><div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[.12em] text-gold"><span>{item.timeline_label}</span><span className="text-slate-500">{item.redacted_location||'Location withheld'}</span></div><h3 className="mt-3 text-base font-bold text-white">{item.headline}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{item.outcome}</p>{item.guide_slug&&<ViewTransitionLink to={`/projects/${item.guide_slug}`} className="mt-4 inline-block text-xs font-bold text-gold">See the project guide →</ViewTransitionLink>}</div></article>)}</div></div></section>
}
