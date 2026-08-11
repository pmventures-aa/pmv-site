import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { Env } from './types'

function safe(v:unknown,max=3000){return String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max)}
function fmt(ts:unknown){const d=new Date(String(ts||''));return Number.isNaN(d.getTime())?safe(ts):d.toISOString().replace('T',' ').replace('.000Z',' UTC')}
function short(v:unknown){const s=safe(v,160);return s.length>52?`${s.slice(0,24)}...${s.slice(-24)}`:s}
function role(v:unknown){return safe(v,80).replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase())}
function wrap(text:string,max=96){const words=text.split(/\s+/).filter(Boolean),out:string[]=[];let line='';for(const word of words){const next=line?`${line} ${word}`:word;if(next.length<=max)line=next;else{if(line)out.push(line);line=word}}if(line)out.push(line);return out}
function hex(value:unknown,fallback:string){const s=String(value||'');return /^#[0-9a-f]{6}$/i.test(s)?s:fallback}
function color(value:unknown,fallback:string){const h=hex(value,fallback);return rgb(parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255)}
function standardFont(family:unknown,bold=false){const f=String(family||'').toLowerCase();if(/times|georgia|serif|garamond|baskerville/.test(f))return bold?StandardFonts.TimesRomanBold:StandardFonts.TimesRoman;if(/courier|mono/.test(f))return bold?StandardFonts.CourierBold:StandardFonts.Courier;return bold?StandardFonts.HelveticaBold:StandardFonts.Helvetica}
async function sha(bytes:Uint8Array){const digest=await crypto.subtle.digest('SHA-256',bytes as BufferSource);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}

async function loadProfile(env:Env,envelope:any){
  if(envelope.branding_profile_version_id){const row=await env.DB.prepare('SELECT snapshot_json FROM branding_profile_versions WHERE id=?').bind(envelope.branding_profile_version_id).first<any>();if(row?.snapshot_json)try{return JSON.parse(row.snapshot_json)}catch{}}
  if(envelope.branding_profile_id){const row=await env.DB.prepare('SELECT * FROM branding_profiles WHERE id=?').bind(envelope.branding_profile_id).first<any>();if(row)return row}
  return await env.DB.prepare("SELECT * FROM branding_profiles WHERE status='active' ORDER BY is_default DESC,updated_at DESC LIMIT 1").first<any>()||{}
}

function text(page:PDFPage,font:PDFFont,value:string,x:number,y:number,size:number,maxWidth:number,ink:any){page.drawText(safe(value),{x,y,size,font,color:ink,maxWidth,lineHeight:size*1.35})}

export async function renderBrandedAuditCertificate(env:Env,envelope:any,recipients:any[],events:any[],signedPdfHash:string,chainHead:string,sealedAt:string){
  const profile=await loadProfile(env,envelope)
  const pdf=await PDFDocument.create()
  const regular=await pdf.embedFont(standardFont(profile.body_font_family,false))
  const bold=await pdf.embedFont(standardFont(profile.body_font_family,true))
  const heading=await pdf.embedFont(standardFont(profile.heading_font_family,true))
  const navy=color(profile.secondary_color,'#06111F'),gold=color(profile.primary_color,'#C9A227'),ink=color(profile.text_color,'#172033'),cream=color(profile.background_color,'#F7F4EC')
  const muted=rgb(.39,.43,.49),line=rgb(.86,.87,.89),white=rgb(1,1,1),green=rgb(.10,.42,.25)
  const header=safe(profile.pdf_header_text||'Pinnacle Management Ventures',160),footer=safe(profile.pdf_footer_text||'pinnaclemanagementventures.com',180)
  const ronEvents=events.filter(e=>String(e.event_type||'').toLowerCase().startsWith('ron.')||String(e.metadata_json||'').toLowerCase().includes('remote online notar'))
  let pageNo=0
  const addPage=(title:string)=>{const page=pdf.addPage([612,792]);pageNo++;page.drawRectangle({x:0,y:744,width:612,height:48,color:navy});text(page,bold,header.toUpperCase(),38,765,8.5,320,white);text(page,regular,title.toUpperCase(),378,765,7,195,white);page.drawLine({start:{x:38,y:36},end:{x:574,y:36},thickness:.5,color:line});text(page,regular,footer,38,20,6.2,330,muted);text(page,regular,`${envelope.public_id}  |  PAGE ${pageNo}`,430,20,6.2,145,muted);return page}
  const section=(page:PDFPage,title:string,y:number)=>{text(page,bold,title.toUpperCase(),42,y,7.5,500,navy);page.drawLine({start:{x:42,y:y-9},end:{x:570,y:y-9},thickness:.6,color:line})}

  let page=addPage(ronEvents.length?'RON / Electronic Evidence Certificate':'Electronic Evidence Certificate')
  text(page,heading,ronEvents.length?'Remote Online Notarization & Signature Evidence':'Certificate of Completion',42,675,23,510,navy)
  text(page,regular,'Pinnacle Management Ventures document integrity record',42,648,9,510,muted)
  page.drawRectangle({x:42,y:584,width:528,height:42,color:cream,borderColor:line,borderWidth:.5})
  page.drawCircle({x:61,y:605,size:7,color:green});text(page,bold,'COMPLETE & SEALED',77,599,10.5,170,green)
  text(page,regular,'Required actions completed and the evidence bundle was cryptographically sealed.',245,599,7.2,310,muted)
  section(page,'Transaction Summary',548)
  const rows:[string,string][]=[['Document',safe(envelope.title,180)],['Transaction ID',safe(envelope.public_id,90)],['Completed',fmt(envelope.completed_at||sealedAt)],['Sealed',fmt(sealedAt)],['Participants',String(recipients.length)],['Evidence Events',String(events.length)],['Workflow',ronEvents.length?'RON evidence present + electronic signature':'Electronic signature']]
  let y=520
  for(const [label,value] of rows){text(page,bold,label.toUpperCase(),42,y,6.1,138,muted);text(page,regular,value,190,y-1,8.5,375,ink);page.drawLine({start:{x:42,y:y-12},end:{x:570,y:y-12},thickness:.35,color:line});y-=32}
  section(page,'Artifact Integrity',282)
  text(page,bold,'FINAL SIGNED PDF SHA-256',42,253,6.1,220,muted);text(page,bold,short(signedPdfHash),42,236,8,520,navy)
  text(page,bold,'EVENT CHAIN HEAD',42,205,6.1,220,muted);text(page,bold,short(chainHead),42,188,8,520,navy)
  const disclaimer=safe(profile.legal_disclaimer||'This certificate records authentication, signing, document, and technical evidence maintained by Pinnacle Management Ventures. RON-specific statements apply only when the evidence trail identifies a separate remote online notarization session.',1800)
  page.drawRectangle({x:42,y:74,width:528,height:82,color:navy});text(page,bold,'RECORD NOTICE',56,134,6.5,480,gold);let dy=116;for(const l of wrap(disclaimer,105).slice(0,5)){text(page,regular,l,56,dy,6.7,485,white);dy-=11}

  page=addPage('Participants & Authentication')
  text(page,heading,'Participants & Authentication',42,700,17,520,navy);text(page,regular,'Recorded participant roles, status, authentication, and completion evidence.',42,678,8.2,520,muted)
  y=644
  for(const r of recipients){if(y<145){page=addPage('Participants & Authentication');y=700}page.drawRectangle({x:42,y:y-82,width:528,height:82,color:white,borderColor:line,borderWidth:.55});page.drawRectangle({x:42,y:y-82,width:4,height:82,color:r.status==='completed'?green:gold});text(page,bold,safe(r.name,120),58,y-20,10,270,navy);text(page,bold,role(r.role),430,y-20,6.7,120,gold);text(page,regular,safe(r.email,180),58,y-38,7.1,310,muted);text(page,bold,`STATUS  ${role(r.status)}`,58,y-58,6.2,150,r.status==='completed'?green:ink);text(page,regular,`COMPLETED  ${fmt(r.completed_at||'Not completed')}`,220,y-58,6.2,325,ink);const passed=events.find(e=>e.recipient_id===r.id&&e.event_type==='authentication.passed');let method='Secure signing session';if(passed?.metadata_json)try{const m=JSON.parse(passed.metadata_json);if(m.method==='email_otp')method='Email OTP + secure signing session'}catch{}text(page,regular,`Authentication: ${method}`,58,y-73,6.5,475,ink);y-=96}

  if(ronEvents.length){page=addPage('RON Evidence');text(page,heading,'Remote Online Notarization Evidence',42,700,17,520,navy);text(page,regular,'This section is populated only when RON-specific events exist in the transaction evidence chain.',42,678,8.2,520,muted);y=642;for(const ev of ronEvents){if(y<120){page=addPage('RON Evidence');y=700}text(page,bold,fmt(ev.occurred_at_utc),42,y,6.7,145,navy);text(page,bold,role(ev.event_type),190,y,7.2,365,ink);y-=13;const location=[ev.geo_city,ev.geo_region,ev.geo_country].filter(Boolean).join(', ');text(page,regular,`Actor: ${role(ev.actor_type)}${ev.ip_address?`  |  IP: ${safe(ev.ip_address,80)}`:''}${location?`  |  ${location}`:''}`,190,y,6.1,365,muted);y-=11;text(page,regular,`Hash: ${short(ev.event_hash)}`,190,y,5.8,365,muted);y-=22;page.drawLine({start:{x:42,y},end:{x:570,y},thickness:.35,color:line});y-=15}}

  page=addPage('Chronological Evidence Trail')
  text(page,heading,'Chronological Evidence Trail',42,700,17,520,navy);text(page,regular,'Append-only events recorded in UTC and linked through SHA-256 hashes.',42,678,8.2,520,muted);y=642
  for(const ev of events){if(y<112){page=addPage('Chronological Evidence Trail');y=700}text(page,bold,fmt(ev.occurred_at_utc),42,y,6.5,142,navy);text(page,bold,safe(ev.event_type,100).replaceAll('.',' / '),190,y,7.1,365,ink);y-=13;const location=[ev.geo_city,ev.geo_region,ev.geo_country].filter(Boolean).join(', '),device=[ev.device_class,ev.browser_family,ev.os_family].filter(Boolean).join(' / ');text(page,regular,`Actor: ${role(ev.actor_type)}${ev.ip_address?`  |  IP: ${safe(ev.ip_address,80)}`:''}`,190,y,6,365,muted);y-=10;if(location||device){text(page,regular,`${location?`Location: ${safe(location,130)}`:''}${location&&device?'  |  ':''}${device?`Device: ${safe(device,150)}`:''}`,190,y,5.9,365,muted);y-=10}text(page,regular,`Event hash: ${short(ev.event_hash)}`,190,y,5.6,365,muted);y-=14;page.drawLine({start:{x:42,y},end:{x:570,y},thickness:.3,color:line});y-=14}

  page=addPage('Cryptographic Integrity')
  text(page,heading,'Cryptographic Integrity',42,700,17,520,navy);text(page,regular,'Tamper-evident sealing information for this transaction.',42,678,8.2,520,muted)
  const blocks=[['Final Signed PDF SHA-256',signedPdfHash],['Event Chain Head',chainHead],['Sealed At',fmt(sealedAt)],['Envelope ID',envelope.public_id]];y=638
  for(const [label,value] of blocks){text(page,bold,label.toUpperCase(),42,y,6.1,220,muted);page.drawRectangle({x:42,y:y-44,width:528,height:34,color:cream,borderColor:line,borderWidth:.4});text(page,bold,safe(value,300),54,y-31,7.2,500,navy);y-=68}
  page.drawRectangle({x:42,y:142,width:528,height:112,color:navy});text(page,bold,'PINNACLE DOCUMENT INTEGRITY SYSTEM',58,226,7.3,470,gold);text(page,regular,'The completed PDF, this certificate, the evidence manifest, and the final event-chain head are bound by cryptographic fingerprints.',58,203,7.4,480,white);text(page,regular,'Any later change to a sealed artifact, or any insertion, removal, or reordering of evidence events, changes the expected fingerprints.',58,183,7.4,480,white);text(page,regular,`Verification reference: ${envelope.public_id}`,58,158,7.2,480,white)

  pdf.setTitle(`${safe(envelope.title,180)} - Audit Trail`);pdf.setAuthor('Pinnacle Management Ventures');pdf.setProducer('Pinnacle Management Ventures Document Integrity System');pdf.setSubject(ronEvents.length?'RON and electronic-signature evidence record':'Electronic-signature evidence record');pdf.setModificationDate(new Date())
  const bytes=await pdf.save({useObjectStreams:true});return {bytes,sha256:await sha(bytes)}
}
