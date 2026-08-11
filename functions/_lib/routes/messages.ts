import { Hono } from 'hono'
import type { AppEnv, Env, SessionUser } from '../types'
import { requireUser } from '../mid'
import { uuid } from '../crypto'
import { resolveClientId, canAccessClient, scopeFilter, ScopeError } from '../scope'
import { activityInsert } from '../activity'
import { notifyStaff, escapeHtml } from '../email'
import { safeUploadName, validateUploadSignature, type UploadKind } from '../fileValidation'
import { logAudit, actorGeo, actorIp, actorUserAgent } from '../auditLog'

export const messageRoutes = new Hono<AppEnv>()
messageRoutes.use('*', requireUser)
messageRoutes.onError((err,c)=>{if(err instanceof ScopeError)return c.json({error:err.message},err.status as any);console.error(err);return c.json({error:'internal error'},500)})

const MAX_ATTACHMENT_BYTES=15*1024*1024
const ALLOWED_ATTACHMENT_TYPES:Record<string,{ext:string;kind:UploadKind}>={
  'image/png':{ext:'png',kind:'png'},'image/jpeg':{ext:'jpg',kind:'jpeg'},'image/webp':{ext:'webp',kind:'webp'},'application/pdf':{ext:'pdf',kind:'pdf'},
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':{ext:'docx',kind:'docx'},
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':{ext:'xlsx',kind:'xlsx'},'text/plain':{ext:'txt',kind:'text'},
}
function markRead(env:Env,threadId:string,userId:string):D1PreparedStatement{return env.DB.prepare(`INSERT INTO thread_reads(thread_id,user_id,last_read_at) VALUES(?,?,datetime('now')) ON CONFLICT(thread_id,user_id) DO UPDATE SET last_read_at=excluded.last_read_at`).bind(threadId,userId)}
function notifyKind(user:SessionUser):string{return user.role==='client'?'message_received':'message_sent'}

messageRoutes.get('/message-threads',async(c)=>{const user=c.get('user');const{where,params}=await scopeFilter(c.env,user,'t.client_user_id');const res=await c.env.DB.prepare(`SELECT t.id,t.client_user_id,t.subject,t.created_by,t.created_at,t.last_message_at,u.full_name client_name,u.email client_email,(t.last_message_at>COALESCE(tr.last_read_at,'1970-01-01T00:00:00Z')) unread FROM message_threads t JOIN users u ON u.id=t.client_user_id LEFT JOIN thread_reads tr ON tr.thread_id=t.id AND tr.user_id=? WHERE ${where} ORDER BY t.last_message_at DESC LIMIT 200`).bind(user.id,...params).all();return c.json({threads:res.results??[]})})
messageRoutes.get('/message-threads/unread-count',async(c)=>{const user=c.get('user');const{where,params}=await scopeFilter(c.env,user,'t.client_user_id');const row=await c.env.DB.prepare(`SELECT COUNT(*) n FROM message_threads t LEFT JOIN thread_reads tr ON tr.thread_id=t.id AND tr.user_id=? WHERE ${where} AND t.last_message_at>COALESCE(tr.last_read_at,'1970-01-01T00:00:00Z')`).bind(user.id,...params).first<{n:number}>();return c.json({count:row?.n??0})})

async function loadThread(env:Env,user:SessionUser,id:string){const thread=await env.DB.prepare('SELECT * FROM message_threads WHERE id=?').bind(id).first<any>();if(!thread)throw new ScopeError('not found',404);if(!(await canAccessClient(env,user,thread.client_user_id)))throw new ScopeError('forbidden',403);return thread}

