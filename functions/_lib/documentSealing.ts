import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { Env } from './types'
import { uuid } from './crypto'

const enc = new TextEncoder()

function b64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
function unb64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
export async function sha256Hex(input: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = typeof input === 'string' ? enc.encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function safeText(value: unknown, max = 4000) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max)
}
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (!line) line = word
    else if (`${line} ${word}`.length <= maxChars) line += ` ${word}`
    else { lines.push(line); line = word }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

async function signBinding(env: Env, binding: string): Promise<{ algorithm: string; keyId: string; signature: string }> {
  if (env.DOCUMENT_SIGNING_PRIVATE_KEY) {
    const key = await crypto.subtle.importKey(
      'pkcs8',
      unb64(env.DOCUMENT_SIGNING_PRIVATE_KEY) as unknown as BufferSource,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(binding) as unknown as BufferSource)
    return { algorithm: 'ECDSA-P256-SHA256', keyId: env.DOCUMENT_SIGNING_KEY_ID || 'pmv-document-key', signature: b64(new Uint8Array(sig)) }
  }
  // Strong tamper-evident server seal for environments where the dedicated
  // asymmetric key has not yet been provisioned. The key never leaves the
  // Cloudflare secret store, but this form is not independently verifiable.
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET) as unknown as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(binding) as unknown as BufferSource)
  return { algorithm: 'HMAC-SHA256', keyId: 'pmv-server-seal', signature: b64(new Uint8Array(sig)) }
}

export interface SealEnvelopeResult {
  signedFileId: string
  auditFileId: string
  manifestFileId: string
  signedPdfHash: string
  auditPdfHash: string
  manifestHash: string
  chainHead: string
  sealedAt: string
  algorithm: string
  keyId: string
  signature: string
}

