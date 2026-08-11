import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { Env } from './types'
import { uuid } from './crypto'
import { renderBrandedAuditCertificate } from './auditCertificateBranded'

const enc = new TextEncoder()
function b64(bytes:Uint8Array){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}
function unb64(s:string){const bin=atob(s),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
export async function sha256Hex(input:string|ArrayBuffer|Uint8Array){const bytes=typeof input==='string'?enc.encode(input):input instanceof Uint8Array?input:new Uint8Array(input);const digest=await crypto.subtle.digest('SHA-256',bytes as BufferSource);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function safeText(v:unknown,max=4000){return String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max)}
function hex(value:unknown,fallback:string){const s=String(value||'');return /^#[0-9a-f]{6}$/i.test(s)?s:fallback}
function pdfColor(value:unknown,fallback:string){const h=hex(value,fallback);return rgb(parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255)}
function standardFont(family:unknown,bold=false){const f=String(family||'').toLowerCase();if(/times|georgia|serif|garamond|baskerville/.test(f))return bold?StandardFonts.TimesRomanBold:StandardFonts.TimesRoman;if(/courier|mono/.test(f))return bold?StandardFonts.CourierBold:StandardFonts.Courier;return bold?StandardFonts.HelveticaBold:StandardFonts.Helvetica}
function safeJson(raw:unknown){try{return typeof raw==='string'&&raw?JSON.parse(raw):{}}catch{return {}}}
async function loadBrand(env:Env,envelope:any){
  if(envelope.branding_profile_version_id){const v=await env.DB.prepare('SELECT snapshot_json FROM branding_profile_versions WHERE id=?').bind(envelope.branding_profile_version_id).first<any>();if(v?.snapshot_json)try{return JSON.parse(v.snapshot_json)}catch{}}
  if(envelope.branding_profile_id){const p=await env.DB.prepare('SELECT * FROM branding_profiles WHERE id=?').bind(envelope.branding_profile_id).first<any>();if(p)return p}
  return await env.DB.prepare("SELECT * FROM branding_profiles WHERE status='active' ORDER BY is_default DESC,updated_at DESC LIMIT 1").first<any>()||{}
}

async function signBinding(env:Env,binding:string):Promise<{algorithm:string;keyId:string;signature:string}>{
  if(env.DOCUMENT_SIGNING_PRIVATE_KEY){const key=await crypto.subtle.importKey('pkcs8',unb64(env.DOCUMENT_SIGNING_PRIVATE_KEY) as unknown as BufferSource,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(binding) as unknown as BufferSource);return{algorithm:'ECDSA-P256-SHA256',keyId:env.DOCUMENT_SIGNING_KEY_ID||'pmv-document-key',signature:b64(new Uint8Array(sig))}}
  const key=await crypto.subtle.importKey('raw',enc.encode(env.SESSION_SECRET) as unknown as BufferSource,{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,enc.encode(binding) as unknown as BufferSource);return{algorithm:'HMAC-SHA256',keyId:'pmv-server-seal',signature:b64(new Uint8Array(sig))}
}

export interface SealEnvelopeResult{signedFileId:string;auditFileId:string;manifestFileId:string;signedPdfHash:string;auditPdfHash:string;manifestHash:string;chainHead:string;sealedAt:string;algorithm:string;keyId:string;signature:string}

export async function sealEnvelope(env:Env,envelopeId:string):Promise<SealEnvelopeResult>{
  if(!env.UPLOADS)throw new Error('Document storage is not configured.')
  const envelope=await env.DB.prepare(`SELECT e.*,f.storage_key source_storage_key,f.mime_type source_mime_type,f.original_name source_name FROM envelopes e JOIN document_files f ON f.id=e.source_file_id WHERE e.id=?`).bind(envelopeId).first<any>()
  if(!envelope)throw new Error('Envelope not found.')
  if(envelope.source_mime_type!=='application/pdf'&&!String(envelope.source_name||'').toLowerCase().endsWith('.pdf'))throw new Error('Final rendering currently requires a PDF source document.')
  const object=await env.UPLOADS.get(envelope.source_storage_key);if(!object)throw new Error('Source document is missing from private storage.')
  const sourceBytes=new Uint8Array(await object.arrayBuffer())
  const pdf=await PDFDocument.load(sourceBytes,{ignoreEncryption:false})
  const brand=await loadBrand(env,envelope),pdfSettings=safeJson(brand.pdf_settings_json)
  const regular=await pdf.embedFont(standardFont(brand.body_font_family,false)),bold=await pdf.embedFont(standardFont(brand.heading_font_family,true))
  const primary=pdfColor(brand.primary_color,'#C9A227'),secondary=pdfColor(brand.secondary_color,'#06111F'),muted=rgb(.35,.38,.42)
  const fields=await env.DB.prepare(`SELECT f.*,r.name recipient_name,r.email recipient_email FROM document_fields f JOIN envelope_recipients r ON r.id=f.recipient_id WHERE f.envelope_id=? ORDER BY f.page_number,f.created_at`).bind(envelopeId).all<any>()
  for(const field of fields.results||[]){
    if(!field.completed_at)continue;const page=pdf.getPages()[Math.max(0,Number(field.page_number||1)-1)];if(!page)continue
    const {width:pw,height:ph}=page.getSize(),x=Number(field.x)*pw,boxW=Math.max(8,Number(field.width)*pw),boxH=Math.max(8,Number(field.height)*ph),y=ph-Number(field.y)*ph-boxH
    if(field.field_type==='checkbox'){page.drawRectangle({x,y,width:Math.min(boxH,boxW),height:Math.min(boxH,boxW),borderWidth:1,borderColor:secondary});if(String(field.value_text)==='true')page.drawText('X',{x:x+2,y:y+1,size:Math.max(7,Math.min(boxH,boxW)-3),font:bold,color:secondary});continue}
    let value=safeText(field.value_text,1000);if(field.field_type==='date'&&!value)value=new Date(field.completed_at).toISOString().slice(0,10)
    if(field.field_type==='signature'){const name=value||safeText(field.recipient_name,160),size=Math.max(10,Math.min(Number(pdfSettings.signatureSize||18),boxH*.55));page.drawText(name,{x,y:y+Math.max(1,(boxH-size)/2),size,font:bold,color:secondary,maxWidth:boxW});page.drawLine({start:{x,y},end:{x:x+boxW,y},thickness:.7,color:primary});page.drawText('Electronically signed',{x,y:Math.max(2,y-8),size:5.5,font:regular,color:muted,maxWidth:boxW});continue}
    if(field.field_type==='initial'){page.drawText(value||safeText(field.recipient_name).split(/\s+/).map((v:string)=>v[0]||'').join('').slice(0,5),{x,y:y+Math.max(1,boxH*.25),size:Math.max(8,Math.min(15,boxH*.6)),font:bold,color:secondary,maxWidth:boxW});continue}
    page.drawText(value,{x,y:y+Math.max(1,boxH*.25),size:Math.max(7,Math.min(Number(pdfSettings.bodySize||11),boxH*.45)),font:regular,color:secondary,maxWidth:boxW,lineHeight:11})
  }
  const header=safeText(brand.pdf_header_text||'',160),footer=safeText(brand.pdf_footer_text||'',180),showChrome=pdfSettings.showHeaderFooter!==false
  if(showChrome&&(header||footer))for(const page of pdf.getPages()){const {width,height}=page.getSize();if(header){page.drawLine({start:{x:24,y:height-20},end:{x:width-24,y:height-20},thickness:.45,color:primary,opacity:.55});page.drawText(header,{x:24,y:height-15,size:6,font:bold,color:secondary,maxWidth:width-48})}if(footer){page.drawLine({start:{x:24,y:17},end:{x:width-24,y:17},thickness:.4,color:primary,opacity:.4});page.drawText(footer,{x:24,y:7,size:5.6,font:regular,color:muted,maxWidth:width-48})}}
  pdf.setTitle(`${safeText(envelope.title,180)} — Signed`);pdf.setAuthor('Pinnacle Management Ventures');pdf.setProducer('Pinnacle Management Ventures Document Hub');pdf.setSubject(`Completed electronic signature envelope ${envelope.public_id}`);pdf.setKeywords(['Pinnacle Management Ventures','electronic signature',envelope.public_id]);pdf.setModificationDate(new Date())
  const signedPdfBytes=await pdf.save({useObjectStreams:true}),signedPdfHash=await sha256Hex(signedPdfBytes)
  const recipients=await env.DB.prepare(`SELECT id,name,email,role,routing_order,status,first_viewed_at,completed_at,declined_at FROM envelope_recipients WHERE envelope_id=? ORDER BY routing_order,created_at`).bind(envelopeId).all<any>()
  const events=await env.DB.prepare(`SELECT id,recipient_id,actor_type,actor_id,event_type,occurred_at_utc,ip_address,geo_city,geo_region,geo_country,geo_lat_approx,geo_lon_approx,user_agent,browser_family,os_family,device_class,device_fingerprint_hash,request_id,metadata_json,prev_event_hash,event_hash FROM envelope_events WHERE envelope_id=? ORDER BY occurred_at_utc,id`).bind(envelopeId).all<any>()
  const chainHead=String((events.results||[]).at(-1)?.event_hash||'GENESIS'),sealedAt=new Date().toISOString()
  const certificate=await renderBrandedAuditCertificate(env,envelope,recipients.results||[],events.results||[],signedPdfHash,chainHead,sealedAt)
  const auditPdfBytes=certificate.bytes,auditPdfHash=certificate.sha256
  const manifestObject={version:3,issuer:'Pinnacle Management Ventures',certificate_type:'Certificate of Completion + Audit Trail',envelope_id:envelope.id,public_id:envelope.public_id,title:envelope.title,branding:{profile_id:envelope.branding_profile_id||null,profile_version_id:envelope.branding_profile_version_id||null},completed_at_utc:envelope.completed_at||sealedAt,sealed_at_utc:sealedAt,artifacts:{signed_pdf_sha256:signedPdfHash,audit_certificate_sha256:auditPdfHash},event_chain:{algorithm:'SHA-256',head_hash:chainHead,event_count:(events.results||[]).length},recipients:(recipients.results||[]).map((r:any)=>({id:r.id,role:r.role,name:r.name,email:r.email,status:r.status,completed_at:r.completed_at})),events:(events.results||[]).map((ev:any)=>({id:ev.id,recipient_id:ev.recipient_id,event_type:ev.event_type,occurred_at_utc:ev.occurred_at_utc,request_id:ev.request_id,prev_event_hash:ev.prev_event_hash,event_hash:ev.event_hash}))}
  const manifestBytes=enc.encode(JSON.stringify(manifestObject,null,2)),manifestHash=await sha256Hex(manifestBytes)
  const binding=JSON.stringify({envelope_id:envelope.id,public_id:envelope.public_id,signed_pdf_sha256:signedPdfHash,audit_pdf_sha256:auditPdfHash,manifest_sha256:manifestHash,event_chain_head_hash:chainHead,sealed_at:sealedAt})
  const seal=await signBinding(env,binding)
  const signedFileId=uuid(),auditFileId=uuid(),manifestFileId=uuid(),signedKey=`documents/final/${envelope.id}/${envelope.public_id}-signed.pdf`,auditKey=`documents/audit/${envelope.id}/${envelope.public_id}-certificate-of-completion.pdf`,manifestKey=`documents/evidence/${envelope.id}/${envelope.public_id}-evidence.json`
  await Promise.all([env.UPLOADS.put(signedKey,signedPdfBytes,{httpMetadata:{contentType:'application/pdf'},customMetadata:{envelopeId,kind:'signed_pdf',sha256:signedPdfHash}}),env.UPLOADS.put(auditKey,auditPdfBytes,{httpMetadata:{contentType:'application/pdf'},customMetadata:{envelopeId,kind:'audit_certificate',sha256:auditPdfHash}}),env.UPLOADS.put(manifestKey,manifestBytes,{httpMetadata:{contentType:'application/json'},customMetadata:{envelopeId,kind:'evidence_manifest',sha256:manifestHash}})])
  const insertFile=(id:string,kind:string,name:string,mime:string,key:string,size:number,hash:string)=>env.DB.prepare(`INSERT INTO document_files (id,kind,original_name,mime_type,storage_key,size_bytes,sha256,created_by_user_id) VALUES (?,?,?,?,?,?,?,NULL)`).bind(id,kind,name,mime,key,size,hash)
  await env.DB.batch([insertFile(signedFileId,'signed_pdf',`${envelope.public_id}-signed.pdf`,'application/pdf',signedKey,signedPdfBytes.length,signedPdfHash),insertFile(auditFileId,'audit_certificate',`${envelope.public_id}-certificate-of-completion.pdf`,'application/pdf',auditKey,auditPdfBytes.length,auditPdfHash),insertFile(manifestFileId,'evidence_manifest',`${envelope.public_id}-evidence.json`,'application/json',manifestKey,manifestBytes.length,manifestHash),env.DB.prepare(`UPDATE envelopes SET final_signed_file_id=?,audit_certificate_file_id=?,evidence_manifest_file_id=?,updated_at=? WHERE id=?`).bind(signedFileId,auditFileId,manifestFileId,sealedAt,envelopeId),env.DB.prepare(`INSERT OR REPLACE INTO envelope_seals (id,envelope_id,seal_version,final_pdf_sha256,audit_pdf_sha256,manifest_sha256,event_chain_head_hash,signature_algorithm,public_key_id,digital_signature,sealed_at) VALUES (?,?,3,?,?,?,?,?,?,?,?)`).bind(uuid(),envelopeId,signedPdfHash,auditPdfHash,manifestHash,chainHead,seal.algorithm,seal.keyId,seal.signature,sealedAt)])
  return{signedFileId,auditFileId,manifestFileId,signedPdfHash,auditPdfHash,manifestHash,chainHead,sealedAt,algorithm:seal.algorithm,keyId:seal.keyId,signature:seal.signature}
}
