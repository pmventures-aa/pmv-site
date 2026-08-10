import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../../lib/api'
import { inputCls, btnOutline, btnPrimary, Tag, EmptyState } from '../../../components/admin/ui'
import { toast } from '../../../components/kit/toast'

export interface OfferingRow {
  id:string
  serviceKey:string
  name:string
  description:string
  startingPrice?:number
  pricingLabel?:string
  badge?:string
  requirements:string[]
  note?:string
  requiredDocuments:string[]
  intakePrompts:string[]
  sortOrder:number
  active:boolean
  providerPayoutMin:number|null
  providerPayoutMax:number|null
  providerPayoutNotes:string
}

const listText=(items:string[])=>items.join('\n')
const lines=(raw:string)=>raw.split(/\n|,/).map((value)=>value.trim()).filter(Boolean)

function OfferingEditor({row,onChanged}:{row:OfferingRow;onChanged:()=>void}){
  const [open,setOpen]=useState(false)
  const [busy,setBusy]=useState(false)
  const [form,setForm]=useState({
    name:row.name,description:row.description,startingPrice:row.startingPrice?.toString()||'',pricingLabel:row.pricingLabel||'',badge:row.badge||'',note:row.note||'',
    requirements:listText(row.requirements),requiredDocuments:listText(row.requiredDocuments),intakePrompts:listText(row.intakePrompts),sortOrder:String(row.sortOrder||0),
    providerPayoutMin:row.providerPayoutMin?.toString()||'',providerPayoutMax:row.providerPayoutMax?.toString()||'',providerPayoutNotes:row.providerPayoutNotes||'',active:row.active,
  })
  useEffect(()=>setForm({name:row.name,description:row.description,startingPrice:row.startingPrice?.toString()||'',pricingLabel:row.pricingLabel||'',badge:row.badge||'',note:row.note||'',requirements:listText(row.requirements),requiredDocuments:listText(row.requiredDocuments),intakePrompts:listText(row.intakePrompts),sortOrder:String(row.sortOrder||0),providerPayoutMin:row.providerPayoutMin?.toString()||'',providerPayoutMax:row.providerPayoutMax?.toString()||'',providerPayoutNotes:row.providerPayoutNotes||'',active:row.active}),[row])
  async function save(){setBusy(true);try{await api.patch(`/admin/service-offerings/${row.id}`,{name:form.name,description:form.description,starting_price:form.startingPrice===''?null:Number(form.startingPrice),pricing_label:form.pricingLabel||null,badge:form.badge||null,client_note:form.note||null,requirements:lines(form.requirements),required_documents:lines(form.requiredDocuments),intake_prompts:lines(form.intakePrompts),sort_order:Number(form.sortOrder)||0,provider_payout_min:form.providerPayoutMin===''?null:Number(form.providerPayoutMin),provider_payout_max:form.providerPayoutMax===''?null:Number(form.providerPayoutMax),provider_payout_notes:form.providerPayoutNotes||null,active:form.active});toast.success('Offering saved.');onChanged()}catch(err){toast.error(err instanceof ApiError?err.message:'Could not save offering.')}finally{setBusy(false)}}
  async function remove(){if(!window.confirm(`Delete ${row.name}?`))return;try{await api.del(`/admin/service-offerings/${row.id}`);toast.success('Offering deleted.');onChanged()}catch{toast.error('Could not delete offering.')}}
  return <div className="rounded-xl border border-white/10 bg-navy-950/55">
    <button type="button" onClick={()=>setOpen(v=>!v)} className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-white">{row.name}</p><Tag tone={row.active?'green':'red'}>{row.active?'active':'hidden'}</Tag>{row.badge&&<Tag tone="gold">{row.badge}</Tag>}</div><p className="mt-1 text-xs text-slate-500">{row.pricingLabel || (row.startingPrice?`From $${row.startingPrice}`:'Custom quote')}{row.providerPayoutMin!=null?` · internal payout from $${row.providerPayoutMin}`:''}</p></div><span className="text-xs font-medium text-gold">{open?'Close':'Edit'}</span></button>
    {open&&<div className="grid gap-3 border-t border-white/10 p-4 sm:grid-cols-2">
      <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Offering name</span><input className={inputCls} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></label>
      <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Badge</span><input className={inputCls} placeholder="Licensed professional" value={form.badge} onChange={e=>setForm(f=>({...f,badge:e.target.value}))}/></label>
      <label className="sm:col-span-2"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Client description</span><textarea className={`${inputCls} min-h-[76px]`} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></label>
      <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Starting retail price</span><input className={inputCls} type="number" min="0" step="0.01" value={form.startingPrice} onChange={e=>setForm(f=>({...f,startingPrice:e.target.value}))}/></label>
      <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Public pricing label</span><input className={inputCls} placeholder="Starting at $149" value={form.pricingLabel} onChange={e=>setForm(f=>({...f,pricingLabel:e.target.value}))}/></label>
      <label className="sm:col-span-2"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Client scope / disclaimer note</span><textarea className={`${inputCls} min-h-[64px]`} value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/></label>
      <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Starting information</span><textarea className={`${inputCls} min-h-[100px]`} placeholder="One item per line" value={form.requirements} onChange={e=>setForm(f=>({...f,requirements:e.target.value}))}/></label>
      <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Required documents</span><textarea className={`${inputCls} min-h-[100px]`} placeholder="Government-issued ID\nProof of insurance" value={form.requiredDocuments} onChange={e=>setForm(f=>({...f,requiredDocuments:e.target.value}))}/></label>
      <label className="sm:col-span-2"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Offering-specific intake prompts</span><textarea className={`${inputCls} min-h-[100px]`} placeholder="One prompt per line" value={form.intakePrompts} onChange={e=>setForm(f=>({...f,intakePrompts:e.target.value}))}/><span className="mt-1 block text-xs text-slate-500">These appear with the offering so staff and clients know what information the scope requires.</span></label>
      <div className="sm:col-span-2 rounded-xl border border-gold/15 bg-gold/[.025] p-4"><p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gold">HQ-only provider economics</p><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-[11px] text-slate-500">Suggested payout minimum</span><input className={inputCls} type="number" min="0" step="0.01" value={form.providerPayoutMin} onChange={e=>setForm(f=>({...f,providerPayoutMin:e.target.value}))}/></label><label><span className="mb-1 block text-[11px] text-slate-500">Suggested payout maximum</span><input className={inputCls} type="number" min="0" step="0.01" value={form.providerPayoutMax} onChange={e=>setForm(f=>({...f,providerPayoutMax:e.target.value}))}/></label><label className="sm:col-span-2"><span className="mb-1 block text-[11px] text-slate-500">Provider payout / dispatch notes</span><textarea className={`${inputCls} min-h-[70px]`} value={form.providerPayoutNotes} onChange={e=>setForm(f=>({...f,providerPayoutNotes:e.target.value}))}/></label></div></div>
      <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sort order</span><input className={inputCls} type="number" value={form.sortOrder} onChange={e=>setForm(f=>({...f,sortOrder:e.target.value}))}/></label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-300"><input type="checkbox" checked={form.active} onChange={e=>setForm(f=>({...f,active:e.target.checked}))}/>Visible to clients/public</label>
      <div className="sm:col-span-2 flex gap-3 border-t border-white/10 pt-3"><button type="button" disabled={busy} onClick={save} className={btnPrimary}>{busy?'Saving…':'Save offering'}</button><button type="button" onClick={remove} className="text-xs font-medium text-rose-300 hover:underline">Delete offering</button></div>
    </div>}
  </div>
}

