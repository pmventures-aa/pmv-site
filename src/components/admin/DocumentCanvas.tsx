import { useEffect, useMemo, useRef, useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Bold, Download, FileText, Heading1, Heading2, Italic, List, ListOrdered, Maximize2, Minus, Plus, RotateCw, Underline } from 'lucide-react'
import './documentCanvas.css'

type CanvasDocument = {
  id:string
  title:string
  document_type:'file'|'text'
  mime_type:string|null
  original_name:string|null
  text_content:string|null
  is_branded?:number
}

type DocxBlock =
  | { type:'p'; text:string; style?:string }
  | { type:'table'; rows:string[][] }

const decoder = new TextDecoder('utf-8')

function extension(name:string|null){ return (name?.split('.').pop()||'').toLowerCase() }

async function unzipEntry(bytes:ArrayBuffer, wanted:string){
  const view=new DataView(bytes); const u8=new Uint8Array(bytes)
  let eocd=-1
  for(let i=Math.max(0,bytes.byteLength-65557);i<=bytes.byteLength-22;i++) if(view.getUint32(i,true)===0x06054b50)eocd=i
  if(eocd<0) throw new Error('DOCX package directory not found')
  const entries=view.getUint16(eocd+10,true), cdOffset=view.getUint32(eocd+16,true)
  let p=cdOffset
  for(let i=0;i<entries;i++){
    if(view.getUint32(p,true)!==0x02014b50)break
    const method=view.getUint16(p+10,true), compSize=view.getUint32(p+20,true), nameLen=view.getUint16(p+28,true), extraLen=view.getUint16(p+30,true), commentLen=view.getUint16(p+32,true), localOffset=view.getUint32(p+42,true)
    const name=decoder.decode(u8.slice(p+46,p+46+nameLen))
    if(name===wanted){
      const localNameLen=view.getUint16(localOffset+26,true), localExtraLen=view.getUint16(localOffset+28,true), start=localOffset+30+localNameLen+localExtraLen
      const compressed=u8.slice(start,start+compSize)
      if(method===0)return compressed
      if(method!==8)throw new Error('Unsupported DOCX compression method')
      const DS=(globalThis as any).DecompressionStream
      if(!DS)throw new Error('This browser cannot render DOCX files inline')
      const stream=new Blob([compressed]).stream().pipeThrough(new DS('deflate-raw'))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    }
    p+=46+nameLen+extraLen+commentLen
  }
  throw new Error('DOCX document body not found')
}

function textOf(el:Element){
  return Array.from(el.getElementsByTagNameNS('*','t')).map(n=>n.textContent||'').join('')
}

async function parseDocx(bytes:ArrayBuffer):Promise<DocxBlock[]>{
  const xml=decoder.decode(await unzipEntry(bytes,'word/document.xml'))
  const doc=new DOMParser().parseFromString(xml,'application/xml')
  if(doc.querySelector('parsererror'))throw new Error('Unable to parse DOCX content')
  const body=Array.from(doc.getElementsByTagNameNS('*','body'))[0]
  if(!body)return []
  const blocks:DocxBlock[]=[]
  for(const node of Array.from(body.children)){
    if(node.localName==='p'){
      const styleNode=Array.from(node.getElementsByTagNameNS('*','pStyle'))[0]
      const style=styleNode?.getAttribute('w:val')||styleNode?.getAttribute('val')||''
      blocks.push({type:'p',text:textOf(node),style})
    }else if(node.localName==='tbl'){
      const rows=Array.from(node.children).filter(x=>x.localName==='tr').map(tr=>Array.from(tr.children).filter(x=>x.localName==='tc').map(tc=>textOf(tc)))
      blocks.push({type:'table',rows})
    }
  }
  return blocks
}

