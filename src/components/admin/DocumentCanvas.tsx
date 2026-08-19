import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, CalendarDays, Download, FileText, Image as ImageIcon,
  Indent, Italic, Link2, List, ListOrdered, Maximize2, Minus, Outdent, PenLine, Plus, Redo2, RemoveFormatting,
  RotateCw, SeparatorHorizontal, Strikethrough, Subscript, Superscript, Table as TableIcon, Underline, Undo2,
} from 'lucide-react'
import { LetterheadCrest } from './LetterheadCrest'
import { DocumentExportMenu } from './DocumentExportMenu'
import { DOC_FONTS, DOC_FONT_GROUPS, DOC_HIGHLIGHT, DOC_INK, DOC_SIZES, toEditorHtml } from '../../../shared/docHtml'
import { DOC_PAGE_SIZES, docPageSize, isDocMargin, isDocPageSize, type DocMarginKey, type DocPageSizeKey } from '../../../shared/docLayout'
import { FIRM_NAME, FIRM_PHONE, FIRM_REGION, FIRM_SITE_HOST, FIRM_TAGLINE, SUPPORT_EMAIL } from '../../../shared/letterhead'
import { api } from '../../lib/api'
import './documentCanvas.css'

type CanvasDocument = {
  id:string
  title:string
  document_type:'file'|'text'
  mime_type:string|null
  original_name:string|null
  text_content:string|null
  is_branded?:number
  page_size?:string|null
  page_margins?:string|null
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

export function DocumentCanvas({document,text,onTextChange,readOnly=false,fullPage=false,fullPageHref}:{document:CanvasDocument;text:string;onTextChange:(v:string)=>void;readOnly?:boolean;fullPage?:boolean;fullPageHref?:string}){
  const [zoom,setZoom]=useState(100),[docx,setDocx]=useState<DocxBlock[]|null>(null),[docxError,setDocxError]=useState(''),[loading,setLoading]=useState(false),[reloadKey,setReloadKey]=useState(0)
  const [pageSize,setPageSize]=useState<DocPageSizeKey>(isDocPageSize(document.page_size)?document.page_size:'letter')
  const [margins,setMargins]=useState<DocMarginKey>(isDocMargin(document.page_margins)?document.page_margins:'normal')
  const ext=extension(document.original_name), mime=document.mime_type||''
  const url=`/api/admin/documents-workspace/${document.id}/file?v=${reloadKey}`
  const isPdf=mime==='application/pdf'||ext==='pdf', isImage=mime.startsWith('image/'), isDocx=ext==='docx'||mime.includes('wordprocessingml')
  const branded=document.is_branded!==0
  const editableText=document.document_type==='text' && !readOnly
  const paper=docPageSize(pageSize)
  // Page size + margins persist on the document itself, so preview, browser
  // print (@page below), and PDF export all read the same geometry.
  function persistLayout(next:{page_size?:DocPageSizeKey;page_margins?:DocMarginKey}){
    if(!editableText)return
    api.patch(`/admin/documents-workspace/${document.id}`,next).catch(()=>{})
  }
  function changePageSize(v:DocPageSizeKey){ setPageSize(v); persistLayout({page_size:v}) }
  function changeMargins(v:DocMarginKey){ setMargins(v); persistLayout({page_margins:v}) }
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
      <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{document.title}</p><p className="text-[11px] text-slate-500">{typeLabel} · {readOnly?'read-only reference':'formatting lives in the bar below, not on the page'}</p></div>
      <div className="flex items-center gap-1.5">
        {document.document_type==='text'&&<select className="doc-ribbon-select mr-1" value={pageSize} onChange={(e)=>changePageSize(e.target.value as DocPageSizeKey)} title="Page size" style={{height:'2rem'}}>
          {DOC_PAGE_SIZES.map((s)=><option key={s.key} value={s.key}>{s.label}</option>)}
        </select>}
        {document.document_type==='text'&&<select className="doc-ribbon-select mr-1" value={margins} onChange={(e)=>changeMargins(e.target.value as DocMarginKey)} title="Page margins" style={{height:'2rem'}}>
          <option value="normal">Normal margins</option>
          <option value="narrow">Narrow margins</option>
          <option value="wide">Wide margins</option>
        </select>}
        <button className="doc-tool" onClick={()=>setZoom(v=>Math.max(60,v-10))} title="Zoom out"><Minus size={15}/></button><span className="w-12 text-center text-[11px] tabular-nums text-slate-400">{zoom}%</span><button className="doc-tool" onClick={()=>setZoom(v=>Math.min(180,v+10))} title="Zoom in"><Plus size={15}/></button>
        <button className="doc-tool" onClick={()=>{setZoom(100);setReloadKey(v=>v+1)}} title="Refresh document"><RotateCw size={14}/></button>
        {fullPageHref
          ? <Link className="doc-tool" to={fullPageHref} title="Open full page"><Maximize2 size={14}/></Link>
          : <a className="doc-tool" href={url} target="_blank" rel="noreferrer" title="Open full screen"><Maximize2 size={14}/></a>}
        {document.document_type==='text'
          ? <DocumentExportMenu compact documentId={document.id} title={document.title} documentType="text" align="right"/>
          : <a className="doc-tool" href={url} download title="Download"><Download size={14}/></a>}
      </div>
    </div>
    {editableText && <FormatRibbon onChange={onTextChange}/>}
    <div className={`relative overflow-auto bg-[#2a3037] p-4 sm:p-7 ${fullPage?'h-[calc(100vh-138px)] min-h-[540px]':'h-[calc(100vh-255px)] min-h-[600px]'}`}>
      {isPdf&&<div className="mx-auto h-full min-h-[560px] w-full overflow-hidden bg-white shadow-2xl" style={{maxWidth:`${Math.round(900*zoom/100)}px`}}><iframe key={reloadKey} title={document.title} src={`${url}#toolbar=0&navpanes=1&view=FitH`} className="h-full w-full bg-white"/></div>}
      {document.document_type==='text'&&<><style>{`@media print{@page{size:${paper.css};margin:0}}`}</style><div className="mx-auto origin-top" style={{width:`${paper.screen.w}px`,transform:`scale(${zoom/100})`,transformOrigin:'top center',marginBottom:`${Math.max(0,(zoom-100)*8)}px`}}><article className={`doc-paper doc-margins-${margins} doc-size-${pageSize}`}>{branded&&<PaperBrand/>}<div className="doc-body"><RichDocEditor value={text} onChange={onTextChange} readOnly={readOnly}/></div>{branded&&<PaperFooter/>}</article></div></>}
      {isImage&&<div className="mx-auto flex min-h-[500px] items-start justify-center"><img src={url} alt={document.title} style={{width:`${zoom}%`,maxWidth:'none'}} className="bg-white shadow-2xl"/></div>}
      {isDocx&&<div className="mx-auto origin-top" style={{width:'816px',transform:`scale(${zoom/100})`,transformOrigin:'top center'}}><article className="doc-paper">{branded&&<PaperBrand/>}<div className="doc-body">{loading?<PreviewMessage text="Rendering DOCX…"/>:docxError?<PreviewMessage text={docxError}/>:docx?.map((b,i)=>b.type==='table'?<table key={i} className="my-5 w-full border-collapse text-sm"><tbody>{b.rows.map((row,r)=><tr key={r}>{row.map((cell,c)=><td key={c} className="border border-slate-300 p-2 align-top">{cell}</td>)}</tr>)}</tbody></table>:b.style?.toLowerCase().includes('heading')?<h2 key={i} className="mb-3 mt-6 font-serif text-xl font-semibold">{b.text}</h2>:<p key={i} className="mb-3 whitespace-pre-wrap font-serif text-[15px] leading-7">{b.text||' '}</p>)}</div>{branded&&<PaperFooter/>}</article></div>}
      {!isPdf&&!isImage&&!isDocx&&document.document_type!=='text'&&<div className="mx-auto grid min-h-[520px] max-w-2xl place-items-center bg-white p-10 text-center shadow-2xl"><div><FileText size={52} className="mx-auto text-slate-300"/><h3 className="mt-5 text-lg font-semibold text-slate-800">Preview unavailable for this file type</h3><p className="mt-2 text-sm leading-6 text-slate-500">The file remains stored securely in Document Hub. Open or download it to work with the original format.</p><a href={url} target="_blank" rel="noreferrer" className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Open document</a></div></div>}
    </div>
  </section>
}

function runCommand(command:string, arg?:string){
  document.execCommand('styleWithCSS', false, 'true')
  document.execCommand(command, false, arg)
}

function applyFontSize(root: HTMLElement | null, px: string){
  runCommand('fontSize', '7')
  if (!root) return
  root.querySelectorAll('font[size="7"]').forEach((el) => {
    const span = document.createElement('span')
    span.style.fontSize = px
    span.innerHTML = (el as HTMLElement).innerHTML
    el.replaceWith(span)
  })
  root.querySelectorAll<HTMLElement>('span').forEach((span) => {
    if (span.style.fontSize === 'xxx-large' || span.style.fontSize === 'x-large') span.style.fontSize = px
  })
}

function FormatRibbon({ onChange }: { onChange: (v: string) => void }) {
  const [link, setLink] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [insertOpen, setInsertOpen] = useState(false)
  const [imgOpen, setImgOpen] = useState(false)
  const [imgUrl, setImgUrl] = useState('')
  const saved = useRef<Range | null>(null)

  function saveSelection() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount) saved.current = sel.getRangeAt(0)
  }
  function restoreSelection() {
    if (!saved.current) return
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(saved.current)
  }
  function capture() {
    const root = document.getElementById('pmv-doc-editor')
    onChange(root?.innerHTML || '')
  }
  function run(command: string, arg?: string) {
    restoreSelection()
    runCommand(command, arg)
    capture()
  }
  function size(px: string) {
    restoreSelection()
    applyFontSize(document.getElementById('pmv-doc-editor'), px)
    capture()
  }
  function applyLink() {
    const href = link.trim()
    if (!href) return
    run('createLink', href.startsWith('http') ? href : `https://${href}`)
    setLink('')
    setLinkOpen(false)
  }
  // Insert HTML at the caret, then persist. Used by the Insert menu.
  function insertHtml(html: string) {
    restoreSelection()
    runCommand('insertHTML', html)
    capture()
  }
  const TABLE_HTML = '<table class="doc-table"><thead><tr><th>Column</th><th>Column</th><th>Column</th></tr></thead><tbody><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br></p>'
  const SIG_HTML = '<div class="doc-sigline"><span class="doc-sigline-rule"></span><span class="doc-sigline-label">Signature</span></div><p><br></p>'
  function insertItem(kind: 'table' | 'hr' | 'pagebreak' | 'date' | 'signature') {
    setInsertOpen(false)
    if (kind === 'table') return insertHtml(TABLE_HTML)
    if (kind === 'hr') { restoreSelection(); runCommand('insertHorizontalRule'); return capture() }
    if (kind === 'pagebreak') return insertHtml('<div class="doc-pagebreak"></div><p><br></p>')
    if (kind === 'signature') return insertHtml(SIG_HTML)
    if (kind === 'date') return insertHtml(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))
  }
  function applyImage() {
    const src = imgUrl.trim()
    if (!src) return
    insertHtml(`<img src="${src.replace(/"/g, '&quot;')}" alt="">`)
    setImgUrl('')
    setImgOpen(false)
    setInsertOpen(false)
  }
  return (
    <div className="doc-ribbon" onMouseDown={(e) => {
      const target = e.target as HTMLElement
      if (target.closest('input')) return
      saveSelection()
      if (target.closest('button')) e.preventDefault()
    }}>
      <div className="doc-ribbon-group">
        <button type="button" className="doc-ribbon-btn" title="Undo" onClick={() => run('undo')}><Undo2 size={14}/></button>
        <button type="button" className="doc-ribbon-btn" title="Redo" onClick={() => run('redo')}><Redo2 size={14}/></button>
      </div>
      <div className="doc-ribbon-group">
        <select className="doc-ribbon-select" defaultValue="P" onChange={(e) => run('formatBlock', e.target.value)} title="Paragraph style">
          <option value="P">Body</option>
          <option value="H1">Title</option>
          <option value="H2">Subtitle</option>
          <option value="H3">Heading 1</option>
          <option value="H4">Heading 2</option>
          <option value="H5">Heading 3</option>
          <option value="BLOCKQUOTE">Quote</option>
          <option value="PRE">Monospace block</option>
        </select>
        <select className="doc-ribbon-select" defaultValue={DOC_FONTS[0].value} onChange={(e) => run('fontName', e.target.value)} title="Font" style={{ maxWidth: '9rem' }}>
          {DOC_FONT_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {DOC_FONTS.filter((font) => font.group === group).map((font) => (
                <option key={font.label} value={font.value} style={{ fontFamily: font.value }}>{font.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select className="doc-ribbon-select" defaultValue="16px" onChange={(e) => size(e.target.value)} title="Font size" style={{ maxWidth: '4.4rem' }}>
          {DOC_SIZES.map((value) => <option key={value} value={value}>{value.replace('px', '')}</option>)}
        </select>
      </div>
      <div className="doc-ribbon-group">
        <button type="button" className="doc-ribbon-btn" title="Bold" onClick={() => run('bold')}><Bold size={14}/></button>
        <button type="button" className="doc-ribbon-btn" title="Italic" onClick={() => run('italic')}><Italic size={14}/></button>
        <button type="button" className="doc-ribbon-btn" title="Underline" onClick={() => run('underline')}><Underline size={14}/></button>
        <button type="button" className="doc-ribbon-btn" title="Strikethrough" onClick={() => run('strikeThrough')}><Strikethrough size={14}/></button>
        <button type="button" className="doc-ribbon-btn" title="Superscript" onClick={() => run('superscript')}><Superscript size={14}/></button>
        <button type="button" className="doc-ribbon-btn" title="Subscript" onClick={() => run('subscript')}><Subscript size={14}/></button>
      </div>
      <div className="doc-ribbon-group">
        <select className="doc-ribbon-select" defaultValue={DOC_INK[0].value} onChange={(e) => run('foreColor', e.target.value)} title="Text color" style={{ maxWidth: '5.6rem' }}>
          {DOC_INK.map((ink) => <option key={ink.label} value={ink.value}>{ink.label}</option>)}
        </select>
        <select className="doc-ribbon-select" defaultValue={DOC_HIGHLIGHT[0].value} onChange={(e) => run('hiliteColor', e.target.value)} title="Highlight" style={{ maxWidth: '6.2rem' }}>
          {DOC_HIGHLIGHT.map((tone) => <option key={tone.label} value={tone.value}>{tone.label}</option>)}
        </select>
      </div>
      <div className="doc-ribbon-group">
        <button type="button" className="doc-ribbon-btn" title="Align left" onClick={() => run('justifyLeft')}><AlignLeft size={14}/></button>
        <button type="button" className="doc-ribbon-btn" title="Align center" onClick={() => run('justifyCenter')}><AlignCenter size={14}/></button>
        <button type="button" className="doc-ribbon-btn" title="Align right" onClick={() => run('justifyRight')}><AlignRight size={14}/></button>
        <button type="button" className="doc-ribbon-btn" title="Justify" onClick={() => run('justifyFull')}><AlignJustify size={14}/></button>
      </div>
      <div className="doc-ribbon-group">
        <button type="button" className="doc-ribbon-btn" title="Bulleted list" onClick={() => run('insertUnorderedList')}><List size={14}/></button>
        <button type="button" className="doc-ribbon-btn" title="Numbered list" onClick={() => run('insertOrderedList')}><ListOrdered size={14}/></button>
        <button type="button" className="doc-ribbon-btn" title="Increase indent" onClick={() => run('indent')}><Indent size={14}/></button>
        <button type="button" className="doc-ribbon-btn" title="Decrease indent" onClick={() => run('outdent')}><Outdent size={14}/></button>
      </div>
      <div className="doc-ribbon-group">
        <button type="button" className={`doc-ribbon-btn ${linkOpen ? 'is-open' : ''}`} title="Insert link" onClick={() => setLinkOpen((open) => !open)}><Link2 size={14}/></button>
        {linkOpen && (
          <div className="doc-link-row">
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" onKeyDown={(e) => { if (e.key === 'Enter') applyLink() }}/>
            <button type="button" className="doc-ribbon-btn" onClick={applyLink}>Add</button>
          </div>
        )}
        <button type="button" className="doc-ribbon-btn" title="Clear formatting" onClick={() => run('removeFormat')}><RemoveFormatting size={14}/></button>
      </div>
      <div className="doc-ribbon-group" style={{ position: 'relative' }}>
        <button type="button" className={`doc-ribbon-btn ${insertOpen ? 'is-open' : ''}`} title="Insert" onClick={() => { setInsertOpen((open) => !open); setImgOpen(false) }}><Plus size={14}/><span className="ml-1 text-[11px]">Insert</span></button>
        {insertOpen && (
          <div className="doc-insert-menu">
            <button type="button" className="doc-insert-item" onClick={() => { setImgOpen(true); setInsertOpen(false) }}><ImageIcon size={14}/>Image from URL</button>
            <button type="button" className="doc-insert-item" onClick={() => insertItem('table')}><TableIcon size={14}/>Table</button>
            <button type="button" className="doc-insert-item" onClick={() => insertItem('hr')}><SeparatorHorizontal size={14}/>Horizontal rule</button>
            <button type="button" className="doc-insert-item" onClick={() => insertItem('pagebreak')}><Minus size={14}/>Page break</button>
            <button type="button" className="doc-insert-item" onClick={() => insertItem('signature')}><PenLine size={14}/>Signature line</button>
            <button type="button" className="doc-insert-item" onClick={() => insertItem('date')}><CalendarDays size={14}/>Today's date</button>
          </div>
        )}
        {imgOpen && (
          <div className="doc-link-row">
            <input value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} placeholder="https://image-url" onKeyDown={(e) => { if (e.key === 'Enter') applyImage() }}/>
            <button type="button" className="doc-ribbon-btn" onClick={applyImage}>Add</button>
          </div>
        )}
      </div>
      <p className="doc-ribbon-hint">Select text first, then use this bar. Zoom, margins, and export stay in the title row so they never sit on the letterhead.</p>
    </div>
  )
}

function RichDocEditor({value,onChange,readOnly}:{value:string;onChange:(v:string)=>void;readOnly?:boolean}){
  const ref=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const el=ref.current
    if(!el) return
    const html=toEditorHtml(value)
    if(document.activeElement!==el && el.innerHTML!==html) el.innerHTML=html
  },[value])
  return (
    <div
      id="pmv-doc-editor"
      ref={ref}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      className={`doc-page ${readOnly?'cursor-default':''}`}
      onInput={()=>onChange(ref.current?.innerHTML||'')}
      spellCheck={!readOnly}
    />
  )
}

function PaperBrand(){
  return (
    <header>
      <div className="doc-letterhead">
        <LetterheadCrest />
        <div>
          <p className="doc-letterhead-name">{FIRM_NAME}</p>
          <p className="doc-letterhead-meta">{FIRM_TAGLINE}</p>
        </div>
        <div className="doc-letterhead-aside">
          <p>{FIRM_REGION}</p>
          <p>{FIRM_PHONE}</p>
          <p>{FIRM_SITE_HOST}</p>
        </div>
      </div>
      <div className="doc-letterhead-rule" />
    </header>
  )
}

function PaperFooter(){
  return (
    <footer className="doc-colophon">
      <span>{FIRM_NAME}</span>
      <span>Confidential</span>
      <span>{SUPPORT_EMAIL}</span>
    </footer>
  )
}

function PreviewMessage({text}:{text:string}){return <div className="grid min-h-[700px] place-items-center"><p className="text-sm text-slate-500">{text}</p></div>}
