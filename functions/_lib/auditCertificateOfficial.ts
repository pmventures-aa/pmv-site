import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont, type PDFPage } from 'pdf-lib'
import type { Env } from './types'

const navy = rgb(0.035,0.075,0.13)
const gold = rgb(0.72,0.56,0.18)
const ink = rgb(0.10,0.13,0.17)
const muted = rgb(0.39,0.42,0.46)
const line = rgb(0.86,0.87,0.89)
const pale = rgb(0.975,0.976,0.978)
const green = rgb(0.10,0.42,0.25)
const white = rgb(1,1,1)

function safe(v:unknown,max=3000){return String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max)}
function wrap(text:string,max:number){const words=text.split(/\s+/).filter(Boolean);const lines:string[]=[];let current='';for(const word of words){const next=current?`${current} ${word}`:word;if(next.length<=max)current=next;else{if(current)lines.push(current);current=word}}if(current)lines.push(current);return lines}
function fmt(ts:unknown){const d=new Date(String(ts||''));return Number.isNaN(d.getTime())?safe(ts):d.toISOString().replace('T',' ').replace('.000Z',' UTC')}
function shortHash(v:unknown){const s=safe(v,128);return s.length>48?`${s.slice(0,22)}...${s.slice(-22)}`:s}
function roleLabel(v:unknown){return safe(v,50).replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase())}
async function sha(bytes:Uint8Array){const digest=await crypto.subtle.digest('SHA-256',bytes as BufferSource);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}

async function loadBrand(env:Env,envelope:any,pdf:PDFDocument){
  let profile:any=null
  if(envelope.branding_profile_version_id){const v=await env.DB.prepare('SELECT snapshot_json FROM branding_profile_versions WHERE id=?').bind(envelope.branding_profile_version_id).first<any>();if(v?.snapshot_json)try{profile=JSON.parse(v.snapshot_json)}catch{}}
  if(!profile&&envelope.branding_profile_id)profile=await env.DB.prepare('SELECT * FROM branding_profiles WHERE id=?').bind(envelope.branding_profile_id).first<any>()
  if(!profile)profile=await env.DB.prepare("SELECT * FROM branding_profiles WHERE status='active' AND is_default=1 ORDER BY updated_at DESC LIMIT 1").first<any>()
  let logo:PDFImage|null=null
  const logoId=profile?.logo_file_id
  if(logoId&&env.UPLOADS){const f=await env.DB.prepare('SELECT storage_key,mime_type FROM document_files WHERE id=?').bind(logoId).first<any>();if(f?.storage_key){const obj=await env.UPLOADS.get(f.storage_key);if(obj){const bytes=new Uint8Array(await obj.arrayBuffer());try{logo=String(f.mime_type||'').includes('jpeg')||String(f.mime_type||'').includes('jpg')?await pdf.embedJpg(bytes):await pdf.embedPng(bytes)}catch{}}}}
  if(!logo){try{const r=await fetch('https://www.pinnaclemanagementventures.com/logo-crest-transparent.png');if(r.ok)logo=await pdf.embedPng(new Uint8Array(await r.arrayBuffer()))}catch{}}
  return {profile,logo}
}

function pageChrome(page:PDFPage,regular:PDFFont,bold:PDFFont,logo:PDFImage|null,pageNo:number,publicId:string,title:string){
  page.drawRectangle({x:0,y:744,width:612,height:48,color:navy})
  if(logo){const s=logo.scale(1);const h=27,w=h*(s.width/s.height);page.drawImage(logo,{x:38,y:754,width:w,height:h})}
  page.drawText('PINNACLE MANAGEMENT VENTURES',{x:logo?76:38,y:766,size:8.8,font:bold,color:white})
  page.drawText('DOCUMENT INTEGRITY SYSTEM',{x:logo?76:38,y:753,size:6.2,font:regular,color:gold})
  page.drawText(title.toUpperCase(),{x:360,y:766,size:7,font:bold,color:white,maxWidth:212})
  page.drawText(`${publicId}  |  PAGE ${pageNo}`,{x:360,y:753,size:6.1,font:regular,color:rgb(.76,.79,.82),maxWidth:212})
  page.drawLine({start:{x:38,y:36},end:{x:574,y:36},thickness:.55,color:line})
  page.drawText('Pinnacle Management Ventures',{x:38,y:20,size:6.2,font:regular,color:muted})
  page.drawText('pinnaclemanagementventures.com/verify',{x:392,y:20,size:6.2,font:regular,color:navy})
}

