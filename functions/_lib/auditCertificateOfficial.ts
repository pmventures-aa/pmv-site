import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont, type PDFPage } from 'pdf-lib'
import type { Env } from './types'

const enc = new TextEncoder()
const navy = rgb(0.035,0.075,0.13)
const gold = rgb(0.79,0.64,0.15)
const ink = rgb(0.10,0.13,0.17)
const muted = rgb(0.38,0.42,0.47)
const pale = rgb(0.965,0.968,0.97)
const green = rgb(0.11,0.47,0.28)

function safe(v:unknown,max=3000){return String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max)}
function wrap(text:string,max:number){const words=text.split(/\s+/).filter(Boolean);const lines:string[]=[];let line='';for(const w of words){const n=line?`${line} ${w}`:w;if(n.length<=max)line=n;else{if(line)lines.push(line);line=w}}if(line)lines.push(line);return lines}
function fmt(ts:unknown){const d=new Date(String(ts||''));return Number.isNaN(d.getTime())?safe(ts):`${d.toISOString().replace('T',' ').replace('.000Z',' UTC')}`}
function shortHash(v:unknown){const s=safe(v,128);return s.length>42?`${s.slice(0,18)}…${s.slice(-18)}`:s}
function roleLabel(v:unknown){return safe(v,40).replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase())}

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

function header(page:PDFPage,regular:PDFFont,bold:PDFFont,logo:PDFImage|null,pageNo:number,publicId:string){
  page.drawRectangle({x:0,y:742,width:612,height:50,color:navy})
  if(logo){const s=logo.scale(1);const h=30,w=h*(s.width/s.height);page.drawImage(logo,{x:40,y:751,width:w,height:h})}
  page.drawText('PINNACLE MANAGEMENT VENTURES',{x:logo?80:40,y:766,size:9,font:bold,color:rgb(1,1,1)})
  page.drawText('DOCUMENT INTEGRITY SYSTEM',{x:logo?80:40,y:752,size:6.5,font:regular,color:gold})
  page.drawText(publicId,{x:410,y:766,size:7.5,font:bold,color:rgb(1,1,1),maxWidth:160})
  page.drawText(`CERTIFICATE · PAGE ${pageNo}`,{x:410,y:752,size:6.2,font:regular,color:rgb(.72,.76,.8),maxWidth:160})
  page.drawRectangle({x:0,y:0,width:612,height:25,color:navy})
  page.drawText('Pinnacle Management Ventures · Secure Document Integrity Record',{x:40,y:9,size:6.2,font:regular,color:rgb(.8,.82,.84)})
  page.drawText('pinnaclemanagementventures.com/verify',{x:405,y:9,size:6.2,font:regular,color:gold})
}