export async function sealEnvelope(env: Env, envelopeId: string): Promise<SealEnvelopeResult> {
  if (!env.UPLOADS) throw new Error('Document storage is not configured.')
  const envelope = await env.DB.prepare(`SELECT e.*, f.storage_key source_storage_key, f.mime_type source_mime_type, f.original_name source_name FROM envelopes e JOIN document_files f ON f.id=e.source_file_id WHERE e.id=?`).bind(envelopeId).first<any>()
  if (!envelope) throw new Error('Envelope not found.')
  if (envelope.source_mime_type !== 'application/pdf' && !String(envelope.source_name || '').toLowerCase().endsWith('.pdf')) throw new Error('Final rendering currently requires a PDF source document.')
  const object = await env.UPLOADS.get(envelope.source_storage_key)
  if (!object) throw new Error('Source document is missing from private storage.')
  const sourceBytes = new Uint8Array(await object.arrayBuffer())
  const pdf = await PDFDocument.load(sourceBytes, { ignoreEncryption: false })
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const fields = await env.DB.prepare(`SELECT f.*, r.name recipient_name, r.email recipient_email FROM document_fields f JOIN envelope_recipients r ON r.id=f.recipient_id WHERE f.envelope_id=? ORDER BY f.page_number,f.created_at`).bind(envelopeId).all<any>()
  for (const field of fields.results || []) {
    if (!field.completed_at) continue
    const page = pdf.getPages()[Math.max(0, Number(field.page_number || 1) - 1)]
    if (!page) continue
    const { width: pw, height: ph } = page.getSize()
    const x = Number(field.x) * pw
    const boxW = Math.max(8, Number(field.width) * pw)
    const boxH = Math.max(8, Number(field.height) * ph)
    const y = ph - Number(field.y) * ph - boxH
    const gold = rgb(0.79, 0.64, 0.15)
    const navy = rgb(0.04, 0.09, 0.16)
    if (field.field_type === 'checkbox') {
      page.drawRectangle({ x, y, width: Math.min(boxH, boxW), height: Math.min(boxH, boxW), borderWidth: 1, borderColor: navy })
      if (String(field.value_text) === 'true') page.drawText('X', { x: x + 2, y: y + 1, size: Math.max(7, Math.min(boxH, boxW) - 3), font: bold, color: navy })
      continue
    }
    let value = safeText(field.value_text, 1000)
    if (field.field_type === 'date' && !value) value = new Date(field.completed_at).toISOString().slice(0, 10)
    if (field.field_type === 'signature') {
      const name = value || safeText(field.recipient_name, 160)
      const size = Math.max(10, Math.min(18, boxH * 0.55))
      page.drawText(name, { x, y: y + Math.max(1, (boxH - size) / 2), size, font: bold, color: navy, maxWidth: boxW })
      page.drawLine({ start: { x, y }, end: { x: x + boxW, y }, thickness: 0.7, color: gold })
      page.drawText('Electronically signed', { x, y: Math.max(2, y - 8), size: 5.5, font: regular, color: rgb(0.35, 0.38, 0.42), maxWidth: boxW })
      continue
    }
    if (field.field_type === 'initial') {
      page.drawText(value || safeText(field.recipient_name).split(/\s+/).map((v:string)=>v[0]||'').join('').slice(0,5), { x, y: y + Math.max(1, boxH * 0.25), size: Math.max(8, Math.min(15, boxH * 0.6)), font: bold, color: navy, maxWidth: boxW })
      continue
    }
    page.drawText(value, { x, y: y + Math.max(1, boxH * 0.25), size: Math.max(7, Math.min(11, boxH * 0.45)), font: regular, color: navy, maxWidth: boxW, lineHeight: 11 })
  }
  pdf.setTitle(`${safeText(envelope.title, 180)} — Signed`)
  pdf.setAuthor('Pinnacle Management Ventures')
  pdf.setProducer('Pinnacle Management Ventures Document Hub')
  pdf.setSubject(`Completed electronic signature envelope ${envelope.public_id}`)
  pdf.setKeywords(['Pinnacle Management Ventures', 'electronic signature', envelope.public_id])
  pdf.setModificationDate(new Date())
  const signedPdfBytes = await pdf.save({ useObjectStreams: true })
  const signedPdfHash = await sha256Hex(signedPdfBytes)

  const recipients = await env.DB.prepare(`SELECT id,name,email,role,routing_order,status,first_viewed_at,completed_at,declined_at FROM envelope_recipients WHERE envelope_id=? ORDER BY routing_order,created_at`).bind(envelopeId).all<any>()
  const events = await env.DB.prepare(`SELECT id,recipient_id,actor_type,actor_id,event_type,occurred_at_utc,ip_address,geo_city,geo_region,geo_country,geo_lat_approx,geo_lon_approx,user_agent,browser_family,os_family,device_class,device_fingerprint_hash,request_id,metadata_json,prev_event_hash,event_hash FROM envelope_events WHERE envelope_id=? ORDER BY occurred_at_utc,id`).bind(envelopeId).all<any>()
  const chainHead = String((events.results || []).at(-1)?.event_hash || 'GENESIS')
  const sealedAt = new Date().toISOString()

  const audit = await PDFDocument.create()
  const aRegular = await audit.embedFont(StandardFonts.Helvetica)
  const aBold = await audit.embedFont(StandardFonts.HelveticaBold)
  const gold = rgb(0.79, 0.64, 0.15)
  const navy = rgb(0.035, 0.075, 0.13)
  const muted = rgb(0.36, 0.4, 0.46)
  let page = audit.addPage([612, 792])
  let y = 742
  const newPage = () => { page = audit.addPage([612, 792]); y = 742; page.drawText('PINNACLE MANAGEMENT VENTURES', { x: 42, y: 756, size: 9, font: aBold, color: gold }) }
  const ensure = (needed=36) => { if (y < 55 + needed) newPage() }
  const heading = (text:string) => { ensure(34); page.drawText(text, { x:42, y, size:13, font:aBold, color:navy }); y -= 22 }
  const line = (label:string, value:unknown) => { ensure(24); page.drawText(label, { x:42, y, size:8, font:aBold, color:muted }); page.drawText(safeText(value, 800), { x:165, y, size:8, font:aRegular, color:navy, maxWidth:400 }); y -= 15 }
  page.drawText('PINNACLE', { x:42, y, size:24, font:aBold, color:navy }); page.drawText('MANAGEMENT VENTURES', { x:42, y:y-17, size:9, font:aBold, color:gold });
  page.drawText('DOCUMENT AUDIT CERTIFICATE', { x:320, y, size:13, font:aBold, color:navy });
  y -= 48; page.drawLine({ start:{x:42,y}, end:{x:570,y}, thickness:1.4, color:gold }); y -= 28
  heading('Envelope record')
  line('Envelope / transaction ID', envelope.public_id)
  line('Internal envelope ID', envelope.id)
  line('Document', envelope.title)
  line('Status', 'Completed')
  line('Completed (UTC)', envelope.completed_at || sealedAt)
  line('Certificate generated (UTC)', sealedAt)
  line('Final signed PDF SHA-256', signedPdfHash)
  line('Event chain head', chainHead)
  y -= 8; heading('Recipients and authentication')
  for (const r of recipients.results || []) {
    ensure(72); page.drawText(`${safeText(r.name,160)} — ${safeText(r.role,40)}`, { x:42,y,size:9,font:aBold,color:navy }); y-=14
    line('Email', r.email)
    line('Status / completed', `${r.status}${r.completed_at ? ` · ${r.completed_at}` : ''}`)
  }
  y -= 8; heading('Chronological evidence log')
  for (const ev of events.results || []) {
    ensure(82)
    page.drawText(`${safeText(ev.occurred_at_utc,40)}  ${safeText(ev.event_type,90)}`, { x:42,y,size:8.3,font:aBold,color:navy,maxWidth:520 }); y-=13
    const location = [ev.geo_city,ev.geo_region,ev.geo_country].filter(Boolean).join(', ') + (ev.geo_lat_approx != null && ev.geo_lon_approx != null ? ` (${Number(ev.geo_lat_approx).toFixed(2)}, ${Number(ev.geo_lon_approx).toFixed(2)})` : '')
    page.drawText(`IP: ${safeText(ev.ip_address || 'Unavailable',80)}   Location: ${safeText(location || 'Unavailable',180)}`, { x:52,y,size:7,font:aRegular,color:muted,maxWidth:500 }); y-=11
    for (const uaLine of wrap(`Device/User-Agent: ${safeText(ev.user_agent || 'Unavailable',500)}`, 115).slice(0,2)) { page.drawText(uaLine,{x:52,y,size:6.6,font:aRegular,color:muted,maxWidth:500}); y-=10 }
    page.drawText(`Event hash: ${safeText(ev.event_hash,80)}`, { x:52,y,size:6.2,font:aRegular,color:muted,maxWidth:500 }); y-=13
  }
  ensure(95); y-=4; heading('Integrity statement')
  for (const t of wrap('This certificate is generated from Pinnacle Management Ventures\' append-only envelope event ledger. Each event is linked to the preceding event by SHA-256 hash. The final document, this certificate, the evidence manifest, and the chain-head hash are bound together by a cryptographic server seal.', 105)) { page.drawText(t,{x:42,y,size:8,font:aRegular,color:navy,maxWidth:520}); y-=12 }
  y-=8
  for (const t of wrap('This certificate records electronic-signature evidence and does not by itself represent a notarization, legal opinion, guarantee of admissibility, or Florida Remote Online Notarization compliance.',105)) { page.drawText(t,{x:42,y,size:7.4,font:aRegular,color:muted,maxWidth:520}); y-=11 }
  audit.setTitle(`Audit Certificate — ${envelope.public_id}`)
  audit.setAuthor('Pinnacle Management Ventures')
  audit.setProducer('Pinnacle Management Ventures Document Hub')
  const auditPdfBytes = await audit.save({ useObjectStreams: true })
  const auditPdfHash = await sha256Hex(auditPdfBytes)

  const manifestObject = {
    version: 1,
    issuer: 'Pinnacle Management Ventures',
    envelope_id: envelope.id,
    public_id: envelope.public_id,
    title: envelope.title,
    completed_at_utc: envelope.completed_at || sealedAt,
    sealed_at_utc: sealedAt,
    artifacts: { signed_pdf_sha256: signedPdfHash, audit_certificate_sha256: auditPdfHash },
    event_chain: { algorithm: 'SHA-256', head_hash: chainHead, event_count: (events.results || []).length },
    recipients: (recipients.results || []).map((r:any)=>({ id:r.id, role:r.role, name:r.name, email:r.email, status:r.status, completed_at:r.completed_at })),
    events: (events.results || []).map((ev:any)=>({ id:ev.id, recipient_id:ev.recipient_id, event_type:ev.event_type, occurred_at_utc:ev.occurred_at_utc, request_id:ev.request_id, prev_event_hash:ev.prev_event_hash, event_hash:ev.event_hash })),
  }
  const manifestBytes = enc.encode(JSON.stringify(manifestObject, null, 2))
  const manifestHash = await sha256Hex(manifestBytes)
  const binding = JSON.stringify({ envelope_id: envelope.id, public_id: envelope.public_id, signed_pdf_sha256: signedPdfHash, audit_pdf_sha256: auditPdfHash, manifest_sha256: manifestHash, event_chain_head_hash: chainHead, sealed_at: sealedAt })
  const seal = await signBinding(env, binding)

  const signedFileId = uuid(), auditFileId = uuid(), manifestFileId = uuid()
  const signedKey = `documents/final/${envelope.id}/${envelope.public_id}-signed.pdf`
  const auditKey = `documents/audit/${envelope.id}/${envelope.public_id}-audit-certificate.pdf`
  const manifestKey = `documents/evidence/${envelope.id}/${envelope.public_id}-evidence.json`
  await Promise.all([
    env.UPLOADS.put(signedKey, signedPdfBytes, { httpMetadata:{contentType:'application/pdf'}, customMetadata:{ envelopeId, kind:'signed_pdf', sha256:signedPdfHash } }),
    env.UPLOADS.put(auditKey, auditPdfBytes, { httpMetadata:{contentType:'application/pdf'}, customMetadata:{ envelopeId, kind:'audit_certificate', sha256:auditPdfHash } }),
    env.UPLOADS.put(manifestKey, manifestBytes, { httpMetadata:{contentType:'application/json'}, customMetadata:{ envelopeId, kind:'evidence_manifest', sha256:manifestHash } }),
  ])
  const insertFile = (id:string,kind:string,name:string,mime:string,key:string,size:number,hash:string) => env.DB.prepare(`INSERT INTO document_files (id,kind,original_name,mime_type,storage_key,size_bytes,sha256,created_by_user_id) VALUES (?,?,?,?,?,?,?,NULL)`).bind(id,kind,name,mime,key,size,hash)
  await env.DB.batch([
    insertFile(signedFileId,'signed_pdf',`${envelope.public_id}-signed.pdf`,'application/pdf',signedKey,signedPdfBytes.length,signedPdfHash),
    insertFile(auditFileId,'audit_certificate',`${envelope.public_id}-audit-certificate.pdf`,'application/pdf',auditKey,auditPdfBytes.length,auditPdfHash),
    insertFile(manifestFileId,'evidence_manifest',`${envelope.public_id}-evidence.json`,'application/json',manifestKey,manifestBytes.length,manifestHash),
    env.DB.prepare(`UPDATE envelopes SET final_signed_file_id=?,audit_certificate_file_id=?,evidence_manifest_file_id=?,updated_at=? WHERE id=?`).bind(signedFileId,auditFileId,manifestFileId,sealedAt,envelopeId),
    env.DB.prepare(`INSERT OR REPLACE INTO envelope_seals (id,envelope_id,seal_version,final_pdf_sha256,audit_pdf_sha256,manifest_sha256,event_chain_head_hash,signature_algorithm,public_key_id,digital_signature,sealed_at) VALUES (?,?,1,?,?,?,?,?,?,?,?)`).bind(uuid(),envelopeId,signedPdfHash,auditPdfHash,manifestHash,chainHead,seal.algorithm,seal.keyId,seal.signature,sealedAt),
  ])
  return { signedFileId,auditFileId,manifestFileId,signedPdfHash,auditPdfHash,manifestHash,chainHead,sealedAt,algorithm:seal.algorithm,keyId:seal.keyId,signature:seal.signature }
}
