import { Hono } from 'hono'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { AppEnv } from '../types'
import { uuid } from '../crypto'
import { requireUser } from '../mid'
import { sendEmail, escapeHtml } from '../email'
import { buildDocx, sanitizeFilename } from '../officeExport'
import { buildPdf } from '../documentExport'
import { protectPdf } from '../pdfSecurity'
import { htmlToPlainText } from '../../../shared/emailSignatureHtml'
import { CREST_ABSOLUTE_URL } from '../../../shared/letterhead'
import { isDocMargin, isDocPageSize } from '../../../shared/docLayout'

const EXPORT_MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

async function crestBytes(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(CREST_ABSOLUTE_URL)
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
}

export const internalDocumentAdminRoutes = new Hono<AppEnv>()
export const internalDocumentPublicRoutes = new Hono<AppEnv>()

const enc = new TextEncoder()
const now = () => new Date().toISOString()

async function sha256Hex(input: string | ArrayBuffer | Uint8Array) {
  const bytes = typeof input === 'string' ? enc.encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function token() {
  const a = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function requireStaff(c: any, next: any) {
  return requireUser(c, async () => {
    const user = c.get('user')
    if (user.role !== 'admin' && user.role !== 'staff') return c.json({ error: 'forbidden' }, 403)
    return next()
  })
}

internalDocumentAdminRoutes.use('/documents-workspace/*', requireStaff)

internalDocumentAdminRoutes.get('/documents-workspace', async (c) => {
  const status = c.req.query('status') === 'archived' ? 'archived' : 'active'
  const rows = await c.env.DB.prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM internal_document_versions v WHERE v.document_id=d.id) version_count,
      (SELECT COUNT(*) FROM internal_document_shares s WHERE s.document_id=d.id AND s.revoked_at IS NULL) share_count
    FROM internal_documents d
    WHERE d.status=?
    ORDER BY d.updated_at DESC
    LIMIT 500
  `).bind(status).all()
  return c.json({ documents: rows.results })
})

internalDocumentAdminRoutes.post('/documents-workspace/text', async (c) => {
  const b = await c.req.json<any>().catch(() => null)
  const title = String(b?.title || '').trim().slice(0, 200)
  if (!title) return c.json({ error: 'title is required' }, 400)
  const id = uuid(); const versionId = uuid(); const user = c.get('user'); const content = String(b?.text_content || ''); const isBranded = b?.is_branded === 0 ? 0 : 1
  const pageSize = isDocPageSize(b?.page_size) ? b.page_size : 'letter'
  const pageMargins = isDocMargin(b?.page_margins) ? b.page_margins : 'normal'
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO internal_documents (id,title,description,folder,document_type,status,text_content,mime_type,is_branded,page_size,page_margins,tags_json,created_by_user_id,updated_by_user_id,created_at,updated_at) VALUES (?,?,?,?, 'text','active',?,'text/plain',?,?,?,?,?,?,?,?)`).bind(id,title,b?.description||null,String(b?.folder||'General').slice(0,100),content,isBranded,pageSize,pageMargins,JSON.stringify(Array.isArray(b?.tags)?b.tags:[]),user.id,user.id,now(),now()),
    c.env.DB.prepare(`INSERT INTO internal_document_versions (id,document_id,version_number,text_content,change_note,created_by_user_id,created_at) VALUES (?,?,1,?,?,?,?)`).bind(versionId,id,content,'Initial version',user.id,now()),
  ])
  return c.json({ id }, 201)
})

