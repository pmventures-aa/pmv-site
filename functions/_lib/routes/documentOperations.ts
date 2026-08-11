import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { uuid } from '../crypto'
import { requireUser } from '../mid'
import { escapeHtml, sendEmail } from '../email'
import { sha256Hex } from '../documentSealing'

export const documentOperationsAdminRoutes = new Hono<AppEnv>()

function now(){ return new Date().toISOString() }
function rawToken(){ const a=crypto.getRandomValues(new Uint8Array(24)); return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'') }
async function requireStaff(c:any,next:any){ return requireUser(c,async()=>{ const u=c.get('user'); if(!['owner','admin','staff'].includes(u.role)) return c.json({error:'forbidden'},403); return next() }) }
function evidence(c:any){ const cf=c.req.raw.cf as any; return {ip:c.req.header('CF-Connecting-IP')||null,city:cf?.city||null,region:cf?.region||null,country:cf?.country||null,ua:c.req.header('user-agent')||null} }
async function appendEvent(c:any,envId:string,eventType:string,recipientId:string|null,metadata:Record<string,unknown>={}){
  const prev=await c.env.DB.prepare('SELECT event_hash FROM envelope_events WHERE envelope_id=? ORDER BY occurred_at_utc DESC,id DESC LIMIT 1').bind(envId).first() as any
  const id=uuid(),occurred=now(),requestId=uuid(),prevHash=prev?.event_hash||'GENESIS',e=evidence(c),actor=c.get('user')
  const canonical=JSON.stringify({id,envId,recipientId,actorType:'staff',actorId:actor.id,eventType,occurred,requestId,metadata,prevHash,ip:e.ip,city:e.city,region:e.region,country:e.country,ua:e.ua})
  const hash=await sha256Hex(canonical)
  await c.env.DB.prepare(`INSERT INTO envelope_events (id,envelope_id,recipient_id,actor_type,actor_id,event_type,occurred_at_utc,ip_address,geo_city,geo_region,geo_country,user_agent,request_id,metadata_json,prev_event_hash,event_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,envId,recipientId,'staff',actor.id,eventType,occurred,e.ip,e.city,e.region,e.country,e.ua,requestId,JSON.stringify(metadata),prevHash,hash).run()
  await c.env.DB.prepare('UPDATE envelopes SET last_activity_at=?,updated_at=? WHERE id=?').bind(occurred,occurred,envId).run()
}
async function sendInvitation(c:any,env:any,r:any,kind:'send'|'reminder'){
  const raw=rawToken(),hash=await sha256Hex(raw),exp=new Date(Date.now()+7*86400000).toISOString(),stamp=now()
  await c.env.DB.prepare(`UPDATE envelope_recipients SET status=CASE WHEN status='pending' THEN 'invited' ELSE status END, invitation_token_hash=?,invitation_expires_at=?,last_invited_at=?,last_reminded_at=CASE WHEN ?='reminder' THEN ? ELSE last_reminded_at END,reminder_count=reminder_count+CASE WHEN ?='reminder' THEN 1 ELSE 0 END,updated_at=? WHERE id=?`).bind(hash,exp,stamp,kind,stamp,kind,stamp,r.id).run()
  const url=`https://www.pinnaclemanagementventures.com/sign/${encodeURIComponent(raw)}`
  const subject=kind==='reminder'?`Reminder: ${env.title}`:`Signature requested: ${env.title}`
  const lead=kind==='reminder'?'This is a reminder that a Pinnacle document is waiting for your review.':'Pinnacle Management Ventures has sent you a document for review and signature.'
  c.executionCtx.waitUntil(sendEmail(c.env,{to:r.email,subject,html:`<p>${escapeHtml(r.name)},</p><p>${lead}</p><p><a href="${url}">Review document</a></p><p>This secure link expires in 7 days.</p>`}).catch(()=>{}))
}

documentOperationsAdminRoutes.use('/document-ops/*',requireStaff)
documentOperationsAdminRoutes.use('/envelopes/*',requireStaff)

documentOperationsAdminRoutes.get('/document-ops/envelopes/:id',async c=>{
  const id=c.req.param('id')
  const [notes,approvals]=await Promise.all([
    c.env.DB.prepare(`SELECT n.*,u.full_name author_name,u.email author_email FROM envelope_notes n LEFT JOIN users u ON u.id=n.author_user_id WHERE n.envelope_id=? ORDER BY n.created_at DESC LIMIT 100`).bind(id).all(),
    c.env.DB.prepare(`SELECT a.*,u.full_name approver_name,u.email approver_email FROM envelope_approvals a LEFT JOIN users u ON u.id=a.approver_user_id WHERE a.envelope_id=? ORDER BY a.created_at DESC`).bind(id).all()
  ])
  return c.json({notes:notes.results,approvals:approvals.results})
})

documentOperationsAdminRoutes.patch('/document-ops/envelopes/:id',async c=>{
  const id=c.req.param('id'),b=await c.req.json<any>().catch(()=>null),env=await c.env.DB.prepare('SELECT * FROM envelopes WHERE id=?').bind(id).first() as any
  if(!env)return c.json({error:'not found'},404)
  if(env.status!=='draft'&&b?.signing_order_mode!==undefined)return c.json({error:'Signing order can only change while the envelope is a draft.'},409)
  const allowedPriority=['low','normal','high','urgent'],allowedReminder=['none','daily','every_3_days','weekly']
  const priority=allowedPriority.includes(b?.priority)?b.priority:env.priority||'normal'
  const reminder=allowedReminder.includes(b?.reminder_frequency)?b.reminder_frequency:env.reminder_frequency||'none'
  const tags=Array.isArray(b?.tags)?b.tags.map((v:any)=>String(v).trim()).filter(Boolean).slice(0,20):JSON.parse(env.tags_json||'[]')
  await c.env.DB.prepare(`UPDATE envelopes SET title=?,message=?,priority=?,signing_order_mode=?,expires_at=?,reminder_frequency=?,approval_status=?,approval_note=?,tags_json=?,updated_at=? WHERE id=?`).bind(
    b?.title!==undefined?String(b.title).trim().slice(0,200):env.title,
    b?.message!==undefined?(String(b.message).trim().slice(0,3000)||null):env.message,
    priority,
    b?.signing_order_mode==='sequential'?'sequential':b?.signing_order_mode==='parallel'?'parallel':env.signing_order_mode,
    b?.expires_at!==undefined?(b.expires_at||null):env.expires_at,
    reminder,
    ['not_required','pending','approved','rejected'].includes(b?.approval_status)?b.approval_status:env.approval_status,
    b?.approval_note!==undefined?(String(b.approval_note).trim().slice(0,2000)||null):env.approval_note,
    JSON.stringify(tags),now(),id).run()
  await appendEvent(c,id,'envelope.policy_updated',null,{priority,reminder_frequency:reminder,tags})
  return c.json({ok:true})
})

documentOperationsAdminRoutes.post('/document-ops/envelopes/:id/notes',async c=>{
  const id=c.req.param('id'),b=await c.req.json<any>().catch(()=>null),body=String(b?.body||'').trim()
  if(!body)return c.json({error:'note is required'},400)
  await c.env.DB.prepare('INSERT INTO envelope_notes (id,envelope_id,author_user_id,body) VALUES (?,?,?,?)').bind(uuid(),id,c.get('user').id,body.slice(0,5000)).run()
  await appendEvent(c,id,'envelope.note_added',null,{})
  return c.json({ok:true},201)
})

documentOperationsAdminRoutes.post('/document-ops/envelopes/:id/approval',async c=>{
  const id=c.req.param('id'),b=await c.req.json<any>().catch(()=>null),status=b?.status
  if(!['pending','approved','rejected','not_required'].includes(status))return c.json({error:'invalid approval status'},400)
  const note=String(b?.note||'').trim().slice(0,2000),uid=c.get('user').id
  await c.env.DB.prepare('UPDATE envelopes SET approval_status=?,approval_note=?,updated_at=? WHERE id=?').bind(status,note||null,now(),id).run()
  if(status==='approved'||status==='rejected')await c.env.DB.prepare(`INSERT INTO envelope_approvals (id,envelope_id,approver_user_id,status,note,decided_at) VALUES (?,?,?,?,?,?)`).bind(uuid(),id,uid,status,note||null,now()).run()
  await appendEvent(c,id,`envelope.approval_${status}`,null,{note:note||null})
  return c.json({ok:true})
})

documentOperationsAdminRoutes.patch('/document-ops/envelopes/:id/recipients/:recipientId',async c=>{
  const envId=c.req.param('id'),rid=c.req.param('recipientId'),env=await c.env.DB.prepare('SELECT status FROM envelopes WHERE id=?').bind(envId).first() as any,b=await c.req.json<any>().catch(()=>null)
  if(!env)return c.json({error:'not found'},404); if(env.status!=='draft')return c.json({error:'Recipients can only be edited while the envelope is a draft.'},409)
  const r=await c.env.DB.prepare('SELECT * FROM envelope_recipients WHERE id=? AND envelope_id=?').bind(rid,envId).first() as any; if(!r)return c.json({error:'recipient not found'},404)
  const roles=['signer','approver','cc','witness','notary'],role=roles.includes(b?.role)?b.role:r.role
  await c.env.DB.prepare('UPDATE envelope_recipients SET name=?,email=?,role=?,routing_order=?,updated_at=? WHERE id=?').bind(b?.name?String(b.name).slice(0,160):r.name,b?.email?String(b.email).toLowerCase().slice(0,200):r.email,role,Math.max(1,Number(b?.routing_order||r.routing_order||1)),now(),rid).run()
  await appendEvent(c,envId,'recipient.updated',rid,{role,routing_order:Math.max(1,Number(b?.routing_order||r.routing_order||1))})
  return c.json({ok:true})
})

documentOperationsAdminRoutes.delete('/document-ops/envelopes/:id/recipients/:recipientId',async c=>{
  const envId=c.req.param('id'),rid=c.req.param('recipientId'),env=await c.env.DB.prepare('SELECT status FROM envelopes WHERE id=?').bind(envId).first() as any
  if(!env)return c.json({error:'not found'},404); if(env.status!=='draft')return c.json({error:'Recipients can only be removed while the envelope is a draft.'},409)
  await appendEvent(c,envId,'recipient.removed',rid,{})
  await c.env.DB.prepare('DELETE FROM envelope_recipients WHERE id=? AND envelope_id=?').bind(rid,envId).run()
  return c.json({ok:true})
})

documentOperationsAdminRoutes.delete('/document-ops/envelopes/:id/fields/:fieldId',async c=>{
  const envId=c.req.param('id'),fid=c.req.param('fieldId'),env=await c.env.DB.prepare('SELECT status FROM envelopes WHERE id=?').bind(envId).first() as any
  if(!env)return c.json({error:'not found'},404); if(env.status!=='draft')return c.json({error:'Fields can only be removed while the envelope is a draft.'},409)
  const f=await c.env.DB.prepare('SELECT recipient_id,field_type,page_number FROM document_fields WHERE id=? AND envelope_id=?').bind(fid,envId).first() as any; if(!f)return c.json({error:'field not found'},404)
  await appendEvent(c,envId,'field.removed',f.recipient_id,{field_type:f.field_type,page_number:f.page_number})
  await c.env.DB.prepare('DELETE FROM document_fields WHERE id=? AND envelope_id=?').bind(fid,envId).run()
  return c.json({ok:true})
})

documentOperationsAdminRoutes.post('/document-ops/envelopes/:id/remind',async c=>{
  const id=c.req.param('id'),env=await c.env.DB.prepare('SELECT * FROM envelopes WHERE id=?').bind(id).first() as any; if(!env)return c.json({error:'not found'},404)
  if(!['sent','viewed','in_progress'].includes(env.status))return c.json({error:'Only active envelopes can be reminded.'},409)
  const rows=await c.env.DB.prepare(`SELECT * FROM envelope_recipients WHERE envelope_id=? AND role IN ('signer','approver','witness','notary') AND status NOT IN ('completed','declined','expired') ORDER BY routing_order`).bind(id).all() as any
  for(const r of rows.results)await sendInvitation(c,env,r,'reminder')
  await c.env.DB.prepare('UPDATE envelopes SET last_reminder_at=?,updated_at=? WHERE id=?').bind(now(),now(),id).run()
  await appendEvent(c,id,'envelope.reminder_sent',null,{recipient_count:rows.results.length})
  return c.json({ok:true,recipient_count:rows.results.length})
})

documentOperationsAdminRoutes.post('/document-ops/envelopes/:id/void',async c=>{
  const id=c.req.param('id'),b=await c.req.json<any>().catch(()=>null),reason=String(b?.reason||'').trim(),env=await c.env.DB.prepare('SELECT status FROM envelopes WHERE id=?').bind(id).first() as any
  if(!env)return c.json({error:'not found'},404); if(['completed','voided'].includes(env.status))return c.json({error:'This envelope can no longer be voided.'},409); if(reason.length<5)return c.json({error:'A void reason is required.'},400)
  await c.env.DB.prepare(`UPDATE envelopes SET status='voided',voided_at=?,void_reason=?,updated_at=? WHERE id=?`).bind(now(),reason.slice(0,1000),now(),id).run()
  await appendEvent(c,id,'envelope.voided',null,{reason:reason.slice(0,1000)})
  return c.json({ok:true})
})

documentOperationsAdminRoutes.post('/document-ops/envelopes/:id/duplicate',async c=>{
  const sourceId=c.req.param('id'),env=await c.env.DB.prepare('SELECT * FROM envelopes WHERE id=?').bind(sourceId).first() as any; if(!env)return c.json({error:'not found'},404)
  const id=uuid(),publicId=`PMV-${new Date().getUTCFullYear()}-${uuid().split('-')[0].toUpperCase()}`
  await c.env.DB.prepare(`INSERT INTO envelopes (id,public_id,title,message,client_id,template_id,source_file_id,canonical_file_id,status,signing_order_mode,expires_at,created_by_user_id,priority,approval_status,reminder_frequency,tags_json,last_activity_at) VALUES (?,?,?,?,?,?,?,?, 'draft',?,?,?,?,?,?,?,?)`).bind(id,publicId,`${env.title} Copy`.slice(0,200),env.message,env.client_id,env.template_id,env.source_file_id,env.canonical_file_id,env.signing_order_mode,null,c.get('user').id,env.priority||'normal',env.approval_status==='not_required'?'not_required':'pending',env.reminder_frequency||'none',env.tags_json||'[]',now()).run()
  const rs=await c.env.DB.prepare('SELECT * FROM envelope_recipients WHERE envelope_id=? ORDER BY routing_order,created_at').bind(sourceId).all() as any,recipientMap=new Map<string,string>()
  for(const r of rs.results){const nr=uuid();recipientMap.set(r.id,nr);await c.env.DB.prepare(`INSERT INTO envelope_recipients (id,envelope_id,role,routing_order,name,email,phone_e164,status) VALUES (?,?,?,?,?,?,?,'pending')`).bind(nr,id,r.role,r.routing_order,r.name,r.email,r.phone_e164).run()}
  const fs=await c.env.DB.prepare('SELECT * FROM document_fields WHERE envelope_id=? ORDER BY page_number,created_at').bind(sourceId).all() as any
  for(const f of fs.results){const nr=recipientMap.get(f.recipient_id);if(!nr)continue;await c.env.DB.prepare(`INSERT INTO document_fields (id,envelope_id,recipient_id,page_number,field_type,x,y,width,height,required,label,validation_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uuid(),id,nr,f.page_number,f.field_type,f.x,f.y,f.width,f.height,f.required,f.label,f.validation_json).run()}
  await appendEvent(c,id,'envelope.duplicated',null,{source_envelope_id:sourceId})
  return c.json({id,public_id:publicId},201)
})

// Enterprise send gate shadows the original send route because this router is mounted first.
documentOperationsAdminRoutes.post('/envelopes/:id/send',async c=>{
  const envId=c.req.param('id'),env=await c.env.DB.prepare('SELECT * FROM envelopes WHERE id=?').bind(envId).first() as any; if(!env)return c.json({error:'not found'},404)
  if(env.status!=='draft')return c.json({error:'Only draft envelopes can be sent.'},409)
  if(env.approval_status==='pending'||env.approval_status==='rejected')return c.json({error:env.approval_status==='pending'?'Envelope approval is required before sending.':'This envelope was rejected and must be revised before sending.'},409)
  if(env.expires_at&&env.expires_at<=now())return c.json({error:'Expiration must be in the future.'},400)
  const rs=await c.env.DB.prepare(`SELECT * FROM envelope_recipients WHERE envelope_id=? AND role IN ('signer','approver','witness','notary') ORDER BY routing_order,created_at`).bind(envId).all() as any; if(!rs.results.length)return c.json({error:'Add at least one signing recipient.'},400)
  const fieldCounts=await c.env.DB.prepare(`SELECT recipient_id,COUNT(*) n FROM document_fields WHERE envelope_id=? AND required=1 GROUP BY recipient_id`).bind(envId).all() as any,withFields=new Set(fieldCounts.results.map((r:any)=>r.recipient_id))
  const missing=rs.results.filter((r:any)=>r.role==='signer'&&!withFields.has(r.id)); if(missing.length)return c.json({error:`Required fields are missing for ${missing.map((r:any)=>r.name).join(', ')}.`},400)
  const stamp=now(); await c.env.DB.prepare(`UPDATE envelopes SET status='sent',sent_at=?,last_activity_at=?,updated_at=? WHERE id=?`).bind(stamp,stamp,stamp,envId).run()
  const active=env.signing_order_mode==='sequential'?rs.results.filter((r:any)=>r.routing_order===Math.min(...rs.results.map((x:any)=>Number(x.routing_order||1)))):rs.results
  for(const r of active)await sendInvitation(c,env,r,'send')
  await appendEvent(c,envId,'envelope.sent',null,{recipient_count:rs.results.length,invited_now:active.length,signing_order_mode:env.signing_order_mode})
  return c.json({ok:true})
})