export function OfferingCatalogSettings({serviceKey}:{serviceKey:string}){
  const [rows,setRows]=useState<OfferingRow[]>([])
  const [loading,setLoading]=useState(true)
  const [showNew,setShowNew]=useState(false)
  const [busy,setBusy]=useState(false)
  const [form,setForm]=useState({id:'',name:'',description:'',startingPrice:'',pricingLabel:'',badge:'',requirements:'',requiredDocuments:'',intakePrompts:'',note:'',providerPayoutMin:'',providerPayoutMax:'',providerPayoutNotes:'',sortOrder:'0'})
  const load=useCallback(async()=>{setLoading(true);try{const res=await api.get<{offerings:OfferingRow[]}>(`/admin/service-offerings?service_key=${encodeURIComponent(serviceKey)}`);setRows(res.offerings)}finally{setLoading(false)}},[serviceKey])
  useEffect(()=>{load()},[load])
  async function create(e:React.FormEvent){e.preventDefault();setBusy(true);try{await api.post('/admin/service-offerings',{id:form.id,service_key:serviceKey,name:form.name,description:form.description,starting_price:form.startingPrice===''?null:Number(form.startingPrice),pricing_label:form.pricingLabel||null,badge:form.badge||null,requirements:lines(form.requirements),required_documents:lines(form.requiredDocuments),intake_prompts:lines(form.intakePrompts),client_note:form.note||null,provider_payout_min:form.providerPayoutMin===''?null:Number(form.providerPayoutMin),provider_payout_max:form.providerPayoutMax===''?null:Number(form.providerPayoutMax),provider_payout_notes:form.providerPayoutNotes||null,sort_order:Number(form.sortOrder)||0});toast.success('Offering created.');setShowNew(false);setForm({id:'',name:'',description:'',startingPrice:'',pricingLabel:'',badge:'',requirements:'',requiredDocuments:'',intakePrompts:'',note:'',providerPayoutMin:'',providerPayoutMax:'',providerPayoutNotes:'',sortOrder:'0'});await load()}catch(err){toast.error(err instanceof ApiError?err.message:'Could not create offering.')}finally{setBusy(false)}}
  return <div className="border-t border-white/10 px-5 py-4"><div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium text-white">One-time & project offerings</p><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Retail pricing and client scope are public. Provider payout guidance is internal to HQ. Hide an offering without deleting it when it is temporarily unavailable.</p></div><button type="button" className={`${btnOutline} text-xs`} onClick={()=>setShowNew(v=>!v)}>{showNew?'Cancel':'+ Add offering'}</button></div>
    {showNew&&<form onSubmit={create} className="mb-4 grid gap-3 rounded-xl border border-gold/20 bg-gold/[.035] p-4 sm:grid-cols-2"><label><span className="mb-1 block text-[11px] text-slate-500">Offering ID</span><input required className={inputCls} placeholder="field-new-service" value={form.id} onChange={e=>setForm(f=>({...f,id:e.target.value}))}/></label><label><span className="mb-1 block text-[11px] text-slate-500">Name</span><input required className={inputCls} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></label><label className="sm:col-span-2"><span className="mb-1 block text-[11px] text-slate-500">Description</span><textarea required className={`${inputCls} min-h-[70px]`} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></label><label><span className="mb-1 block text-[11px] text-slate-500">Starting retail price</span><input className={inputCls} type="number" min="0" step="0.01" value={form.startingPrice} onChange={e=>setForm(f=>({...f,startingPrice:e.target.value}))}/></label><label><span className="mb-1 block text-[11px] text-slate-500">Pricing label</span><input className={inputCls} placeholder="Starting at $99" value={form.pricingLabel} onChange={e=>setForm(f=>({...f,pricingLabel:e.target.value}))}/></label><label><span className="mb-1 block text-[11px] text-slate-500">Required documents</span><textarea className={`${inputCls} min-h-[80px]`} value={form.requiredDocuments} onChange={e=>setForm(f=>({...f,requiredDocuments:e.target.value}))}/></label><label><span className="mb-1 block text-[11px] text-slate-500">Starting information / intake prompts</span><textarea className={`${inputCls} min-h-[80px]`} value={form.intakePrompts} onChange={e=>setForm(f=>({...f,intakePrompts:e.target.value}))}/></label><label><span className="mb-1 block text-[11px] text-slate-500">Provider payout min</span><input className={inputCls} type="number" step="0.01" value={form.providerPayoutMin} onChange={e=>setForm(f=>({...f,providerPayoutMin:e.target.value}))}/></label><label><span className="mb-1 block text-[11px] text-slate-500">Provider payout max</span><input className={inputCls} type="number" step="0.01" value={form.providerPayoutMax} onChange={e=>setForm(f=>({...f,providerPayoutMax:e.target.value}))}/></label><div className="sm:col-span-2"><button disabled={busy} className={btnPrimary}>{busy?'Creating…':'Create offering'}</button></div></form>}
    {loading?<p className="text-sm text-slate-400">Loading offerings…</p>:rows.length===0?<EmptyState label="No defined offerings yet."/>:<div className="space-y-2">{rows.map(row=><OfferingEditor key={row.id} row={row} onChanged={load}/>)}</div>}
  </div>
}
