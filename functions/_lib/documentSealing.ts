import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { Env } from './types'
import { uuid } from './crypto'
import { renderOfficialAuditCertificate } from './auditCertificateOfficial'
import { PUBLIC_SITE_URL } from './appUrls'
import { shortSnapshotHash } from './auditTrailFormat'
import { consentForEnvelope } from './consentPolicies'

const enc = new TextEncoder()
function b64(bytes:Uint8Array){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}
function unb64(s:string){const bin=atob(s),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
export async function sha256Hex(input:string|ArrayBuffer|Uint8Array){const bytes=typeof input==='string'?enc.encode(input):input instanceof Uint8Array?input:new Uint8Array(input);const digest=await crypto.subtle.digest('SHA-256',bytes as BufferSource);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function safeText(v:unknown,max=4000){return String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max)}

async function signBinding(env:Env,binding:string):Promise<{algorithm:string;keyId:string;signature:string}>{
  if(env.DOCUMENT_SIGNING_PRIVATE_KEY){const key=await crypto.subtle.importKey('pkcs8',unb64(env.DOCUMENT_SIGNING_PRIVATE_KEY) as unknown as BufferSource,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(binding) as unknown as BufferSource);return{algorithm:'ECDSA-P256-SHA256',keyId:env.DOCUMENT_SIGNING_KEY_ID||'pmv-document-key',signature:b64(new Uint8Array(sig))}}
  const key=await crypto.subtle.importKey('raw',enc.encode(env.SESSION_SECRET) as unknown as BufferSource,{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,enc.encode(binding) as unknown as BufferSource);return{algorithm:'HMAC-SHA256',keyId:'pmv-server-seal',signature:b64(new Uint8Array(sig))}
}

export interface SealEnvelopeResult{signedFileId:string;auditFileId:string;manifestFileId:string;signedPdfHash:string;auditPdfHash:string;manifestHash:string;chainHead:string;sealedAt:string;algorithm:string;keyId:string;signature:string}

type PacketDoc={id:string;document_file_id:string;title:string;sort_order:number;storage_key:string;mime_type:string;original_name:string;sha256:string}

async function loadPacket(env:Env,envelope:any){
  const rows=await env.DB.prepare(`SELECT d.id,d.document_file_id,d.title,d.sort_order,f.storage_key,f.mime_type,f.original_name,f.sha256 FROM envelope_documents d JOIN document_files f ON f.id=d.document_file_id WHERE d.envelope_id=? ORDER BY d.sort_order`).bind(envelope.id).all() as any
  let docs=(rows.results||[]) as PacketDoc[]
  if(!docs.length){docs=[{id:'source',document_file_id:envelope.source_file_id,title:envelope.title,sort_order:1,storage_key:envelope.source_storage_key,mime_type:envelope.source_mime_type,original_name:envelope.source_name,sha256:envelope.source_sha256}]}
  const merged=await PDFDocument.create(),offsets=new Map<string,number>(),packetManifest:any[]=[]
  for(const doc of docs){
    if(doc.mime_type!=='application/pdf'&&!String(doc.original_name||'').toLowerCase().endsWith('.pdf'))throw new Error(`Packet document ${doc.title} is not a PDF.`)
    const object=await env.UPLOADS!.get(doc.storage_key);if(!object)throw new Error(`Packet document ${doc.title} is missing from private storage.`)
    const bytes=new Uint8Array(await object.arrayBuffer()),source=await PDFDocument.load(bytes,{ignoreEncryption:false}),offset=merged.getPageCount()
    offsets.set(doc.id,offset);if(doc.id==='source')offsets.set('source',offset)
    const indices=source.getPageIndices(),copied=await merged.copyPages(source,indices);for(const page of copied)merged.addPage(page)
    packetManifest.push({id:doc.id,title:doc.title,sort_order:doc.sort_order,page_offset:offset,page_count:indices.length,sha256:doc.sha256||await sha256Hex(bytes)})
  }
  return{pdf:merged,offsets,packetManifest,firstDocumentId:docs[0]?.id||'source'}
}

export async function sealEnvelope(env:Env,envelopeId:string):Promise<SealEnvelopeResult>{
  if(!env.UPLOADS)throw new Error('Document storage is not configured.')
  const envelope=await env.DB.prepare(`SELECT e.*,f.storage_key source_storage_key,f.mime_type source_mime_type,f.original_name source_name,f.sha256 source_sha256 FROM envelopes e JOIN document_files f ON f.id=e.source_file_id WHERE e.id=?`).bind(envelopeId).first() as any
  if(!envelope)throw new Error('Envelope not found.')
  const packet=await loadPacket(env,envelope),pdf=packet.pdf
  const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold)
  const fields=await env.DB.prepare(`SELECT f.*,r.name recipient_name,r.email recipient_email FROM document_fields f JOIN envelope_recipients r ON r.id=f.recipient_id WHERE f.envelope_id=? ORDER BY f.page_number,f.created_at`).bind(envelopeId).all() as any
  for(const field of fields.results||[]){
    if(!field.completed_at)continue
    const docId=field.envelope_document_id||packet.firstDocumentId,pageOffset=packet.offsets.get(docId)??0,pageIndex=pageOffset+Math.max(0,Number(field.page_number||1)-1),page=pdf.getPages()[pageIndex]
    if(!page)continue
    const {width:pw,height:ph}=page.getSize(),x=Number(field.x)*pw,boxW=Math.max(8,Number(field.width)*pw),boxH=Math.max(8,Number(field.height)*ph),y=ph-Number(field.y)*ph-boxH
    const gold=rgb(.79,.64,.15),navy=rgb(.04,.09,.16)
    if(field.field_type==='checkbox'){page.drawRectangle({x,y,width:Math.min(boxH,boxW),height:Math.min(boxH,boxW),borderWidth:1,borderColor:navy});if(String(field.value_text)==='true')page.drawText('X',{x:x+2,y:y+1,size:Math.max(7,Math.min(boxH,boxW)-3),font:bold,color:navy});continue}
    let value=safeText(field.value_text,1000);if(field.field_type==='date'&&!value)value=new Date(field.completed_at).toISOString().slice(0,10)
    if(field.field_type==='signature'){const name=value||safeText(field.recipient_name,160),size=Math.max(10,Math.min(18,boxH*.55));page.drawText(name,{x,y:y+Math.max(1,(boxH-size)/2),size,font:bold,color:navy,maxWidth:boxW});page.drawLine({start:{x,y},end:{x:x+boxW,y},thickness:.7,color:gold});page.drawText('Electronically signed',{x,y:Math.max(2,y-8),size:5.5,font:regular,color:rgb(.35,.38,.42),maxWidth:boxW});continue}
    if(field.field_type==='initial'){page.drawText(value||safeText(field.recipient_name).split(/\s+/).map((v:string)=>v[0]||'').join('').slice(0,5),{x,y:y+Math.max(1,boxH*.25),size:Math.max(8,Math.min(15,boxH*.6)),font:bold,color:navy,maxWidth:boxW});continue}
    page.drawText(value,{x,y:y+Math.max(1,boxH*.25),size:Math.max(7,Math.min(11,boxH*.45)),font:regular,color:navy,maxWidth:boxW,lineHeight:11})
  }
  const pageCount=pdf.getPageCount()
  const flattenedPdfBytes=await pdf.save({useObjectStreams:true}),flattenedPdfHash=await sha256Hex(flattenedPdfBytes)
  const recipients=await env.DB.prepare(`SELECT id,name,email,role,routing_order,status,first_viewed_at,completed_at,declined_at,access_revoked_at,replacement_of_recipient_id FROM envelope_recipients WHERE envelope_id=? ORDER BY routing_order,created_at`).bind(envelopeId).all() as any
  const events=await env.DB.prepare(`SELECT id,recipient_id,actor_type,actor_id,event_type,occurred_at_utc,ip_address,geo_city,geo_region,geo_country,geo_lat_approx,geo_lon_approx,user_agent,browser_family,os_family,device_class,device_fingerprint_hash,request_id,metadata_json,prev_event_hash,event_hash FROM envelope_events WHERE envelope_id=? ORDER BY occurred_at_utc,id`).bind(envelopeId).all() as any
  const owner=await env.DB.prepare(`SELECT u.full_name,u.email FROM users u WHERE u.id = COALESCE(?, ?)`).bind(envelope.owner_user_id, envelope.created_by_user_id).first<{full_name?:string;email?:string}>()
  const sentEvent=(events.results||[]).find((ev:any)=>ev.event_type==='envelope.sent')
  const chainHead=String((events.results||[]).at(-1)?.event_hash||'GENESIS'),sealedAt=new Date().toISOString()

  // Certificate-scoped seal: covers everything the certificate discloses except
  // its own signature value. The full packet seal (below) covers every artifact.
  const certificateBinding=JSON.stringify({envelope_id:envelope.id,public_id:envelope.public_id,flattened_pdf_sha256:flattenedPdfHash,event_chain_head_hash:chainHead,sealed_at:sealedAt,certificate_purpose:'certificate_of_completion'})
  const certificateSeal=await signBinding(env,certificateBinding)
  const certificate=await renderOfficialAuditCertificate(
    env,
    envelope,
    recipients.results||[],
    fields.results||[],
    events.results||[],
    flattenedPdfHash,
    chainHead,
    sealedAt,
    {
      ownerName: owner?.full_name || 'Pinnacle Management Ventures',
      ownerEmail: owner?.email || '',
      verifyUrl: `${PUBLIC_SITE_URL}/verify?envelope=${encodeURIComponent(envelope.public_id)}`,
      pageCount,
      initializedAt: envelope.sent_at || sentEvent?.occurred_at_utc || envelope.created_at || null,
      initializedSnapshot: shortSnapshotHash(sentEvent?.event_hash || chainHead),
      finalizedSnapshot: shortSnapshotHash(flattenedPdfHash),
      sourceFileName: envelope.source_name || envelope.title,
      sealAlgorithm: certificateSeal.algorithm,
      sealKeyId: certificateSeal.keyId,
      sealSignature: certificateSeal.signature,
      verificationId: envelope.public_id,
    },
  )
  const auditPdfBytes=certificate.bytes,auditPdfHash=certificate.sha256

  const auditSource=await PDFDocument.load(auditPdfBytes)
  const auditPages=await pdf.copyPages(auditSource, auditSource.getPageIndices())
  for (const auditPage of auditPages) pdf.addPage(auditPage)
  const combinedPageCount=pdf.getPageCount()
  for (const [index,page] of pdf.getPages().entries()){
    const footer=`Document ID: ${envelope.public_id}   |   Page ${index+1} of ${combinedPageCount}`
    page.drawText(footer,{x:42,y:18,size:6.5,font:regular,color:rgb(.35,.38,.42),maxWidth:528})
  }
  pdf.setTitle(`${safeText(envelope.title,180)} - Signed`)
  pdf.setAuthor('Pinnacle Management Ventures')
  pdf.setProducer('Pinnacle Management Ventures Document Hub')
  pdf.setSubject(`Completed electronic signature envelope ${envelope.public_id}`)
  pdf.setKeywords(['Pinnacle Management Ventures','electronic signature',envelope.public_id])
  pdf.setModificationDate(new Date())
  const signedPdfBytes=await pdf.save({useObjectStreams:true}),signedPdfHash=await sha256Hex(signedPdfBytes),manifestObject={version:4,issuer:'Pinnacle Management Ventures',certificate_type:'Certificate of Completion + Audit Trail',envelope_id:envelope.id,public_id:envelope.public_id,title:envelope.title,execution_type:envelope.execution_type||'E_SIGN',completed_at_utc:envelope.completed_at||sealedAt,sealed_at_utc:sealedAt,packet:{document_count:packet.packetManifest.length,documents:packet.packetManifest},artifacts:{signed_pdf_sha256:signedPdfHash,audit_certificate_sha256:auditPdfHash},event_chain:{algorithm:'SHA-256',head_hash:chainHead,event_count:(events.results||[]).length},certificate_seal:{algorithm:certificateSeal.algorithm,key_id:certificateSeal.keyId,signature:certificateSeal.signature},recipients:(recipients.results||[]).map((r:any)=>({id:r.id,role:r.role,name:r.name,email:r.email,status:r.status,completed_at:r.completed_at,access_revoked_at:r.access_revoked_at,replacement_of_recipient_id:r.replacement_of_recipient_id})),consent:(await consentForEnvelope(env,envelopeId)).map((x:any)=>({recipient_id:x.recipient_id,policy_name:x.policy_name,category:x.category,version:x.version,body_sha256:x.body_sha256,accepted_at:x.accepted_at})),events:(events.results||[]).map((ev:any)=>({id:ev.id,recipient_id:ev.recipient_id,event_type:ev.event_type,occurred_at_utc:ev.occurred_at_utc,request_id:ev.request_id,prev_event_hash:ev.prev_event_hash,event_hash:ev.event_hash}))}
  const manifestBytes=enc.encode(JSON.stringify(manifestObject,null,2)),manifestHash=await sha256Hex(manifestBytes)
  const binding=JSON.stringify({envelope_id:envelope.id,public_id:envelope.public_id,signed_pdf_sha256:signedPdfHash,audit_pdf_sha256:auditPdfHash,manifest_sha256:manifestHash,event_chain_head_hash:chainHead,packet_document_count:packet.packetManifest.length,sealed_at:sealedAt})
  const seal=await signBinding(env,binding)
  const signedFileId=uuid(),auditFileId=uuid(),manifestFileId=uuid(),signedKey=`documents/final/${envelope.id}/${envelope.public_id}-signed.pdf`,auditKey=`documents/audit/${envelope.id}/${envelope.public_id}-certificate-of-completion.pdf`,manifestKey=`documents/evidence/${envelope.id}/${envelope.public_id}-evidence.json`
  await Promise.all([env.UPLOADS.put(signedKey,signedPdfBytes,{httpMetadata:{contentType:'application/pdf'},customMetadata:{envelopeId,kind:'signed_pdf',sha256:signedPdfHash}}),env.UPLOADS.put(auditKey,auditPdfBytes,{httpMetadata:{contentType:'application/pdf'},customMetadata:{envelopeId,kind:'audit_certificate',sha256:auditPdfHash}}),env.UPLOADS.put(manifestKey,manifestBytes,{httpMetadata:{contentType:'application/json'},customMetadata:{envelopeId,kind:'evidence_manifest',sha256:manifestHash}})])
  const insertFile=(id:string,kind:string,name:string,mime:string,key:string,size:number,hash:string,executed?:boolean)=>env.DB.prepare(`INSERT INTO document_files (id,kind,original_name,mime_type,storage_key,size_bytes,sha256,created_by_user_id,version_number,is_authoritative,is_executed,is_derivative) VALUES (?,?,?,?,?,?,?,NULL,1,1,?,0)`).bind(id,kind,name,mime,key,size,hash,executed?1:0)
  await env.DB.batch([insertFile(signedFileId,'signed_pdf',`${envelope.public_id}-signed.pdf`,'application/pdf',signedKey,signedPdfBytes.length,signedPdfHash,true),insertFile(auditFileId,'audit_certificate',`${envelope.public_id}-certificate-of-completion.pdf`,'application/pdf',auditKey,auditPdfBytes.length,auditPdfHash),insertFile(manifestFileId,'evidence_manifest',`${envelope.public_id}-evidence.json`,'application/json',manifestKey,manifestBytes.length,manifestHash),env.DB.prepare(`UPDATE envelopes SET final_signed_file_id=?,audit_certificate_file_id=?,evidence_manifest_file_id=?,updated_at=? WHERE id=?`).bind(signedFileId,auditFileId,manifestFileId,sealedAt,envelopeId),env.DB.prepare(`INSERT OR REPLACE INTO envelope_seals (id,envelope_id,seal_version,final_pdf_sha256,audit_pdf_sha256,manifest_sha256,event_chain_head_hash,signature_algorithm,public_key_id,digital_signature,sealed_at) VALUES (?,?,3,?,?,?,?,?,?,?,?)`).bind(uuid(),envelopeId,signedPdfHash,auditPdfHash,manifestHash,chainHead,seal.algorithm,seal.keyId,seal.signature,sealedAt)])
  return{signedFileId,auditFileId,manifestFileId,signedPdfHash,auditPdfHash,manifestHash,chainHead,sealedAt,algorithm:seal.algorithm,keyId:seal.keyId,signature:seal.signature}
}