export async function renderOfficialAuditCertificate(env:Env,envelope:any,recipients:any[],events:any[],signedPdfHash:string,chainHead:string,sealedAt:string){
  const pdf=await PDFDocument.create()
  // Arial-compatible PDF typography. Standard Helvetica is the PDF-safe fallback until a licensed Arial asset is uploaded through Branding Settings.
  const regular=await pdf.embedFont(StandardFonts.Helvetica)
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold)
  const {profile,logo}=await loadBrand(env,envelope,pdf)
  const legal=profile?.legal_disclaimer||'This certificate records electronic-signature evidence maintained by Pinnacle Management Ventures. It documents the configured electronic-signature workflow and associated integrity evidence. It is not, by itself, a notarization or legal opinion.'
  let pageNo=0
  const addPage=()=>{const p=pdf.addPage([612,792]);pageNo++;header(p,regular,bold,logo,pageNo,envelope.public_id);return p}

  // COVER / CERTIFICATE OF COMPLETION
  let page=addPage()
  if(logo){const s=logo.scale(1);const h=70,w=h*(s.width/s.height);page.drawImage(logo,{x:42,y:630,width:w,height:h})}
  page.drawText('CERTIFICATE OF COMPLETION',{x:42,y:602,size:11,font:bold,color:gold})
  page.drawText('Electronic Signature',{x:42,y:555,size:30,font:bold,color:navy})
  page.drawText('& Evidence Record',{x:42,y:518,size:30,font:bold,color:navy})
  page.drawRectangle({x:42,y:454,width:528,height:42,color:rgb(.93,.965,.945),borderColor:rgb(.67,.82,.72),borderWidth:.8})
  page.drawCircle({x:62,y:475,size:9,color:green});page.drawText('✓',{x:57.5,y:468.7,size:12,font:bold,color:rgb(1,1,1)})
  page.drawText('CERTIFIED COMPLETE',{x:80,y:470,size:13,font:bold,color:green})
  page.drawText('All required signing actions completed and the evidence bundle was sealed.',{x:218,y:470,size:7.4,font:regular,color:muted,maxWidth:330})
  const pairs:[string,string][]=[['Document',safe(envelope.title,160)],['Envelope / Transaction ID',safe(envelope.public_id,80)],['Completed',fmt(envelope.completed_at||sealedAt)],['Sealed',fmt(sealedAt)],['Participants',String(recipients.length)],['Issuer','Pinnacle Management Ventures']]
  let y=414
  for(const [l,v] of pairs){page.drawText(l.toUpperCase(),{x:42,y,size:6.4,font:bold,color:muted});page.drawText(v,{x:190,y-1,size:9.2,font:l==='Envelope / Transaction ID'?bold:regular,color:ink,maxWidth:370});page.drawLine({start:{x:42,y:y-11},end:{x:570,y:y-11},thickness:.45,color:rgb(.87,.88,.89)});y-=36}
  page.drawText('DOCUMENT FINGERPRINT',{x:42,y:184,size:6.4,font:bold,color:muted})
  page.drawRectangle({x:42,y:134,width:528,height:38,color:pale})
  page.drawText(shortHash(signedPdfHash),{x:54,y:150,size:8.3,font:bold,color:navy,maxWidth:500})
  page.drawText('SHA-256 · final signed PDF',{x:54,y:138,size:6.2,font:regular,color:muted})
  page.drawText('Verification',{x:42,y:104,size:7,font:bold,color:navy})
  page.drawText(`Verify this record using ${safe(envelope.public_id)} at pinnaclemanagementventures.com/verify`,{x:42,y:88,size:7.4,font:regular,color:muted,maxWidth:520})

  // PARTICIPANTS + AUTHENTICATION
  page=addPage();page.drawText('PARTICIPANTS & AUTHENTICATION',{x:42,y:710,size:15,font:bold,color:navy});page.drawText('Recorded completion and authentication summary',{x:42,y:691,size:8,font:regular,color:muted})
  y=650
  for(const r of recipients){if(y<150){page=addPage();y=700}
    page.drawRectangle({x:42,y:y-92,width:528,height:92,color:pale,borderColor:rgb(.86,.87,.88),borderWidth:.5})
    page.drawText(safe(r.name,120),{x:56,y:y-22,size:11,font:bold,color:navy,maxWidth:280})
    page.drawText(roleLabel(r.role),{x:430,y:y-22,size:7,font:bold,color:gold,maxWidth:120})
    page.drawText(safe(r.email,180),{x:56,y:y-39,size:7.5,font:regular,color:muted,maxWidth:300})
    page.drawText(`Status: ${roleLabel(r.status)}`,{x:56,y:y-59,size:7.4,font:bold,color:r.status==='completed'?green:ink})
    page.drawText(`Completed: ${fmt(r.completed_at||'Not completed')}`,{x:220,y:y-59,size:7.2,font:regular,color:ink,maxWidth:320})
    const authEvents=events.filter(e=>e.recipient_id===r.id&&String(e.event_type).startsWith('authentication.'))
    const auth=authEvents.find(e=>e.event_type==='authentication.passed')
    let method='Secure signing session'
    if(auth?.metadata_json)try{const m=JSON.parse(auth.metadata_json);if(m.method==='email_otp')method='Email OTP + secure signing session'}catch{}
    page.drawText(`Authentication: ${method}`,{x:56,y:y-77,size:7.2,font:regular,color:ink,maxWidth:480})
    y-=108
  }
  page.drawText('Authentication codes and raw challenge answers are never printed in this certificate.',{x:42,y:70,size:6.5,font:regular,color:muted,maxWidth:520})

  // EVIDENCE TIMELINE
  page=addPage();page.drawText('CHRONOLOGICAL EVIDENCE TRAIL',{x:42,y:710,size:15,font:bold,color:navy});page.drawText('Append-only events recorded in UTC and linked by cryptographic hash',{x:42,y:691,size:8,font:regular,color:muted});y=650
  for(const ev of events){if(y<108){page=addPage();page.drawText('CHRONOLOGICAL EVIDENCE TRAIL · CONTINUED',{x:42,y:710,size:12,font:bold,color:navy});y=675}
    page.drawCircle({x:51,y:y+2,size:3.2,color:gold});page.drawLine({start:{x:51,y:y-6},end:{x:51,y:y-55},thickness:.65,color:rgb(.84,.79,.63)})
    page.drawText(fmt(ev.occurred_at_utc),{x:68,y,size:7.2,font:bold,color:navy,maxWidth:175})
    page.drawText(safe(ev.event_type,90).replaceAll('.','  ›  '),{x:255,y,size:8,font:bold,color:ink,maxWidth:300})
    y-=15
    const location=[ev.geo_city,ev.geo_region,ev.geo_country].filter(Boolean).join(', ')
    const device=[ev.device_class,ev.browser_family,ev.os_family].filter(Boolean).join(' · ')
    page.drawText(`Actor: ${roleLabel(ev.actor_type)}${ev.ip_address?`   ·   IP: ${safe(ev.ip_address,80)}`:''}`,{x:68,y,size:6.6,font:regular,color:muted,maxWidth:495});y-=11
    if(location||device){page.drawText(`${location?`Location: ${safe(location,150)}`:''}${location&&device?'   ·   ':''}${device?`Device: ${safe(device,160)}`:''}`,{x:68,y,size:6.5,font:regular,color:muted,maxWidth:495});y-=11}
    page.drawText(`Event hash: ${shortHash(ev.event_hash)}`,{x:68,y,size:6,font:regular,color:rgb(.48,.5,.53),maxWidth:495});y-=29
  }

  // CRYPTOGRAPHIC INTEGRITY / CERTIFICATION
  page=addPage();page.drawText('CRYPTOGRAPHIC INTEGRITY',{x:42,y:710,size:15,font:bold,color:navy});page.drawText('Tamper-evident sealing information for this transaction',{x:42,y:691,size:8,font:regular,color:muted})
  const blocks=[['Final Signed PDF SHA-256',signedPdfHash],['Event Chain Head',chainHead],['Sealed At',fmt(sealedAt)],['Envelope ID',envelope.public_id]]
  y=645
  for(const [l,v] of blocks){page.drawText(l.toUpperCase(),{x:42,y,size:6.5,font:bold,color:muted});y-=15;page.drawRectangle({x:42,y:y-31,width:528,height:38,color:pale});page.drawText(safe(v,300),{x:54,y:y-15,size:7.5,font:bold,color:navy,maxWidth:500});y-=58}
  page.drawText('HOW INTEGRITY IS VERIFIED',{x:42,y:335,size:8,font:bold,color:gold});y=310
  const integrity='Each evidence event is linked to the event before it through SHA-256 hashing. The completed PDF, this certificate, the evidence manifest, and the final event-chain head are bound together by the Pinnacle Document Integrity System. Altering a sealed artifact or reordering, inserting, or removing evidence events changes the expected cryptographic fingerprints.'
  for(const l of wrap(integrity,104)){page.drawText(l,{x:42,y,size:8,font:regular,color:ink,maxWidth:528});y-=13}
  y-=18;page.drawRectangle({x:42,y:y-108,width:528,height:116,color:navy})
  page.drawText('OFFICIAL COMPLETION CERTIFICATION',{x:58,y:y-24,size:8,font:bold,color:gold})
  page.drawText('Pinnacle Management Ventures certifies that this electronic record completed the configured',{x:58,y:y-47,size:8,font:regular,color:rgb(1,1,1),maxWidth:490})
  page.drawText('electronic-signature workflow and that its associated evidence artifacts were sealed together',{x:58,y:y-61,size:8,font:regular,color:rgb(1,1,1),maxWidth:490})
  page.drawText('by the Pinnacle Document Integrity System.',{x:58,y:y-75,size:8,font:regular,color:rgb(1,1,1),maxWidth:490})
  page.drawText(`Certificate generated ${fmt(sealedAt)}`,{x:58,y:y-96,size:6.7,font:regular,color:rgb(.78,.8,.82)})
  for(const l of wrap(legal,116).slice(0,5)){page.drawText(l,{x:42,y:82,size:6.3,font:regular,color:muted,maxWidth:528});break}

  pdf.setTitle(`Certificate of Completion — ${safe(envelope.public_id,100)}`)
  pdf.setAuthor('Pinnacle Management Ventures')
  pdf.setSubject(`Electronic signature completion and audit evidence for ${safe(envelope.title,160)}`)
  pdf.setProducer('Pinnacle Management Ventures Document Integrity System')
  pdf.setKeywords(['Pinnacle Management Ventures','certificate of completion','electronic signature','audit trail',safe(envelope.public_id,80)])
  pdf.setCreationDate(new Date(sealedAt))
  const bytes=await pdf.save({useObjectStreams:true})
  return {bytes,sha256:await sha(bytes),pageCount:pdf.getPageCount(),fontFamily:'Arial-compatible Helvetica fallback'}
}