messageRoutes.get('/message-threads/:id',async(c)=>{
  const user=c.get('user');const thread=await loadThread(c.env,user,c.req.param('id'))
  const[messages,attachments,reads]=await Promise.all([
    c.env.DB.prepare(`SELECT m.id,m.thread_id,m.sender_user_id,m.body,m.created_at,u.full_name sender_name,u.email sender_email,u.role sender_role FROM thread_messages m JOIN users u ON u.id=m.sender_user_id WHERE m.thread_id=? ORDER BY m.created_at ASC`).bind(thread.id).all<any>(),
    c.env.DB.prepare(`SELECT a.id,a.message_id,a.file_name,a.content_type,a.size_bytes FROM message_attachments a JOIN thread_messages m ON m.id=a.message_id WHERE m.thread_id=?`).bind(thread.id).all(),
    c.env.DB.prepare(`SELECT tr.user_id,tr.last_read_at,u.role,u.full_name,u.email FROM thread_reads tr JOIN users u ON u.id=tr.user_id WHERE tr.thread_id=?`).bind(thread.id).all<any>(),
  ])
  await markRead(c.env,thread.id,user.id).run();const readRows=reads.results??[];const enriched=(messages.results??[]).map((m:any)=>{const readBy=readRows.filter((r:any)=>r.user_id!==m.sender_user_id&&new Date(r.last_read_at).getTime()>=new Date(m.created_at).getTime());return{...m,delivery_status:'delivered',read_at:readBy.length?readBy.sort((a:any,b:any)=>new Date(a.last_read_at).getTime()-new Date(b.last_read_at).getTime())[0].last_read_at:null}});return c.json({thread,messages:enriched,attachments:attachments.results??[]})
})

messageRoutes.post('/message-threads',async(c)=>{
  const user=c.get('user');const body=await c.req.json<{subject:string;body:string;client_user_id?:string}>().catch(()=>null);if(!body?.subject?.trim())return c.json({error:'Subject is required.'},400);if(!body?.body?.trim())return c.json({error:'Message body is required.'},400)
  const clientId=await resolveClientId(c.env,user,body.client_user_id);const threadId=uuid();const messageId=uuid();const subject=body.subject.trim().slice(0,200);const messageBody=body.body.trim().slice(0,8000)
  await c.env.DB.batch([c.env.DB.prepare(`INSERT INTO message_threads(id,client_user_id,subject,created_by) VALUES(?,?,?,?)`).bind(threadId,clientId,subject,user.id),c.env.DB.prepare(`INSERT INTO thread_messages(id,thread_id,sender_user_id,body) VALUES(?,?,?,?)`).bind(messageId,threadId,user.id,messageBody),markRead(c.env,threadId,user.id),activityInsert(c.env,{actorUserId:user.id,clientUserId:clientId,kind:notifyKind(user),detail:{subject}})])
  c.executionCtx.waitUntil(notifyNewMessage(c.env,user,clientId,subject,messageBody));return c.json({ok:true,id:threadId,message_id:messageId},201)
})

messageRoutes.post('/message-threads/:id/messages',async(c)=>{
  const user=c.get('user');const thread=await loadThread(c.env,user,c.req.param('id'));const body=await c.req.json<{body:string}>().catch(()=>({body:''}));if(!body.body?.trim())return c.json({error:'Message body is required.'},400);const messageBody=body.body.trim().slice(0,8000);const messageId=uuid()
  await c.env.DB.batch([c.env.DB.prepare(`INSERT INTO thread_messages(id,thread_id,sender_user_id,body) VALUES(?,?,?,?)`).bind(messageId,thread.id,user.id,messageBody),c.env.DB.prepare(`UPDATE message_threads SET last_message_at=datetime('now') WHERE id=?`).bind(thread.id),markRead(c.env,thread.id,user.id),activityInsert(c.env,{actorUserId:user.id,clientUserId:thread.client_user_id,kind:notifyKind(user),detail:{subject:thread.subject}})])
  c.executionCtx.waitUntil(notifyNewMessage(c.env,user,thread.client_user_id,thread.subject,messageBody));return c.json({ok:true,id:messageId},201)
})

async function notifyNewMessage(env:Env,sender:SessionUser,clientId:string,subject:string,body:string):Promise<void>{
  const assigned=await env.DB.prepare('SELECT staff_user_id FROM staff_assignments WHERE client_user_id=?').bind(clientId).all<{staff_user_id:string}>();let staffUserIds=(assigned.results??[]).map(r=>r.staff_user_id);if(sender.role!=='client')staffUserIds=staffUserIds.filter(id=>id!==sender.id);if(!staffUserIds.length)return
  const client=await env.DB.prepare('SELECT full_name,email FROM users WHERE id=?').bind(clientId).first<{full_name:string|null;email:string}>();const clientLabel=client?.full_name||client?.email||'a client';const senderLabel=sender.full_name||sender.email
  await notifyStaff(env,{staffUserIds,kind:notifyKind(sender),subject:`New secure message: ${subject}`,html:`<p><strong>${escapeHtml(senderLabel)}</strong> sent a secure message${sender.role==='client'?'':` to ${escapeHtml(clientLabel)}`} in “${escapeHtml(subject)}”:</p><p>${escapeHtml(body)}</p>`})
}

