import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { BrandMark3D } from '../../components/ui'

export default function SharedDocument(){
  const {token=''}=useParams(); const [data,setData]=useState<any>(null); const [error,setError]=useState('');
  useEffect(()=>{fetch(`/api/shared/${encodeURIComponent(token)}`).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Unable to open document');return d}).then(setData).catch(e=>setError(e.message))},[token])
  return <div className="min-h-screen bg-navy-950"><Header/><main className="container-pmv py-16 sm:py-20"><div className="mx-auto max-w-3xl"><div className="mb-8 flex items-center gap-5"><BrandMark3D size={86} decorative/><div><p className="eyebrow">Secure Document</p><h1 className="mt-2 font-display text-3xl text-white">Pinnacle Document Share</h1></div></div>{error?<div className="border border-red-400/20 bg-red-400/[.05] p-6 text-sm text-red-200">{error}</div>:!data?<p className="text-sm text-slate-400">Opening secure document…</p>:<div className="border border-white/10 bg-navy-900/50 p-6 sm:p-8"><h2 className="font-display text-2xl text-white">{data.document.title}</h2>{data.document.description&&<p className="mt-3 text-sm leading-6 text-slate-400">{data.document.description}</p>}<div className="mt-6 border-t border-white/10 pt-5">{data.document.document_type==='text'?<div className="whitespace-pre-wrap text-sm leading-7 text-slate-200">{data.document.text_content}</div>:<a className="btn-gold inline-flex" href={`/api/shared/${encodeURIComponent(token)}/file`}>Download Document</a>}</div><p className="mt-6 text-xs text-slate-500">Secure link expires {new Date(data.expires_at).toLocaleString()}.</p></div>}</div></main><Footer/></div>
}
