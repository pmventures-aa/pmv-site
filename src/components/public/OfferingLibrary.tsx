import { useEffect, useMemo, useState } from 'react'
import { offeringsFor, type ServiceOffering } from '../../data/serviceOfferings'

interface LiveOffering extends ServiceOffering {
  requiredDocuments?: string[]
  intakePrompts?: string[]
  sortOrder?: number
}

type OfferingResponse = { offerings?: LiveOffering[] }

export function OfferingLibrary({ serviceKey, offeringPrefixes }: { serviceKey: string; offeringPrefixes?: string[] }) {
  const [offerings,setOfferings]=useState<LiveOffering[]>(()=>offeringsFor(serviceKey))
  const [query, setQuery] = useState('')

  useEffect(()=>{
    let active=true
    fetch(`/api/service-offerings?service_key=${encodeURIComponent(serviceKey)}`)
      .then(async(res)=>{
        if(!res.ok) throw new Error('load failed')
        return await res.json() as OfferingResponse
      })
      .then((data)=>{if(active&&Array.isArray(data.offerings)&&data.offerings.length)setOfferings(data.offerings)})
      .catch(()=>{})
    return()=>{active=false}
  },[serviceKey])

  const scopedOfferings = useMemo(() => offeringPrefixes?.length ? offerings.filter((item) => offeringPrefixes.some((prefix) => item.id.startsWith(prefix))) : offerings, [offerings, offeringPrefixes])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return scopedOfferings
    return scopedOfferings.filter((item) => `${item.name} ${item.description} ${item.badge || ''}`.toLowerCase().includes(q))
  }, [scopedOfferings, query])

  if (!offerings.length) return null
  const prices=scopedOfferings.map(item=>item.startingPrice).filter((value):value is number=>typeof value==='number'&&Number.isFinite(value))
  const lowest=prices.length?Math.min(...prices):null

  return <section className="mt-14 border-t border-white/10 pt-10">
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="eyebrow">Service menu</p>
        <h2 className="mt-2 font-display text-2xl font-medium text-white sm:text-3xl">Choose a defined service or start with the situation</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">These are common one-time and project scopes. Pricing shown is a starting point for standard local assignments; access, distance, urgency, size, complexity, third-party fees, or an expanded scope can change the final quote.</p>
        {lowest!==null&&<p className="mt-2 text-sm text-slate-300">Defined options in this area start at <strong className="text-white">${lowest.toLocaleString()}</strong>.</p>}
      </div>
      {scopedOfferings.length > 10 && <label className="w-full sm:w-72"><span className="sr-only">Search services</span><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search this service menu…" className="w-full rounded-md border border-white/10 bg-white/[.03] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-gold/50 focus:outline-none"/></label>}
    </div>

    <div className="mt-7 divide-y divide-white/10 border-y border-white/10">
      {visible.map((item) => {
        const requestUrl = `/scope-request?entry=${encodeURIComponent(serviceKey.replace(/_/g,'-'))}&service=${encodeURIComponent(serviceKey)}&offering=${encodeURIComponent(item.id)}&source=service-offering`
        return <article key={item.id} className="grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-8">
          <div>
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-white">{item.name}</h3>{item.badge&&<span className="rounded-full border border-gold/25 bg-gold/[.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">{item.badge}</span>}</div>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-400">{item.description}</p>
            {item.requirements?.length ? <p className="mt-2 text-xs text-slate-500">Typical starting information: {item.requirements.join(' · ')}</p> : null}
            {item.requiredDocuments?.length ? <p className="mt-2 text-xs text-slate-500">Documents commonly required: {item.requiredDocuments.join(' · ')}</p> : null}
            {item.intakePrompts?.length ? <p className="mt-2 text-xs text-slate-500">We’ll also ask about: {item.intakePrompts.join(' · ')}</p> : null}
            {item.note&&<p className="mt-2 text-xs leading-5 text-slate-500">{item.note}</p>}
          </div>
          <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
            <p className="whitespace-nowrap text-sm font-semibold text-white">{item.pricingLabel || (item.startingPrice ? `From $${item.startingPrice}` : 'Custom quote')}</p>
            <a href={requestUrl} className="text-sm font-medium text-gold hover:underline">Scope this service →</a>
          </div>
        </article>
      })}
      {visible.length===0&&<div className="py-8 text-sm text-slate-500">No services match that search.</div>}
    </div>
  </section>
}
