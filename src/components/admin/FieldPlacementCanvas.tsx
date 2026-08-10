import { CalendarDays, CheckSquare, PenLine, Type } from 'lucide-react'

type Field={id:string;page_number:number;field_type:string;x:number;y:number;width:number;height:number;recipient_id:string;label?:string|null}
type Recipient={id:string;name:string;email:string}

const labels:Record<string,string>={signature:'Signature',initial:'Initials',date:'Date',text:'Text',checkbox:'Checkbox'}

export function FieldPlacementCanvas({envelopeId,page,recipientId,fieldType,fields,recipients,onPlace}:{envelopeId:string;page:number;recipientId:string;fieldType:string;fields:Field[];recipients:Recipient[];onPlace:(p:{x:number;y:number;width:number;height:number})=>void}){
  const sizes:Record<string,{width:number;height:number}>={signature:{width:.30,height:.075},initial:{width:.12,height:.065},date:{width:.18,height:.055},text:{width:.28,height:.055},checkbox:{width:.045,height:.045}}
  const size=sizes[fieldType]||sizes.text
  function place(e:React.MouseEvent<HTMLDivElement>){
    if(!recipientId)return
    const r=e.currentTarget.getBoundingClientRect()
    const x=Math.max(0,Math.min(1-size.width,(e.clientX-r.left)/r.width-size.width/2))
    const y=Math.max(0,Math.min(1-size.height,(e.clientY-r.top)/r.height-size.height/2))
    onPlace({x,y,width:size.width,height:size.height})
  }
  const current=fields.filter(f=>Number(f.page_number)===page)
  return <div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-white">Click where the field belongs</p><p className="mt-1 text-xs text-slate-500">Choose a recipient and field type, then click directly on page {page}. No coordinates required.</p></div><div className="flex gap-2 text-[11px] text-slate-500"><span>{labels[fieldType]}</span><span>•</span><span>{recipients.find(r=>r.id===recipientId)?.name||'Choose recipient'}</span></div></div>
    <div className="relative mx-auto aspect-[8.5/11] w-full max-w-[760px] overflow-hidden border border-white/15 bg-white shadow-[0_18px_60px_rgba(0,0,0,.35)]">
      <iframe title="Document page preview" src={`/api/admin/envelopes/${envelopeId}/source#page=${page}&toolbar=0&navpanes=0&view=FitH`} className="absolute inset-0 h-full w-full bg-white"/>
      <div onClick={place} className={`absolute inset-0 z-10 ${recipientId?'cursor-crosshair':'cursor-not-allowed'}`} title={recipientId?'Click to place field':'Choose a recipient first'} />
      {current.map(f=>{const who=recipients.find(r=>r.id===f.recipient_id);return <div key={f.id} className="pointer-events-none absolute z-20 flex items-center gap-1 overflow-hidden rounded border border-amber-500/80 bg-amber-300/80 px-1.5 text-[10px] font-semibold text-slate-900 shadow" style={{left:`${Number(f.x)*100}%`,top:`${Number(f.y)*100}%`,width:`${Number(f.width)*100}%`,height:`${Number(f.height)*100}%`}}>{f.field_type==='signature'||f.field_type==='initial'?<PenLine size={11}/>:f.field_type==='date'?<CalendarDays size={11}/>:f.field_type==='checkbox'?<CheckSquare size={11}/>:<Type size={11}/>}<span className="truncate">{labels[f.field_type]||f.field_type}{who?` · ${who.name}`:''}</span></div>})}
    </div>
  </div>
}