internalDocumentAdminRoutes.post('/documents-workspace/upload', async (c) => {
  if (!c.env.UPLOADS) return c.json({ error: 'Document storage is not configured.' }, 503)
  const bytes = await c.req.arrayBuffer()
  if (!bytes.byteLength) return c.json({ error: 'file is required' }, 400)
  const rawName = decodeURIComponent(c.req.header('X-File-Name') || 'document')
  const fileName = rawName.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180)
  const mime = c.req.header('Content-Type') || 'application/octet-stream'
  const title = decodeURIComponent(c.req.header('X-Document-Title') || fileName.replace(/\.[^.]+$/, ''))
  const folder = decodeURIComponent(c.req.header('X-Document-Folder') || 'General').slice(0, 100)
  const fileId = uuid(); const docId = uuid(); const versionId = uuid(); const hash = await sha256Hex(bytes); const user = c.get('user')
  const key = `document-hub/${docId}/v1/${fileName}`
  await c.env.UPLOADS.put(key, bytes, { httpMetadata: { contentType: mime } })
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO document_files (id,kind,original_name,mime_type,storage_key,size_bytes,sha256,created_by_user_id) VALUES (?,'source',?,?,?,?,?,?)`).bind(fileId,fileName,mime,key,bytes.byteLength,hash,user.id),
    c.env.DB.prepare(`INSERT INTO internal_documents (id,title,folder,document_type,status,current_file_id,mime_type,original_name,tags_json,created_by_user_id,updated_by_user_id,created_at,updated_at) VALUES (?,?,?,'file','active',?,?,?,?,?,?,?,?)`).bind(docId,title.slice(0,200),folder,fileId,mime,fileName,'[]',user.id,user.id,now(),now()),
    c.env.DB.prepare(`INSERT INTO internal_document_versions (id,document_id,version_number,file_id,change_note,created_by_user_id,created_at) VALUES (?,?,1,?,'Initial upload',?,?)`).bind(versionId,docId,fileId,user.id,now()),
  ])
  return c.json({ id: docId }, 201)
})

internalDocumentAdminRoutes.get('/documents-workspace/:id', async (c) => {
  const id = c.req.param('id')
  const document = await c.env.DB.prepare('SELECT * FROM internal_documents WHERE id=?').bind(id).first<any>()
  if (!document) return c.json({ error: 'not found' }, 404)
  const [versions, shares] = await Promise.all([
    c.env.DB.prepare(`SELECT v.*,f.original_name,f.mime_type,f.size_bytes,f.sha256 FROM internal_document_versions v LEFT JOIN document_files f ON f.id=v.file_id WHERE v.document_id=? ORDER BY v.version_number DESC`).bind(id).all(),
    c.env.DB.prepare(`SELECT id,recipient_email,recipient_name,message,expires_at,opened_at,download_count,revoked_at,created_at FROM internal_document_shares WHERE document_id=? ORDER BY created_at DESC`).bind(id).all(),
  ])
  return c.json({ document, versions: versions.results, shares: shares.results })
})

internalDocumentAdminRoutes.patch('/documents-workspace/:id', async (c) => {
  const id = c.req.param('id'); const b = await c.req.json<any>().catch(() => null); if (!b) return c.json({ error: 'invalid body' }, 400)
  const doc = await c.env.DB.prepare('SELECT * FROM internal_documents WHERE id=?').bind(id).first<any>(); if (!doc) return c.json({ error: 'not found' }, 404)
  const user = c.get('user'); const title = b.title !== undefined ? String(b.title).trim().slice(0,200) : doc.title; const description = b.description !== undefined ? String(b.description||'').slice(0,2000) : doc.description; const folder = b.folder !== undefined ? String(b.folder||'General').slice(0,100) : doc.folder; const tags = b.tags !== undefined ? JSON.stringify(Array.isArray(b.tags)?b.tags:[]) : doc.tags_json
  let text = doc.text_content
  let makeVersion = false
  if (doc.document_type === 'text' && b.text_content !== undefined && String(b.text_content) !== String(doc.text_content || '')) { text = String(b.text_content); makeVersion = true }
  const pageSize = b.page_size !== undefined ? (isDocPageSize(b.page_size) ? b.page_size : doc.page_size || 'letter') : (doc.page_size || 'letter')
  const pageMargins = b.page_margins !== undefined ? (isDocMargin(b.page_margins) ? b.page_margins : doc.page_margins || 'normal') : (doc.page_margins || 'normal')
  await c.env.DB.prepare(`UPDATE internal_documents SET title=?,description=?,folder=?,tags_json=?,text_content=?,page_size=?,page_margins=?,updated_by_user_id=?,updated_at=? WHERE id=?`).bind(title,description||null,folder,tags,text,pageSize,pageMargins,user.id,now(),id).run()
  if (makeVersion) {
    const latest = await c.env.DB.prepare('SELECT COALESCE(MAX(version_number),0) n FROM internal_document_versions WHERE document_id=?').bind(id).first<any>()
    await c.env.DB.prepare(`INSERT INTO internal_document_versions (id,document_id,version_number,text_content,change_note,created_by_user_id,created_at) VALUES (?,?,?,?,?,?,?)`).bind(uuid(),id,Number(latest?.n||0)+1,text,String(b.change_note||'Edited in Document Hub').slice(0,300),user.id,now()).run()
  }
  return c.json({ ok: true })
})

internalDocumentAdminRoutes.post('/documents-workspace/:id/version', async (c) => {
  if (!c.env.UPLOADS) return c.json({ error: 'Document storage is not configured.' }, 503)
  const id = c.req.param('id'); const doc = await c.env.DB.prepare('SELECT * FROM internal_documents WHERE id=?').bind(id).first<any>(); if (!doc) return c.json({ error: 'not found' }, 404)
  const bytes = await c.req.arrayBuffer(); if (!bytes.byteLength) return c.json({ error: 'file is required' }, 400)
  const fileName = decodeURIComponent(c.req.header('X-File-Name') || doc.original_name || 'document').replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,180)
  const mime = c.req.header('Content-Type') || doc.mime_type || 'application/octet-stream'; const latest = await c.env.DB.prepare('SELECT COALESCE(MAX(version_number),0) n FROM internal_document_versions WHERE document_id=?').bind(id).first<any>(); const version = Number(latest?.n||0)+1
  const fileId=uuid(); const versionId=uuid(); const hash=await sha256Hex(bytes); const key=`document-hub/${id}/v${version}/${fileName}`; const user=c.get('user')
  await c.env.UPLOADS.put(key,bytes,{httpMetadata:{contentType:mime}})
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO document_files (id,kind,original_name,mime_type,storage_key,size_bytes,sha256,created_by_user_id) VALUES (?,'source',?,?,?,?,?,?)`).bind(fileId,fileName,mime,key,bytes.byteLength,hash,user.id),
    c.env.DB.prepare(`INSERT INTO internal_document_versions (id,document_id,version_number,file_id,change_note,created_by_user_id,created_at) VALUES (?,?,?,?,?,?,?)`).bind(versionId,id,version,fileId,decodeURIComponent(c.req.header('X-Change-Note')||'New file version').slice(0,300),user.id,now()),
    c.env.DB.prepare(`UPDATE internal_documents SET current_file_id=?,mime_type=?,original_name=?,updated_by_user_id=?,updated_at=? WHERE id=?`).bind(fileId,mime,fileName,user.id,now(),id),
  ])
  return c.json({ ok:true, version_number:version })
})

