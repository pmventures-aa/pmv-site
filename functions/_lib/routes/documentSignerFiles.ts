import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { sha256Hex } from '../documentSealing'

export const documentSignerFileRoutes=new Hono<AppEnv>()
const now=()=>new Date().toISOString()

async function recipientForToken(c:any){
  const hash=await sha256Hex(c.req.param('token'))
  return c.env.DB.prepare(
    `SELECT r.*,e.source_file_id,e.status envelope_status,e.expires_at
     FROM envelope_recipients r JOIN envelopes e ON e.id=r.envelope_id
     WHERE r.invitation_token_hash=?`,
  ).bind(hash).first() as Promise<any>
}

async function requireSignerSession(c:any, recipientId:string){
  const raw=c.req.header('x-signing-session')||c.req.query('session')||''
  if(!raw)return null
  const v=await c.env.SESSIONS.get(`sign:${raw}`)
  if(!v)return null
  try{
    const ses=JSON.parse(v) as {recipient_id?:string;envelope_id?:string}
    if(ses.recipient_id!==recipientId)return null
    return ses
  }catch{return null}
}

documentSignerFileRoutes.get('/sign/:token/documents/:documentId/file',async c=>{
  if(!c.env.UPLOADS)return c.json({error:'document storage is not configured'},503)
  const r=await recipientForToken(c)
  if(!r)return c.json({error:'invalid or revoked link'},404)
  if(r.access_revoked_at)return c.json({error:'access revoked'},410)
  if(r.invitation_expires_at&&r.invitation_expires_at<now())return c.json({error:'link expired'},410)
  if(r.expires_at&&r.expires_at<now())return c.json({error:'envelope expired'},410)
  if(['voided','expired','declined'].includes(r.envelope_status))return c.json({error:`envelope ${r.envelope_status}`},410)

  // OTP-backed signing session is required before the PDF bytes leave the
  // edge. Invitation tokens alone must not be enough to download the packet.
  const ses=await requireSignerSession(c,r.id)
  if(!ses)return c.json({error:'authentication required'},401)

  const documentId=c.req.param('documentId');let fileId:string|null=null
  if(documentId==='source')fileId=r.source_file_id||null
  else{
    const d=await c.env.DB.prepare('SELECT document_file_id FROM envelope_documents WHERE id=? AND envelope_id=?').bind(documentId,r.envelope_id).first() as any
    fileId=d?.document_file_id||null
  }
  if(!fileId)return c.json({error:'document not found'},404)
  const f=await c.env.DB.prepare('SELECT storage_key,mime_type,original_name FROM document_files WHERE id=?').bind(fileId).first() as any
  if(!f)return c.json({error:'file not found'},404)
  const obj=await c.env.UPLOADS.get(f.storage_key);if(!obj)return c.json({error:'file missing'},404)
  return new Response(obj.body,{headers:{'Content-Type':f.mime_type||'application/pdf','Content-Disposition':`inline; filename="${String(f.original_name||'document.pdf').replace(/"/g,'')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
})
