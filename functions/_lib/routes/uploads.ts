import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireUser } from '../mid'
import { canAccessClient } from '../scope'
import { uuid } from '../crypto'
import { logActivity } from '../activity'
import { logAudit, actorGeo, actorIp, actorUserAgent } from '../auditLog'
import { validateUploadSignature } from '../fileValidation'

export const uploadRoutes = new Hono<AppEnv>()

const MAX_AVATAR_BYTES = 3 * 1024 * 1024
const ALLOWED_TYPES: Record<string, string> = { 'image/png':'png','image/jpeg':'jpg','image/webp':'webp' }

async function storeAvatar(env: AppEnv['Bindings'], userId: string, req: Request): Promise<{ error: string; status: number } | { key: string; size:number; contentType:string }> {
  if (!env.UPLOADS) return { error:'photo uploads are not configured yet',status:503 }
  const contentType=req.headers.get('Content-Type')||'';const ext=ALLOWED_TYPES[contentType]
  if(!ext)return {error:'unsupported image type — use PNG, JPEG, or WebP',status:400}
  const body=await req.arrayBuffer()
  if(body.byteLength===0)return {error:'empty upload',status:400}
  if(body.byteLength>MAX_AVATAR_BYTES)return {error:'image too large — 3MB max',status:413}
  const signature=validateUploadSignature(body,contentType,['png','jpeg','webp'])
  if(!signature.ok)return {error:signature.error,status:400}
  const key=`avatars/${userId}/${uuid()}.${ext}`
  await env.UPLOADS.put(key,body,{httpMetadata:{contentType},customMetadata:{validated:'signature-v1'}})
  const prev=await env.DB.prepare('SELECT avatar_key FROM users WHERE id=?').bind(userId).first<{avatar_key:string|null}>()
  await env.DB.prepare('UPDATE users SET avatar_key=? WHERE id=?').bind(key,userId).run()
  if(prev?.avatar_key)await env.UPLOADS.delete(prev.avatar_key).catch(()=>{})
  return {key,size:body.byteLength,contentType}
}

uploadRoutes.post('/me/avatar', requireUser, async(c)=>{
  const user=c.get('user');const result=await storeAvatar(c.env,user.id,c.req.raw)
  if('error'in result)return c.json({error:result.error},result.status as any)
  await logAudit(c.env,{actorUserId:user.id,actorIp:actorIp(c.req.raw),actorUserAgent:actorUserAgent(c.req.raw),actorGeo:actorGeo(c.req.raw),action:'file_uploaded',entityType:'avatar',entityId:user.id,after:{size_bytes:result.size,content_type:result.contentType}})
  return c.json({ok:true,key:result.key})
})

uploadRoutes.post('/admin/clients/:id/avatar', requireUser, async(c)=>{
  const user=c.get('user');if(user.role==='client')return c.json({error:'forbidden'},403)
  const clientId=c.req.param('id')??'';if(!(await canAccessClient(c.env,user,clientId)))return c.json({error:'forbidden'},403)
  const result=await storeAvatar(c.env,clientId,c.req.raw);if('error'in result)return c.json({error:result.error},result.status as any)
  await Promise.all([
    logActivity(c.env,{actorUserId:user.id,clientUserId:clientId,kind:'avatar_updated',detail:{}}),
    logAudit(c.env,{actorUserId:user.id,actorIp:actorIp(c.req.raw),actorUserAgent:actorUserAgent(c.req.raw),actorGeo:actorGeo(c.req.raw),action:'file_uploaded',entityType:'client_avatar',entityId:clientId,after:{size_bytes:result.size,content_type:result.contentType}}),
  ])
  return c.json({ok:true,key:result.key})
})

uploadRoutes.post('/admin/users/:id/avatar', requireUser, async(c)=>{
  const actor=c.get('user');if(actor.role==='client')return c.json({error:'forbidden'},403)
  const targetId=c.req.param('id')??''
  const target=await c.env.DB.prepare('SELECT id, role FROM users WHERE id=?').bind(targetId).first<{id:string;role:string}>()
  if(!target)return c.json({error:'not found'},404)
  if(target.role==='client' && !(await canAccessClient(c.env,actor,targetId)))return c.json({error:'forbidden'},403)
  const result=await storeAvatar(c.env,targetId,c.req.raw);if('error'in result)return c.json({error:result.error},result.status as any)
  await Promise.all([
    target.role==='client' ? logActivity(c.env,{actorUserId:actor.id,clientUserId:targetId,kind:'avatar_updated',detail:{}}) : Promise.resolve(),
    logAudit(c.env,{actorUserId:actor.id,actorIp:actorIp(c.req.raw),actorUserAgent:actorUserAgent(c.req.raw),actorGeo:actorGeo(c.req.raw),action:'file_uploaded',entityType:'user_avatar',entityId:targetId,after:{size_bytes:result.size,content_type:result.contentType,target_role:target.role}}),
  ])
  return c.json({ok:true,key:result.key})
})

uploadRoutes.get('/avatar/:userId',async(c)=>{
  if(!c.env.UPLOADS)return c.json({error:'not found'},404)
  const row=await c.env.DB.prepare('SELECT avatar_key FROM users WHERE id=?').bind(c.req.param('userId')).first<{avatar_key:string|null}>()
  if(!row?.avatar_key)return c.json({error:'not found'},404)
  const obj=await c.env.UPLOADS.get(row.avatar_key);if(!obj)return c.json({error:'not found'},404)
  return new Response(obj.body,{headers:{'Content-Type':obj.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}})
})

uploadRoutes.get('/comms-images/:file',async(c)=>{
  if(!c.env.UPLOADS)return c.json({error:'not found'},404)
  const file=c.req.param('file');if(!/^[a-zA-Z0-9-]+\.(png|jpe?g|webp|gif)$/.test(file))return c.json({error:'not found'},404)
  const obj=await c.env.UPLOADS.get(`comms/${file}`);if(!obj)return c.json({error:'not found'},404)
  return new Response(obj.body,{headers:{'Content-Type':obj.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}})
})