internalDocumentAdminRoutes.get('/documents-workspace/:id/file', async (c) => {
  if (!c.env.UPLOADS) return c.json({ error: 'Document storage is not configured.' }, 503)
  const row = await c.env.DB.prepare(`SELECT d.title,d.document_type,d.text_content,f.storage_key,f.mime_type,f.original_name FROM internal_documents d LEFT JOIN document_files f ON f.id=d.current_file_id WHERE d.id=?`).bind(c.req.param('id')).first<any>()
  if (!row) return c.json({ error:'not found' },404)
  if (row.document_type === 'text') return new Response(row.text_content || '', { headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`inline; filename="${String(row.title).replace(/"/g,'')}.txt"`} })
  const obj=await c.env.UPLOADS.get(row.storage_key); if(!obj) return c.json({error:'file missing'},404)
  return new Response(obj.body,{headers:{'Content-Type':row.mime_type||'application/octet-stream','Content-Disposition':`inline; filename="${String(row.original_name||row.title).replace(/"/g,'')}"`}})
})

internalDocumentAdminRoutes.post('/documents-workspace/:id/export', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json<any>().catch(() => null)
  const format = ['docx', 'pdf', 'protected_pdf', 'txt'].includes(String(b?.format)) ? String(b.format) : 'pdf'
  const doc = await c.env.DB.prepare('SELECT * FROM internal_documents WHERE id=?').bind(id).first<any>()
  if (!doc) return c.json({ error: 'not found' }, 404)
  const base = sanitizeFilename(doc.title || 'document')
  const disposition = (name: string) => `attachment; filename="${name}"`
  const passwordOk = (): string | null => {
    const pw = String(b?.password || '')
    return pw.length >= 8 ? pw.slice(0, 128) : null
  }
  try {
    if (doc.document_type === 'text') {
      const logo = doc.is_branded === 0 ? null : await crestBytes()
      if (format === 'txt') {
        return new Response(htmlToPlainText(doc.text_content || ''), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': disposition(`${base}.txt`) } })
      }
      if (format === 'docx') {
        const bytes = await buildDocx({ title: doc.title, html: doc.text_content || '', branded: doc.is_branded !== 0, logoBytes: logo })
        return new Response(bytes as unknown as ArrayBuffer, { headers: { 'Content-Type': EXPORT_MIME_DOCX, 'Content-Disposition': disposition(`${base}.docx`) } })
      }
      const bytes = await buildPdf({ title: doc.title, html: doc.text_content || '', branded: doc.is_branded !== 0, logoBytes: logo, pageSize: doc.page_size, margins: doc.page_margins })
      if (format === 'protected_pdf') {
        const pw = passwordOk()
        if (!pw) return c.json({ error: 'Password must be at least 8 characters.' }, 400)
        const protectedBytes = await protectPdf(bytes, pw)
        return new Response(protectedBytes as unknown as ArrayBuffer, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': disposition(`${base} (Protected).pdf`) } })
      }
      return new Response(bytes as unknown as ArrayBuffer, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': disposition(`${base}.pdf`) } })
    }
    // File documents: the export IS the faithful original — signed/executed
    // files are never regenerated from editable content.
    if (format === 'txt') return c.json({ error: 'Plain text export is only available for editable documents. Download the original file instead.' }, 400)
    const f = doc.current_file_id ? await c.env.DB.prepare('SELECT * FROM document_files WHERE id=?').bind(doc.current_file_id).first<any>() : null
    const mime = String(doc.mime_type || f?.mime_type || '').toLowerCase()
    const name = String(doc.original_name || f?.original_name || '').toLowerCase()
    const isPdf = mime === 'application/pdf' || name.endsWith('.pdf')
    const isDocx = mime.includes('wordprocessingml') || name.endsWith('.docx')
    if (format === 'docx' && !isDocx) return c.json({ error: 'Word export is only available for editable documents. Download the original file to work with this format.' }, 400)
    if ((format === 'pdf' || format === 'protected_pdf') && !isPdf) return c.json({ error: 'PDF export is only available for editable documents or PDF files. Download the original file for other formats.' }, 400)
    if (!f || !c.env.UPLOADS) return c.json({ error: 'file missing' }, 404)
    const obj = await c.env.UPLOADS.get(f.storage_key)
    if (!obj) return c.json({ error: 'file missing' }, 404)
    const original = new Uint8Array(await obj.arrayBuffer())
    if (format === 'protected_pdf') {
      const pw = passwordOk()
      if (!pw) return c.json({ error: 'Password must be at least 8 characters.' }, 400)
      const protectedBytes = await protectPdf(original, pw)
      return new Response(protectedBytes as unknown as ArrayBuffer, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': disposition(`${base} (Protected).pdf`) } })
    }
    return new Response(original as unknown as ArrayBuffer, { headers: { 'Content-Type': isPdf ? 'application/pdf' : EXPORT_MIME_DOCX, 'Content-Disposition': disposition(isPdf ? `${base}.pdf` : `${base}.docx`) } })
  } catch (e) {
    return c.json({ error: "We couldn't prepare this document. Your original has not been changed." }, 500)
  }
})

internalDocumentAdminRoutes.post('/documents-workspace/:id/share', async (c) => {
  const id=c.req.param('id'); const b=await c.req.json<any>().catch(()=>null); const email=String(b?.email||'').trim().toLowerCase(); if(!email.includes('@')) return c.json({error:'valid email required'},400)
  const doc=await c.env.DB.prepare('SELECT * FROM internal_documents WHERE id=?').bind(id).first<any>(); if(!doc) return c.json({error:'not found'},404)
  const raw=token(); const hash=await sha256Hex(raw); const shareId=uuid(); const expires=new Date(Date.now()+Math.max(1,Math.min(30,Number(b?.expires_days||7)))*86400000).toISOString(); const user=c.get('user')
  const version=await c.env.DB.prepare('SELECT id FROM internal_document_versions WHERE document_id=? ORDER BY version_number DESC LIMIT 1').bind(id).first<any>()
  await c.env.DB.prepare(`INSERT INTO internal_document_shares (id,document_id,version_id,recipient_email,recipient_name,message,token_hash,expires_at,created_by_user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(shareId,id,version?.id||null,email,b?.name||null,String(b?.message||'').slice(0,1000)||null,hash,expires,user.id,now()).run()
  const link=`https://pinnaclemanagementventures.com/shared/${encodeURIComponent(raw)}`
  c.executionCtx.waitUntil(sendEmail(c.env,{to:email,subject:`Document from Pinnacle: ${doc.title}`,html:`<p>${b?.name?`${escapeHtml(String(b.name))},`:''}</p><p>Pinnacle Management Ventures shared <strong>${escapeHtml(doc.title)}</strong> with you.</p>${b?.message?`<p>${escapeHtml(String(b.message))}</p>`:''}<p><a href="${link}">Open secure document</a></p><p>This link expires ${new Date(expires).toLocaleDateString('en-US')}.</p>`}))
  return c.json({ok:true,share_id:shareId,expires_at:expires})
})

internalDocumentAdminRoutes.post('/documents-workspace/:id/archive', async (c) => {
  const id=c.req.param('id'); const archived=c.req.query('restore')==='1'?false:true
  await c.env.DB.prepare(`UPDATE internal_documents SET status=?,archived_at=?,updated_at=? WHERE id=?`).bind(archived?'archived':'active',archived?now():null,now(),id).run()
  return c.json({ok:true})
})

async function textToPdf(text:string,title:string){
  const pdf=await PDFDocument.create(); const font=await pdf.embedFont(StandardFonts.Helvetica); const bold=await pdf.embedFont(StandardFonts.HelveticaBold); let page=pdf.addPage([612,792]); const margin=54; let y=738; page.drawText(title,{x:margin,y,size:18,font:bold,color:rgb(.05,.1,.17)}); y-=34
  const words=text.replace(/\r/g,'').split(/\s+/); let line=''; const lines:string[]=[]; for(const word of words){const next=line?`${line} ${word}`:word;if(font.widthOfTextAtSize(next,11)>504){lines.push(line);line=word}else line=next} if(line)lines.push(line)
  for(const ln of lines){if(y<54){page=pdf.addPage([612,792]);y=738} page.drawText(ln,{x:margin,y,size:11,font,color:rgb(.12,.16,.22)});y-=16}
  return pdf.save()
}

internalDocumentAdminRoutes.post('/documents-workspace/:id/envelope', async (c) => {
  if(!c.env.UPLOADS) return c.json({error:'Document storage is not configured.'},503)
  const id=c.req.param('id'); const doc=await c.env.DB.prepare('SELECT * FROM internal_documents WHERE id=?').bind(id).first<any>(); if(!doc) return c.json({error:'not found'},404)
  let fileId=doc.current_file_id
  if(doc.document_type==='text'){
    const bytes=await textToPdf(doc.text_content||'',doc.title); const hash=await sha256Hex(bytes); fileId=uuid(); const key=`document-hub/${id}/signing/${fileId}.pdf`; await c.env.UPLOADS.put(key,bytes,{httpMetadata:{contentType:'application/pdf'}}); await c.env.DB.prepare(`INSERT INTO document_files (id,kind,original_name,mime_type,storage_key,size_bytes,sha256,created_by_user_id) VALUES (?,'canonical_pdf',?,'application/pdf',?,?,?,?)`).bind(fileId,`${doc.title}.pdf`,key,bytes.length,hash,c.get('user').id).run()
  }
  if(!fileId) return c.json({error:'document has no file to send'},400)
  const envId=uuid(); const publicId=`PMV-${new Date().getUTCFullYear()}-${uuid().split('-')[0].toUpperCase()}`
  await c.env.DB.prepare(`INSERT INTO envelopes (id,public_id,title,message,source_file_id,canonical_file_id,status,signing_order_mode,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,'draft','parallel',?,?,?)`).bind(envId,publicId,doc.title,'Created from Document Hub',fileId,fileId,c.get('user').id,now(),now()).run()
  return c.json({id:envId,public_id:publicId},201)
})

internalDocumentPublicRoutes.get('/shared/:token', async (c) => {
  const hash=await sha256Hex(c.req.param('token')); const share=await c.env.DB.prepare(`SELECT s.*,d.title,d.description,d.document_type,d.text_content,d.mime_type,d.original_name,d.current_file_id FROM internal_document_shares s JOIN internal_documents d ON d.id=s.document_id WHERE s.token_hash=?`).bind(hash).first<any>()
  if(!share||share.revoked_at) return c.json({error:'invalid link'},404); if(share.expires_at<now()) return c.json({error:'link expired'},410)
  if(!share.opened_at) await c.env.DB.prepare('UPDATE internal_document_shares SET opened_at=? WHERE id=?').bind(now(),share.id).run()
  return c.json({document:{title:share.title,description:share.description,document_type:share.document_type,mime_type:share.mime_type,original_name:share.original_name,text_content:share.document_type==='text'?share.text_content:null},expires_at:share.expires_at})
})

internalDocumentPublicRoutes.get('/shared/:token/file', async (c) => {
  if(!c.env.UPLOADS) return c.json({error:'Document storage is not configured.'},503)
  const hash=await sha256Hex(c.req.param('token')); const share=await c.env.DB.prepare(`SELECT s.*,d.title,d.document_type,d.text_content,f.storage_key,f.mime_type,f.original_name FROM internal_document_shares s JOIN internal_documents d ON d.id=s.document_id LEFT JOIN document_files f ON f.id=d.current_file_id WHERE s.token_hash=?`).bind(hash).first<any>()
  if(!share||share.revoked_at) return c.json({error:'invalid link'},404); if(share.expires_at<now()) return c.json({error:'link expired'},410)
  await c.env.DB.prepare('UPDATE internal_document_shares SET download_count=download_count+1 WHERE id=?').bind(share.id).run()
  if(share.document_type==='text') return new Response(share.text_content||'',{headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="${String(share.title).replace(/"/g,'')}.txt"`}})
  const obj=await c.env.UPLOADS.get(share.storage_key); if(!obj)return c.json({error:'file missing'},404)
  return new Response(obj.body,{headers:{'Content-Type':share.mime_type||'application/octet-stream','Content-Disposition':`attachment; filename="${String(share.original_name||share.title).replace(/"/g,'')}"`}})
})