function sectionTitle(page:PDFPage,bold:PDFFont,text:string,y:number){
  page.drawText(text.toUpperCase(),{x:42,y,size:8,font:bold,color:navy})
  page.drawLine({start:{x:42,y:y-9},end:{x:570,y:y-9},thickness:.7,color:line})
}

export async function renderOfficialAuditCertificate(env:Env,envelope:any,recipients:any[],events:any[],signedPdfHash:string,chainHead:string,sealedAt:string){
  const pdf=await PDFDocument.create()
  // PDF-safe Arial-compatible default. A licensed Arial TTF/OTF uploaded through Branding Settings can replace this without changing layout logic.
  const regular=await pdf.embedFont(StandardFonts.Helvetica)
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold)
  const {profile,logo}=await loadBrand(env,envelope,pdf)
  const legal=profile?.legal_disclaimer||'This certificate records electronic-signature evidence maintained by Pinnacle Management Ventures. It documents the configured electronic-signature workflow and associated integrity evidence. It is not, by itself, a notarization, legal opinion, or guarantee of admissibility.'
  let pageNo=0
  const addPage=(title:string)=>{const p=pdf.addPage([612,792]);pageNo++;pageChrome(p,regular,bold,logo,pageNo,envelope.public_id,title);return p}

  // PAGE 1 — CERTIFICATE OF COMPLETION
  let page=addPage('Certificate of Completion')
  if(logo){const s=logo.scale(1);const h=54,w=h*(s.width/s.height);page.drawImage(logo,{x:42,y:653,width:w,height:h})}
  page.drawText('CERTIFICATE OF COMPLETION',{x:42,y:628,size:9.2,font:bold,color:gold})
  page.drawText('Electronic Signature & Evidence Record',{x:42,y:590,size:23,font:bold,color:navy,maxWidth:500})
  page.drawText('Formal transaction record for a completed electronic-signature envelope.',{x:42,y:566,size:9,font:regular,color:muted,maxWidth:500})

  page.drawRectangle({x:42,y:506,width:528,height:40,color:rgb(.955,.975,.963),borderColor:rgb(.72,.83,.76),borderWidth:.65})
  page.drawCircle({x:60,y:526,size:7.5,color:green})
  page.drawLine({start:{x:56.5,y:526},end:{x:59.2,y:522.8},thickness:1.25,color:white})
  page.drawLine({start:{x:59.2,y:522.8},end:{x:64.2,y:529.2},thickness:1.25,color:white})
  page.drawText('CERTIFIED COMPLETE',{x:76,y:520,size:11.5,font:bold,color:green})
  page.drawText('Required signing actions completed and evidence bundle sealed.',{x:236,y:520,size:7.2,font:regular,color:muted,maxWidth:318})

  sectionTitle(page,bold,'Transaction Summary',472)
  const rows:[string,string][]=[
    ['Document',safe(envelope.title,180)],
    ['Envelope / Transaction ID',safe(envelope.public_id,90)],
    ['Status','Completed'],
    ['Completed',fmt(envelope.completed_at||sealedAt)],
    ['Sealed',fmt(sealedAt)],
    ['Participants',String(recipients.length)],
    ['Issuer','Pinnacle Management Ventures'],
  ]
  let y=440
  for(const [label,value] of rows){
    page.drawText(label.toUpperCase(),{x:42,y,size:6.2,font:bold,color:muted})
    page.drawText(value,{x:190,y:y-1,size:8.8,font:label.includes('ID')?bold:regular,color:ink,maxWidth:376})
    page.drawLine({start:{x:42,y:y-12},end:{x:570,y:y-12},thickness:.4,color:line})
    y-=33
  }

  sectionTitle(page,bold,'Document Integrity',196)
  page.drawRectangle({x:42,y:126,width:528,height:46,color:pale,borderColor:line,borderWidth:.5})
  page.drawText('FINAL SIGNED PDF SHA-256',{x:54,y:154,size:6.1,font:bold,color:muted})
  page.drawText(shortHash(signedPdfHash),{x:54,y:137,size:8,font:bold,color:navy,maxWidth:500})
  page.drawText(`Verify this record with ${safe(envelope.public_id)} at pinnaclemanagementventures.com/verify`,{x:42,y:94,size:7.2,font:regular,color:muted,maxWidth:528})

  // PAGE 2 — PARTICIPANTS / AUTHENTICATION
  page=addPage('Participants & Authentication')
  page.drawText('Participants & Authentication',{x:42,y:702,size:17,font:bold,color:navy})
  page.drawText('Recorded signer roles, completion state, and authentication method.',{x:42,y:681,size:8.2,font:regular,color:muted})
  y=642
  for(const r of recipients){
    if(y<155){page=addPage('Participants & Authentication');y=704}
    page.drawRectangle({x:42,y:y-86,width:528,height:86,color:white,borderColor:line,borderWidth:.65})
    page.drawRectangle({x:42,y:y-86,width:4,height:86,color:r.status==='completed'?green:gold})
    page.drawText(safe(r.name,120),{x:58,y:y-20,size:10.5,font:bold,color:navy,maxWidth:260})
    page.drawText(roleLabel(r.role),{x:430,y:y-20,size:6.8,font:bold,color:gold,maxWidth:120})
    page.drawText(safe(r.email,180),{x:58,y:y-37,size:7.2,font:regular,color:muted,maxWidth:300})
    page.drawText(`STATUS  ${roleLabel(r.status)}`,{x:58,y:y-58,size:6.5,font:bold,color:r.status==='completed'?green:ink})
    page.drawText(`COMPLETED  ${fmt(r.completed_at||'Not completed')}`,{x:220,y:y-58,size:6.5,font:regular,color:ink,maxWidth:320})
    const authEvents=events.filter(e=>e.recipient_id===r.id&&String(e.event_type).startsWith('authentication.'))
    const auth=authEvents.find(e=>e.event_type==='authentication.passed')
    let method='Secure signing session'
    if(auth?.metadata_json)try{const m=JSON.parse(auth.metadata_json);if(m.method==='email_otp')method='Email OTP + secure signing session'}catch{}
    page.drawText(`Authentication: ${method}`,{x:58,y:y-74,size:6.8,font:regular,color:ink,maxWidth:475})
    y-=102
  }
  page.drawRectangle({x:42,y:72,width:528,height:42,color:pale,borderColor:line,borderWidth:.45})
  page.drawText('SECURITY NOTE',{x:54,y:96,size:6.2,font:bold,color:navy})
  page.drawText('Authentication codes, challenge answers, and secret values are never printed in this certificate.',{x:54,y:82,size:6.6,font:regular,color:muted,maxWidth:500})

  // PAGE 3+ — EVENT LEDGER
  page=addPage('Chronological Evidence Trail')
  page.drawText('Chronological Evidence Trail',{x:42,y:702,size:17,font:bold,color:navy})
  page.drawText('Append-only transaction events recorded in UTC and linked by cryptographic hash.',{x:42,y:681,size:8.2,font:regular,color:muted})
  y=644
  for(const ev of events){
    if(y<116){page=addPage('Chronological Evidence Trail');page.drawText('Chronological Evidence Trail — Continued',{x:42,y:702,size:13,font:bold,color:navy});y=670}
    page.drawText(fmt(ev.occurred_at_utc),{x:42,y,size:6.7,font:bold,color:navy,maxWidth:145})
    page.drawText(safe(ev.event_type,100).replaceAll('.',' / '),{x:190,y,size:7.4,font:bold,color:ink,maxWidth:365})
    y-=14
    const location=[ev.geo_city,ev.geo_region,ev.geo_country].filter(Boolean).join(', ')
    const device=[ev.device_class,ev.browser_family,ev.os_family].filter(Boolean).join(' / ')
    page.drawText(`Actor: ${roleLabel(ev.actor_type)}${ev.ip_address?`   |   IP: ${safe(ev.ip_address,80)}`:''}`,{x:190,y,size:6.2,font:regular,color:muted,maxWidth:365});y-=10
    if(location||device){page.drawText(`${location?`Location: ${safe(location,150)}`:''}${location&&device?'   |   ':''}${device?`Device: ${safe(device,160)}`:''}`,{x:190,y,size:6.1,font:regular,color:muted,maxWidth:365});y-=10}
    page.drawText(`Event hash: ${shortHash(ev.event_hash)}`,{x:190,y,size:5.8,font:regular,color:rgb(.50,.52,.55),maxWidth:365});y-=15
    page.drawLine({start:{x:42,y},end:{x:570,y},thickness:.35,color:line});y-=15
  }

  // FINAL PAGE — CRYPTOGRAPHIC CERTIFICATION
  page=addPage('Cryptographic Integrity')
  page.drawText('Cryptographic Integrity',{x:42,y:702,size:17,font:bold,color:navy})
  page.drawText('Tamper-evident sealing information for this transaction.',{x:42,y:681,size:8.2,font:regular,color:muted})
  const blocks=[['Final Signed PDF SHA-256',signedPdfHash],['Event Chain Head',chainHead],['Sealed At',fmt(sealedAt)],['Envelope ID',envelope.public_id]]
  y=637
  for(const [label,value] of blocks){
    page.drawText(label.toUpperCase(),{x:42,y,size:6.2,font:bold,color:muted})
    page.drawRectangle({x:42,y:y-43,width:528,height:34,color:pale,borderColor:line,borderWidth:.4})
    page.drawText(safe(value,300),{x:54,y:y-30,size:7.3,font:bold,color:navy,maxWidth:500})
    y-=67
  }
  sectionTitle(page,bold,'Integrity Method',357)
  y=329
  const integrity='Each recorded evidence event is linked to the preceding event using SHA-256. The completed PDF, certificate, evidence manifest, and final event-chain head are then bound by the Pinnacle Document Integrity System. Any change to a sealed artifact or any insertion, removal, or reordering of events changes the expected cryptographic fingerprints.'
  for(const l of wrap(integrity,108)){page.drawText(l,{x:42,y,size:7.8,font:regular,color:ink,maxWidth:528});y-=12.5}

  page.drawRectangle({x:42,y:150,width:528,height:112,color:navy})
  page.drawText('OFFICIAL COMPLETION CERTIFICATION',{x:58,y:235,size:7.5,font:bold,color:gold})
  page.drawText('Pinnacle Management Ventures certifies that this electronic record completed the configured',{x:58,y:211,size:7.6,font:regular,color:white,maxWidth:488})
  page.drawText('electronic-signature workflow and that the associated evidence artifacts were sealed together',{x:58,y:197,size:7.6,font:regular,color:white,maxWidth:488})
  page.drawText('by the Pinnacle Document Integrity System.',{x:58,y:183,size:7.6,font:regular,color:white,maxWidth:488})
  page.drawText(`Certificate generated ${fmt(sealedAt)}`,{x:58,y:162,size:6.4,font:regular,color:rgb(.78,.81,.84)})

  const legalLines=wrap(legal,118).slice(0,5);let ly=123
  for(const l of legalLines){page.drawText(l,{x:42,y:ly,size:6.1,font:regular,color:muted,maxWidth:528});ly-=9}

  pdf.setTitle(`Certificate of Completion - ${safe(envelope.public_id,100)}`)
  pdf.setAuthor('Pinnacle Management Ventures')
  pdf.setSubject(`Electronic signature completion and audit evidence for ${safe(envelope.title,160)}`)
  pdf.setProducer('Pinnacle Management Ventures Document Integrity System')
  pdf.setKeywords(['Pinnacle Management Ventures','certificate of completion','electronic signature','audit trail',safe(envelope.public_id,80)])
  pdf.setCreationDate(new Date(sealedAt))
  const bytes=await pdf.save({useObjectStreams:true})
  return {bytes,sha256:await sha(bytes),pageCount:pdf.getPageCount(),fontFamily:'Arial-compatible Helvetica fallback'}
}