export function DocumentCanvas({document,text,onTextChange,readOnly=false}:{document:CanvasDocument;text:string;onTextChange:(v:string)=>void;readOnly?:boolean}){
  const [zoom,setZoom]=useState(100),[docx,setDocx]=useState<DocxBlock[]|null>(null),[docxError,setDocxError]=useState(''),[loading,setLoading]=useState(false),[reloadKey,setReloadKey]=useState(0)
  const ext=extension(document.original_name), mime=document.mime_type||''
  const url=`/api/admin/documents-workspace/${document.id}/file?v=${reloadKey}`
  const isPdf=mime==='application/pdf'||ext==='pdf', isImage=mime.startsWith('image/'), isDocx=ext==='docx'||mime.includes('wordprocessingml')
  const branded=document.is_branded!==0
  useEffect(()=>{
    setDocx(null);setDocxError('')
    if(!isDocx)return
    let active=true;setLoading(true)
    fetch(url,{credentials:'include'}).then(r=>{if(!r.ok)throw new Error('Unable to load DOCX');return r.arrayBuffer()}).then(parseDocx).then(v=>{if(active)setDocx(v)}).catch(e=>{if(active)setDocxError(e instanceof Error?e.message:'Unable to render DOCX')}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[document.id,isDocx,reloadKey])
  const typeLabel=useMemo(()=>document.document_type==='text'?'Editable document':isPdf?'PDF':isDocx?'DOCX':isImage?'Image':ext.toUpperCase()||'File',[document.document_type,isPdf,isDocx,isImage,ext])
  return <section className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#111820] shadow-[0_20px_60px_rgba(0,0,0,.28)]">
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-navy-950/90 px-3 py-2 sm:px-4">
      <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{document.title}</p><p className="text-[11px] text-slate-500">{typeLabel} · {readOnly?'read-only reference':'secure internal workspace'}</p></div>
      <div className="flex items-center gap-1.5">
        <button className="doc-tool" onClick={()=>setZoom(v=>Math.max(60,v-10))} title="Zoom out"><Minus size={15}/></button><span className="w-12 text-center text-[11px] tabular-nums text-slate-400">{zoom}%</span><button className="doc-tool" onClick={()=>setZoom(v=>Math.min(180,v+10))} title="Zoom in"><Plus size={15}/></button>
        <button className="doc-tool" onClick={()=>{setZoom(100);setReloadKey(v=>v+1)}} title="Refresh document"><RotateCw size={14}/></button>
        <a className="doc-tool" href={url} target="_blank" rel="noreferrer" title="Open full screen"><Maximize2 size={14}/></a><a className="doc-tool" href={url} download title="Download"><Download size={14}/></a>
      </div>
    </div>
    <div className="relative h-[calc(100vh-255px)] min-h-[600px] overflow-auto bg-[#2a3037] p-4 sm:p-7">
      {isPdf&&<div className="mx-auto h-full min-h-[560px] w-full overflow-hidden bg-white shadow-2xl" style={{maxWidth:`${Math.round(900*zoom/100)}px`}}><iframe key={reloadKey} title={document.title} src={`${url}#toolbar=0&navpanes=1&view=FitH`} className="h-full w-full bg-white"/></div>}
      {document.document_type==='text'&&<div className="mx-auto min-h-[1056px] origin-top bg-white text-[#20252b] shadow-2xl" style={{width:'816px',transform:`scale(${zoom/100})`,marginBottom:`${Math.max(0,(zoom-100)*8)}px`}}>{branded&&<PaperBrand/>}<div className={branded?'px-[9%] pb-[8%] pt-8':'px-[9%] py-[8%]'}><RichDocEditor value={text} onChange={onTextChange} readOnly={readOnly}/></div>{branded&&<PaperFooter/>}</div>}
      {isImage&&<div className="mx-auto flex min-h-[500px] items-start justify-center"><img src={url} alt={document.title} style={{width:`${zoom}%`,maxWidth:'none'}} className="bg-white shadow-2xl"/></div>}
      {isDocx&&<div className="mx-auto origin-top bg-white text-[#20252b] shadow-2xl" style={{width:'816px',minHeight:'1056px',transform:`scale(${zoom/100})`,transformOrigin:'top center'}}>{branded&&<PaperBrand/>}<div className={branded?'px-[9%] pb-[8%] pt-8':'px-[9%] py-[8%]'}>{loading?<PreviewMessage text="Rendering DOCX…"/>:docxError?<PreviewMessage text={docxError}/>:docx?.map((b,i)=>b.type==='table'?<table key={i} className="my-5 w-full border-collapse text-sm"><tbody>{b.rows.map((row,r)=><tr key={r}>{row.map((cell,c)=><td key={c} className="border border-slate-300 p-2 align-top">{cell}</td>)}</tr>)}</tbody></table>:b.style?.toLowerCase().includes('heading')?<h2 key={i} className="mb-3 mt-6 font-serif text-xl font-semibold">{b.text}</h2>:<p key={i} className="mb-3 whitespace-pre-wrap font-serif text-[15px] leading-7">{b.text||' '}</p>)}</div>{branded&&<PaperFooter/>}</div>}
      {!isPdf&&!isImage&&!isDocx&&document.document_type!=='text'&&<div className="mx-auto grid min-h-[520px] max-w-2xl place-items-center bg-white p-10 text-center shadow-2xl"><div><FileText size={52} className="mx-auto text-slate-300"/><h3 className="mt-5 text-lg font-semibold text-slate-800">Preview unavailable for this file type</h3><p className="mt-2 text-sm leading-6 text-slate-500">The file remains stored securely in Document Hub. Open or download it to work with the original format.</p><a href={url} target="_blank" rel="noreferrer" className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Open document</a></div></div>}
    </div>
  </section>
}

function looksLikeHtml(value:string){
  return /<[a-z][\s\S]*>/i.test(value)
}

function toEditorHtml(value:string){
  if(!value) return ''
  if(looksLikeHtml(value)) return value
  return value
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/\n/g,'<br>')
}

function RichDocEditor({value,onChange,readOnly}:{value:string;onChange:(v:string)=>void;readOnly?:boolean}){
  const ref=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const el=ref.current
    if(!el) return
    const html=toEditorHtml(value)
    if(document.activeElement!==el && el.innerHTML!==html) el.innerHTML=html
  },[value])
  function run(command:string, arg?:string){
    if(readOnly) return
    document.execCommand(command,false,arg)
    onChange(ref.current?.innerHTML||'')
  }
  return <div>
    {!readOnly && <div className="doc-toolbar mb-3 flex flex-wrap gap-1 border-b border-slate-200 pb-2">
      <button type="button" className="doc-format" onMouseDown={e=>e.preventDefault()} onClick={()=>run('bold')} title="Bold"><Bold size={14}/></button>
      <button type="button" className="doc-format" onMouseDown={e=>e.preventDefault()} onClick={()=>run('italic')} title="Italic"><Italic size={14}/></button>
      <button type="button" className="doc-format" onMouseDown={e=>e.preventDefault()} onClick={()=>run('underline')} title="Underline"><Underline size={14}/></button>
      <button type="button" className="doc-format" onMouseDown={e=>e.preventDefault()} onClick={()=>run('formatBlock','H1')} title="Heading"><Heading1 size={14}/></button>
      <button type="button" className="doc-format" onMouseDown={e=>e.preventDefault()} onClick={()=>run('formatBlock','H2')} title="Subheading"><Heading2 size={14}/></button>
      <button type="button" className="doc-format" onMouseDown={e=>e.preventDefault()} onClick={()=>run('insertUnorderedList')} title="Bulleted list"><List size={14}/></button>
      <button type="button" className="doc-format" onMouseDown={e=>e.preventDefault()} onClick={()=>run('insertOrderedList')} title="Numbered list"><ListOrdered size={14}/></button>
      <button type="button" className="doc-format" onMouseDown={e=>e.preventDefault()} onClick={()=>run('justifyLeft')} title="Align left"><AlignLeft size={14}/></button>
      <button type="button" className="doc-format" onMouseDown={e=>e.preventDefault()} onClick={()=>run('justifyCenter')} title="Align center"><AlignCenter size={14}/></button>
      <button type="button" className="doc-format" onMouseDown={e=>e.preventDefault()} onClick={()=>run('justifyRight')} title="Align right"><AlignRight size={14}/></button>
      <button type="button" className="doc-format" onMouseDown={e=>e.preventDefault()} onClick={()=>run('undo')} title="Undo">Undo</button>
    </div>}
    <div
      ref={ref}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      className={`doc-page min-h-[820px] w-full bg-transparent font-serif text-[15px] leading-7 text-[#20252b] outline-none ${readOnly?'cursor-default':''}`}
      onInput={()=>onChange(ref.current?.innerHTML||'')}
      spellCheck={!readOnly}
    />
  </div>
}

function PaperBrand(){return <header className="flex items-center justify-between border-b-2 border-[#c99a36] px-[9%] pb-4 pt-8"><div className="flex items-center gap-3"><img src="/logo-crest-transparent.png" alt="" className="h-12 w-12 object-contain"/><div><p className="font-serif text-[17px] font-bold tracking-wide text-[#0a1728]">Pinnacle Management Ventures</p><p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[.22em] text-[#9c7629]">Professional Services · South Florida</p></div></div><div className="text-right text-[9px] leading-4 text-slate-500"><p>pinnaclemanagementventures.com</p><p>Secure Document Hub</p></div></header>}
function PaperFooter(){return <footer className="mx-[9%] mb-6 mt-8 flex items-center justify-between border-t border-slate-200 pt-3 text-[8px] uppercase tracking-[.14em] text-slate-400"><span>Pinnacle Management Ventures</span><span>Confidential business document</span></footer>}
function PreviewMessage({text}:{text:string}){return <div className="grid min-h-[700px] place-items-center"><p className="text-sm text-slate-500">{text}</p></div>}
