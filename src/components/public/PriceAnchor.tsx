import { useEffect, useMemo, useState } from 'react'
import { offeringsFor, type ServiceOffering } from '../../data/serviceOfferings'

export function PriceAnchor({serviceKey,offeringPrefixes}:{serviceKey:string;offeringPrefixes?:string[]}){
  const [items,setItems]=useState<ServiceOffering[]>(()=>offeringsFor(serviceKey))
  useEffect(()=>{fetch(`/api/service-offerings?service_key=${encodeURIComponent(serviceKey)}`).then(r=>r.ok?r.json() as Promise<{offerings?:ServiceOffering[]}>:Promise.reject()).then(data=>{if(Array.isArray(data.offerings)&&data.offerings.length)setItems(data.offerings)}).catch(()=>{})},[serviceKey])
  const scoped=useMemo(()=>offeringPrefixes?.length?items.filter(item=>offeringPrefixes.some(prefix=>item.id.startsWith(prefix))):items,[items,offeringPrefixes])
  const prices=scoped.map(item=>item.startingPrice).filter((value):value is number=>typeof value==='number'&&Number.isFinite(value))
  const lowest=prices.length?Math.min(...prices):null
  const custom=scoped.some(item=>!item.startingPrice&&item.pricingLabel)
  if(!scoped.length)return null
  return <div className="mt-6 flex max-w-2xl items-start gap-3 border-l border-gold/45 pl-4"><div><p className="text-xs font-bold uppercase tracking-[.13em] text-gold">Pricing anchor</p><p className="mt-1 text-sm leading-6 text-slate-300">{lowest!==null?<>Defined services in this area start at <strong className="text-white">${lowest.toLocaleString()}</strong>.</>:custom?<>Typical work is <strong className="text-white">quoted after a short scope review</strong>.</>:<>Pricing is confirmed after scope review.</>} <span className="text-slate-500">Final price depends on access, location, urgency, size, complexity, third-party fees, and the work requested.</span></p></div></div>
}