messageRoutes.post('/message-threads/:threadId/messages/:messageId/attachments',async(c)=>{
  if(!c.env.UPLOADS)return c.json({error:'File attachments are not configured yet.'},503);const user=c.get('user');const thread=await loadThread(c.env,user,c.req.param('threadId'));const message=await c.env.DB.prepare('SELECT id,sender_user_id FROM thread_messages WHERE id=? AND thread_id=?').bind(c.req.param('messageId'),thread.id).first<{id:string;sender_user_id:string}>();if(!message)return c.json({error:'not found'},404);if(message.sender_user_id!==user.id)return c.json({error:'forbidden'},403)
  const contentType=(c.req.header('Content-Type')||'').split(';')[0].toLowerCase();const allowed=ALLOWED_ATTACHMENT_TYPES[contentType];if(!allowed)return c.json({error:'Unsupported file type. Use PDF, PNG, JPG, WebP, DOCX, XLSX, or plain text.'},400)
  const bodyBuf=await c.req.raw.arrayBuffer();if(!bodyBuf.byteLength)return c.json({error:'The uploaded file is empty.'},400);if(bodyBuf.byteLength>MAX_ATTACHMENT_BYTES)return c.json({error:'File exceeds the 15 MB attachment limit.'},413)
  const signature=validateUploadSignature(bodyBuf,contentType,[allowed.kind]);if(!signature.ok)return c.json({error:signature.error},415)
  const fileName=safeUploadName(c.req.header('X-File-Name')||`attachment.${allowed.ext}`,`attachment.${allowed.ext}`);const attachmentId=uuid();const key=`messages/${thread.id}/${attachmentId}.${allowed.ext}`
  await c.env.UPLOADS.put(key,bodyBuf,{httpMetadata:{contentType},customMetadata:{validated:'signature-v1'}})
  await c.env.DB.batch([c.env.DB.prepare(`INSERT INTO message_attachments(id,message_id,r2_key,file_name,content_type,size_bytes) VALUES(?,?,?,?,?,?)`).bind(attachmentId,message.id,key,fileName,contentType,bodyBuf.byteLength),activityInsert(c.env,{actorUserId:user.id,clientUserId:thread.client_user_id,kind:'message_attachment_added',detail:{file_name:fileName,subject:thread.subject}})])
  await logAudit(c.env,{actorUserId:user.id,actorIp:actorIp(c.req.raw),actorUserAgent:actorUserAgent(c.req.raw),actorGeo:actorGeo(c.req.raw),action:'file_uploaded',entityType:'message_attachment',entityId:attachmentId,after:{thread_id:thread.id,file_name:fileName,content_type:contentType,size_bytes:bodyBuf.byteLength}})
  return c.json({ok:true,id:attachmentId},201)
})

messageRoutes.get('/message-attachments/:id',async(c)=>{
  if(!c.env.UPLOADS)return c.json({error:'not found'},404);const user=c.get('user');const attachment=await c.env.DB.prepare(`SELECT a.r2_key,a.file_name,a.content_type,t.client_user_id FROM message_attachments a JOIN thread_messages m ON m.id=a.message_id JOIN message_threads t ON t.id=m.thread_id WHERE a.id=?`).bind(c.req.param('id')).first<{r2_key:string;file_name:string;content_type:string;client_user_id:string}>();if(!attachment)return c.json({error:'not found'},404);if(!(await canAccessClient(c.env,user,attachment.client_user_id)))return c.json({error:'forbidden'},403);const obj=await c.env.UPLOADS.get(attachment.r2_key);if(!obj)return c.json({error:'not found'},404)
  return new Response(obj.body,{headers:{'Content-Type':attachment.content_type||'application/octet-stream','Content-Disposition':`attachment; filename="${attachment.file_name.replace(/"/g,'')}"`,'Cache-Control':'private, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}})
})
