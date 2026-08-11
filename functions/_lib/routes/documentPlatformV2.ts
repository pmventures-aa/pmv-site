import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireUser } from '../mid'
import { uuid } from '../crypto'
import { escapeHtml, sendEmail } from '../email'
import { sha256Hex } from '../documentSealing'

export const documentPlatformV2AdminRoutes = new Hono<AppEnv>()
export const documentPlatformV2PublicRoutes = new Hono<AppEnv>()
export const documentPlatformV2AutomationRoutes = new Hono<AppEnv>()

function now(){ return new Date().toISOString() }
function token(){ const a=crypto.getRandomValues(new Uint8Array(24)); return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'') }
function safeJson<T>(value:string|null|undefined,fallback:T):T{ try{return value?JSON.parse(value) as T:fallback}catch{return fallback} }
function timingSafeEqualText(a:string,b:string){ if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i+=1)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0 }
async function requireStaff(c:any,next:any){return requireUser(c,async()=>{const u=c.get('user');if(!['owner','admin','staff'].includes(u.role))return c.json({error:'forbidden'},403);return next()})}
async function requireOwner(c:any,next:any){return requireUser(c,async()=>{const u=c.get('user');if(u.role!=='owner'&&u.role!=='admin')return c.json({error:'owner access required'},403);return next()})}
async function requireAutomation(c:any,next:any){const expected=String(c.env.AUTOMATION_CRON_SECRET1||'').trim();if(!expected)return c.json({error:'automation secret not configured'},503);const provided=String(c.req.header('x-pmv-automation-secret')||'').trim();if(!provided||!timingSafeEqualText(provided,expected))return c.json({error:'forbidden'},403);return next()}
async function signerSession(c:any){const raw=c.req.header('x-signing-session')||'';const v=await c.env.SESSIONS.get(`sign:${raw}`);return v?JSON.parse(v):null}

async function appendSystemEvent(env:any,envelopeId:string,eventType:string,metadata:any={}){
  const prev=await env.DB.prepare('SELECT event_hash FROM envelope_events WHERE envelope_id=? ORDER BY occurred_at_utc DESC,id DESC LIMIT 1').bind(envelopeId).first() as any
  const id=uuid(),occurred=now(),requestId=uuid(),prevHash=prev?.event_hash||'GENESIS'
  const canonical=JSON.stringify({id,envelopeId,eventType,occurred,requestId,metadata,prevHash,actorType:'system'})
  const hash=await sha256Hex(canonical)
  await env.DB.prepare(`INSERT INTO envelope_events (id,envelope_id,recipient_id,actor_type,actor_id,event_type,occurred_at_utc,request_id,metadata_json,prev_event_hash,event_hash) VALUES (?,?,NULL,'system',NULL,?,?,?,?,?,?)`).bind(id,envelopeId,eventType,occurred,requestId,JSON.stringify(metadata),prevHash,hash).run()
  await env.DB.prepare('UPDATE envelopes SET last_activity_at=?,updated_at=? WHERE id=?').bind(occurred,occurred,envelopeId).run()
}
async function appendStaffEvent(c:any,envelopeId:string,eventType:string,recipientId:string|null,metadata:any={}){
  const prev=await c.env.DB.prepare('SELECT event_hash FROM envelope_events WHERE envelope_id=? ORDER BY occurred_at_utc DESC,id DESC LIMIT 1').bind(envelopeId).first() as any
  const actor=c.get('user'),id=uuid(),occurred=now(),requestId=uuid(),prevHash=prev?.event_hash||'GENESIS'
  const canonical=JSON.stringify({id,envelopeId,eventType,occurred,requestId,metadata,prevHash,actorType:'staff',actorId:actor.id,recipientId})
  const hash=await sha256Hex(canonical)
  await c.env.DB.prepare(`INSERT INTO envelope_events (id,envelope_id,recipient_id,actor_type,actor_id,event_type,occurred_at_utc,request_id,metadata_json,prev_event_hash,event_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(id,envelopeId,recipientId,'staff',actor.id,eventType,occurred,requestId,JSON.stringify(metadata),prevHash,hash).run()
  await c.env.DB.prepare('UPDATE envelopes SET last_activity_at=?,updated_at=? WHERE id=?').bind(occurred,occurred,envelopeId).run()
}
async function issueRecipientInvitation(env:any,envelope:any,recipient:any,kind:'send'|'reminder'|'replacement'){
  const raw=token(),hash=await sha256Hex(raw),stamp=now(),exp=new Date(Date.now()+7*86400000).toISOString()
  await env.DB.prepare(`UPDATE envelope_recipients SET invitation_token_hash=?,invitation_expires_at=?,last_invited_at=?,last_reminded_at=CASE WHEN ?='reminder' THEN ? ELSE last_reminded_at END,reminder_count=reminder_count+CASE WHEN ?='reminder' THEN 1 ELSE 0 END,status=CASE WHEN status='pending' THEN 'invited' ELSE status END,updated_at=? WHERE id=?`).bind(hash,exp,stamp,kind,stamp,kind,stamp,recipient.id).run()
  const url=`https://www.pinnaclemanagementventures.com/sign/${encodeURIComponent(raw)}`
  const subject=kind==='reminder'?`Reminder: ${envelope.title}`:kind==='replacement'?`Signature request reassigned to you: ${envelope.title}`:`Signature requested: ${envelope.title}`
  const lead=kind==='reminder'?'A Pinnacle document is still waiting for your review.':kind==='replacement'?'You have been securely assigned as the replacement recipient for this document.':'Pinnacle Management Ventures has sent you a document for review and signature.'
  await sendEmail(env,{to:recipient.email,subject,html:`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:28px;background:#fbf8ef;color:#0b1830"><div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#9b7a2d">Pinnacle Management Ventures</div><h1 style="font-size:24px;margin:12px 0">${escapeHtml(envelope.title)}</h1><p>${escapeHtml(recipient.name)},</p><p>${lead}</p><p style="margin:26px 0"><a href="${url}" style="display:inline-block;background:#0b1830;color:#f1dca7;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:700">Review & Sign</a></p><p style="font-size:12px;color:#6b7280">This secure link expires in 7 days. If access is replaced or revoked, this link stops working immediately.</p></div>`})
}
function diffText(left:string,right:string){
  const a=left.split(/\r?\n/),b=right.split(/\r?\n/),max=Math.max(a.length,b.length);let changed=0,added=0,removed=0
  const samples:string[]=[]
  for(let i=0;i<max;i+=1){if(a[i]===b[i])continue;if(a[i]===undefined)added+=1;else if(b[i]===undefined)removed+=1;else changed+=1;if(samples.length<20)samples.push(`Line ${i+1}: ${a[i]??'[added]'} -> ${b[i]??'[removed]'}`)}
  return {changed_lines:changed,added_lines:added,removed_lines:removed,samples}
}
function validateField(field:any,value:string){
  const rule=safeJson<any>(field.validation_json,{})
  if(field.required===1&&!value.trim()&&field.field_type!=='checkbox')return field.validation_error_message||'This field is required.'
  if(field.required===1&&field.field_type==='checkbox'&&value!=='true')return field.validation_error_message||'This confirmation is required.'
  if(!value&&!field.required)return null
  if(rule.minLength&&value.length<Number(rule.minLength))return field.validation_error_message||`Enter at least ${rule.minLength} characters.`
  if(rule.maxLength&&value.length>Number(rule.maxLength))return field.validation_error_message||`Enter no more than ${rule.maxLength} characters.`
  if(rule.format==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return field.validation_error_message||'Enter a valid email address.'
  if(rule.format==='phone'&&!/^\+?[0-9().\-\s]{7,20}$/.test(value))return field.validation_error_message||'Enter a valid phone number.'
  if(rule.format==='number'&&!Number.isFinite(Number(value)))return field.validation_error_message||'Enter a valid number.'
  if(rule.pattern){try{if(!new RegExp(String(rule.pattern)).test(value))return field.validation_error_message||'The value does not match the required format.'}catch{/* ignore invalid admin pattern */}}
  if(Array.isArray(rule.allowedValues)&&rule.allowedValues.length&&!rule.allowedValues.map(String).includes(value))return field.validation_error_message||'Choose an allowed value.'
  return null
}

// Admin access
documentPlatformV2AdminRoutes.use('/document-platform/*',requireStaff)

// Reusable envelope templates
documentPlatformV2AdminRoutes.get('/document-platform/templates',async c=>{
  const rows=await c.env.DB.prepare(`SELECT t.*,(SELECT COUNT(*) FROM envelope_template_versions_v2 v WHERE v.template_id=t.id) version_count FROM envelope_templates_v2 t ORDER BY t.updated_at DESC`).all()
  return c.json({templates:rows.results||[]})
})
documentPlatformV2AdminRoutes.post('/document-platform/templates/from-envelope/:envelopeId',async c=>{
  const envelopeId=c.req.param('envelopeId'),body=await c.req.json<any>().catch(()=>({})),e=await c.env.DB.prepare('SELECT * FROM envelopes WHERE id=?').bind(envelopeId).first() as any
  if(!e)return c.json({error:'envelope not found'},404)
  const [recipients,fields,docs]=await Promise.all([
    c.env.DB.prepare('SELECT role,routing_order,name,email,phone_e164,id FROM envelope_recipients WHERE envelope_id=? ORDER BY routing_order,created_at').bind(envelopeId).all(),
    c.env.DB.prepare('SELECT recipient_id,envelope_document_id,page_number,field_type,x,y,width,height,required,label,validation_json,condition_json,validation_error_message FROM document_fields WHERE envelope_id=? ORDER BY page_number,created_at').bind(envelopeId).all(),
    c.env.DB.prepare('SELECT document_file_id,title,sort_order,required FROM envelope_documents WHERE envelope_id=? ORDER BY sort_order').bind(envelopeId).all(),
  ])
  const recipientRows=(recipients.results||[]) as any[],recipientIndex=new Map(recipientRows.map((r,i)=>[r.id,i]))
  const fieldBlueprint=((fields.results||[]) as any[]).map(f=>({...f,recipient_index:recipientIndex.get(f.recipient_id)??0,recipient_id:undefined}))
  const snapshot={title_template:e.title,message_template:e.message,signing_order_mode:e.signing_order_mode,priority:e.priority||'normal',reminder_frequency:e.reminder_frequency||'none',expiration_days:body.expiration_days??null,approval_status_default:e.approval_status==='pending'?'pending':'not_required',branding_profile_id:e.branding_profile_id||null,tags:safeJson(e.tags_json,[]),recipients:recipientRows.map(({id,...r})=>r),fields:fieldBlueprint,documents:docs.results||[],settings:{source_file_id:e.source_file_id,canonical_file_id:e.canonical_file_id}}
  const id=uuid(),name=String(body.name||`${e.title} Template`).trim().slice(0,180)
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO envelope_templates_v2(id,name,description,status,source_envelope_id,title_template,message_template,signing_order_mode,priority,reminder_frequency,expiration_days,approval_status_default,branding_profile_id,tags_json,recipient_blueprint_json,field_blueprint_json,settings_json,created_by_user_id,updated_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,name,String(body.description||'').trim().slice(0,1000)||null,'active',envelopeId,e.title,e.message,e.signing_order_mode,e.priority||'normal',e.reminder_frequency||'none',body.expiration_days??null,e.approval_status==='pending'?'pending':'not_required',e.branding_profile_id||null,JSON.stringify(snapshot.tags),JSON.stringify(snapshot.recipients),JSON.stringify(snapshot.fields),JSON.stringify({...snapshot.settings,documents:snapshot.documents}),c.get('user').id,c.get('user').id),
    c.env.DB.prepare(`INSERT INTO envelope_template_versions_v2(id,template_id,version_number,snapshot_json,change_note,created_by_user_id) VALUES (?,?,?,?,?,?)`).bind(uuid(),id,1,JSON.stringify(snapshot),'Initial template snapshot',c.get('user').id),
  ])
  await appendStaffEvent(c,envelopeId,'template.created_from_envelope',null,{template_id:id,name})
  return c.json({id,name},201)
})
documentPlatformV2AdminRoutes.post('/document-platform/templates/:templateId/version',async c=>{
  const id=c.req.param('templateId'),body=await c.req.json<any>().catch(()=>({})),t=await c.env.DB.prepare('SELECT * FROM envelope_templates_v2 WHERE id=?').bind(id).first() as any
  if(!t)return c.json({error:'template not found'},404)
  const version=Number(t.version_number||1)+1
  const snapshot={title_template:body.title_template??t.title_template,message_template:body.message_template??t.message_template,signing_order_mode:body.signing_order_mode??t.signing_order_mode,priority:body.priority??t.priority,reminder_frequency:body.reminder_frequency??t.reminder_frequency,expiration_days:body.expiration_days??t.expiration_days,approval_status_default:body.approval_status_default??t.approval_status_default,branding_profile_id:body.branding_profile_id??t.branding_profile_id,tags:body.tags??safeJson(t.tags_json,[]),recipients:body.recipients??safeJson(t.recipient_blueprint_json,[]),fields:body.fields??safeJson(t.field_blueprint_json,[]),settings:body.settings??safeJson(t.settings_json,{})}
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE envelope_templates_v2 SET title_template=?,message_template=?,signing_order_mode=?,priority=?,reminder_frequency=?,expiration_days=?,approval_status_default=?,branding_profile_id=?,tags_json=?,recipient_blueprint_json=?,field_blueprint_json=?,settings_json=?,version_number=?,updated_by_user_id=?,updated_at=? WHERE id=?`).bind(snapshot.title_template,snapshot.message_template,snapshot.signing_order_mode,snapshot.priority,snapshot.reminder_frequency,snapshot.expiration_days,snapshot.approval_status_default,snapshot.branding_profile_id,JSON.stringify(snapshot.tags),JSON.stringify(snapshot.recipients),JSON.stringify(snapshot.fields),JSON.stringify(snapshot.settings),version,c.get('user').id,now(),id),
    c.env.DB.prepare(`INSERT INTO envelope_template_versions_v2(id,template_id,version_number,snapshot_json,change_note,created_by_user_id) VALUES (?,?,?,?,?,?)`).bind(uuid(),id,version,JSON.stringify(snapshot),String(body.change_note||'Template updated').slice(0,500),c.get('user').id),
  ])
  return c.json({ok:true,version_number:version})
})
documentPlatformV2AdminRoutes.post('/document-platform/templates/:templateId/use',async c=>{
  const id=c.req.param('templateId'),body=await c.req.json<any>().catch(()=>({})),t=await c.env.DB.prepare('SELECT * FROM envelope_templates_v2 WHERE id=? AND status=?').bind(id,'active').first() as any
  if(!t)return c.json({error:'active template not found'},404)
  const settings=safeJson<any>(t.settings_json,{}),recipients=safeJson<any[]>(t.recipient_blueprint_json,[]),fields=safeJson<any[]>(t.field_blueprint_json,[]),docs=(settings.documents||[]) as any[]
  const sourceFileId=docs[0]?.document_file_id||settings.source_file_id
  if(!sourceFileId)return c.json({error:'template has no source document'},409)
  const envId=uuid(),publicId=`PMV-${new Date().getUTCFullYear()}-${uuid().split('-')[0].toUpperCase()}`
  const expiration=t.expiration_days?new Date(Date.now()+Number(t.expiration_days)*86400000).toISOString():null
  await c.env.DB.prepare(`INSERT INTO envelopes(id,public_id,title,message,client_id,template_id,source_file_id,canonical_file_id,status,signing_order_mode,expires_at,created_by_user_id,priority,approval_status,reminder_frequency,tags_json,last_activity_at,branding_profile_id) VALUES (?,?,?,?,?,?,?,?, 'draft',?,?,?,?,?,?,?,?,?,?)`).bind(envId,publicId,String(body.title||t.title_template||t.name).slice(0,200),body.message??t.message_template,body.client_id||null,id,sourceFileId,settings.canonical_file_id||sourceFileId,t.signing_order_mode,expiration,c.get('user').id,t.priority,t.approval_status_default,t.reminder_frequency,t.tags_json||'[]',now(),t.branding_profile_id||null).run()
  const recipientIds:string[]=[]
  for(const r of recipients){const rid=uuid();recipientIds.push(rid);await c.env.DB.prepare(`INSERT INTO envelope_recipients(id,envelope_id,role,routing_order,name,email,phone_e164,status) VALUES (?,?,?,?,?,?,?,'pending')`).bind(rid,envId,r.role||'signer',Number(r.routing_order||1),String(r.name||'Recipient').slice(0,160),String(r.email||'').toLowerCase().slice(0,200),r.phone_e164||null).run()}
  const docMap=new Map<number,string>()
  for(const d of docs){const did=uuid();docMap.set(Number(d.sort_order||1),did);await c.env.DB.prepare(`INSERT INTO envelope_documents(id,envelope_id,document_file_id,title,sort_order,required,created_by_user_id) VALUES (?,?,?,?,?,?,?)`).bind(did,envId,d.document_file_id,d.title||'Document',Number(d.sort_order||1),d.required===0?0:1,c.get('user').id).run()}
  if(!docs.length){const did=uuid();docMap.set(1,did);await c.env.DB.prepare(`INSERT INTO envelope_documents(id,envelope_id,document_file_id,title,sort_order,required,created_by_user_id) VALUES (?,?,?,?,1,1,?)`).bind(did,envId,sourceFileId,t.title_template||t.name,c.get('user').id).run()}
  for(const f of fields){const rid=recipientIds[Number(f.recipient_index||0)];if(!rid)continue;await c.env.DB.prepare(`INSERT INTO document_fields(id,envelope_id,recipient_id,envelope_document_id,page_number,field_type,x,y,width,height,required,label,validation_json,condition_json,validation_error_message) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uuid(),envId,rid,f.envelope_document_id||docMap.get(Number(f.document_sort_order||1))||docMap.get(1)||null,Number(f.page_number||1),f.field_type||'text',Number(f.x||0.1),Number(f.y||0.1),Number(f.width||0.2),Number(f.height||0.05),f.required===0?0:1,f.label||null,f.validation_json||null,f.condition_json||null,f.validation_error_message||null).run()}
  await appendStaffEvent(c,envId,'envelope.created_from_template',null,{template_id:id,template_version:t.version_number})
  return c.json({id:envId,public_id:publicId},201)
})
documentPlatformV2AdminRoutes.get('/document-platform/templates/:templateId/versions',async c=>{const rows=await c.env.DB.prepare('SELECT id,version_number,change_note,created_by_user_id,created_at FROM envelope_template_versions_v2 WHERE template_id=? ORDER BY version_number DESC').bind(c.req.param('templateId')).all();return c.json({versions:rows.results||[]})})
documentPlatformV2AdminRoutes.get('/document-platform/templates/:templateId/compare',async c=>{
  const id=c.req.param('templateId'),left=Number(c.req.query('left')||0),right=Number(c.req.query('right')||0)
  const rows=await c.env.DB.prepare('SELECT version_number,snapshot_json FROM envelope_template_versions_v2 WHERE template_id=? AND version_number IN (?,?)').bind(id,left,right).all() as any
  if((rows.results||[]).length!==2)return c.json({error:'both template versions are required'},400)
  const a=rows.results.find((r:any)=>Number(r.version_number)===left),b=rows.results.find((r:any)=>Number(r.version_number)===right),summary=diffText(JSON.stringify(safeJson(a.snapshot_json,{}),null,2),JSON.stringify(safeJson(b.snapshot_json,{}),null,2))
  await c.env.DB.prepare(`INSERT INTO document_version_comparisons(id,subject_type,subject_id,left_version,right_version,summary_json,created_by_user_id) VALUES (?,'template',?,?,?,?,?)`).bind(uuid(),id,left,right,JSON.stringify(summary),c.get('user').id).run()
  return c.json({left,right,summary})
})

// Multi-document packet operations
documentPlatformV2AdminRoutes.get('/document-platform/envelopes/:envelopeId/documents',async c=>{const rows=await c.env.DB.prepare(`SELECT d.*,f.original_name,f.mime_type,f.size_bytes,f.sha256 FROM envelope_documents d JOIN document_files f ON f.id=d.document_file_id WHERE d.envelope_id=? ORDER BY d.sort_order`).bind(c.req.param('envelopeId')).all();return c.json({documents:rows.results||[]})})
documentPlatformV2AdminRoutes.post('/document-platform/envelopes/:envelopeId/documents',async c=>{
  const envId=c.req.param('envelopeId'),b=await c.req.json<any>().catch(()=>null),e=await c.env.DB.prepare('SELECT status FROM envelopes WHERE id=?').bind(envId).first() as any
  if(!e)return c.json({error:'envelope not found'},404);if(e.status!=='draft')return c.json({error:'Documents can only be added while the envelope is a draft.'},409);if(!b?.document_file_id)return c.json({error:'document_file_id is required'},400)
  const max=await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order),0) n FROM envelope_documents WHERE envelope_id=?').bind(envId).first() as any,id=uuid()
  await c.env.DB.prepare(`INSERT INTO envelope_documents(id,envelope_id,document_file_id,title,sort_order,required,created_by_user_id) VALUES (?,?,?,?,?,?,?)`).bind(id,envId,b.document_file_id,String(b.title||'Document').slice(0,180),Number(max?.n||0)+1,b.required===false?0:1,c.get('user').id).run()
  await appendStaffEvent(c,envId,'packet.document_added',null,{document_id:id,title:b.title||'Document'})
  return c.json({id},201)
})
documentPlatformV2AdminRoutes.patch('/document-platform/envelopes/:envelopeId/documents/order',async c=>{
  const envId=c.req.param('envelopeId'),b=await c.req.json<any>().catch(()=>({})),ids=Array.isArray(b.ids)?b.ids.map(String):[]
  if(!ids.length)return c.json({error:'ids are required'},400)
  for(let i=0;i<ids.length;i+=1)await c.env.DB.prepare('UPDATE envelope_documents SET sort_order=?,updated_at=? WHERE id=? AND envelope_id=?').bind(1000+i,now(),ids[i],envId).run()
  for(let i=0;i<ids.length;i+=1)await c.env.DB.prepare('UPDATE envelope_documents SET sort_order=?,updated_at=? WHERE id=? AND envelope_id=?').bind(i+1,now(),ids[i],envId).run()
  await appendStaffEvent(c,envId,'packet.reordered',null,{document_ids:ids})
  return c.json({ok:true})
})
documentPlatformV2AdminRoutes.delete('/document-platform/envelopes/:envelopeId/documents/:documentId',async c=>{const envId=c.req.param('envelopeId'),e=await c.env.DB.prepare('SELECT status FROM envelopes WHERE id=?').bind(envId).first() as any;if(!e)return c.json({error:'not found'},404);if(e.status!=='draft')return c.json({error:'Documents can only be removed while the envelope is a draft.'},409);const count=await c.env.DB.prepare('SELECT COUNT(*) n FROM envelope_documents WHERE envelope_id=?').bind(envId).first() as any;if(Number(count?.n||0)<=1)return c.json({error:'An envelope must contain at least one document.'},409);await c.env.DB.prepare('DELETE FROM envelope_documents WHERE id=? AND envelope_id=?').bind(c.req.param('documentId'),envId).run();await appendStaffEvent(c,envId,'packet.document_removed',null,{document_id:c.req.param('documentId')});return c.json({ok:true})})

// Field rules
documentPlatformV2AdminRoutes.patch('/document-platform/envelopes/:envelopeId/fields/:fieldId/rules',async c=>{
  const envId=c.req.param('envelopeId'),b=await c.req.json<any>().catch(()=>({})),f=await c.env.DB.prepare('SELECT * FROM document_fields WHERE id=? AND envelope_id=?').bind(c.req.param('fieldId'),envId).first() as any
  if(!f)return c.json({error:'field not found'},404)
  const validation=b.validation&&typeof b.validation==='object'?b.validation:safeJson(f.validation_json,{}),condition=b.condition&&typeof b.condition==='object'?b.condition:safeJson(f.condition_json,{})
  await c.env.DB.prepare('UPDATE document_fields SET required=?,label=?,validation_json=?,condition_json=?,validation_error_message=?,envelope_document_id=COALESCE(?,envelope_document_id),updated_at=? WHERE id=?').bind(b.required===false?0:b.required===true?1:f.required,b.label!==undefined?String(b.label).slice(0,180):f.label,JSON.stringify(validation),Object.keys(condition).length?JSON.stringify(condition):null,b.error_message!==undefined?String(b.error_message).slice(0,300):f.validation_error_message,b.envelope_document_id!==undefined?(b.envelope_document_id||null):null,now(),f.id).run()
  await appendStaffEvent(c,envId,'field.rules_updated',f.recipient_id,{field_id:f.id,validation,condition})
  return c.json({ok:true})
})

// Controlled post-send recipient replacement and access revocation
documentPlatformV2AdminRoutes.post('/document-platform/envelopes/:envelopeId/recipients/:recipientId/replace',async c=>{
  const envId=c.req.param('envelopeId'),rid=c.req.param('recipientId'),b=await c.req.json<any>().catch(()=>({})),reason=String(b.reason||'').trim(),e=await c.env.DB.prepare('SELECT * FROM envelopes WHERE id=?').bind(envId).first() as any,r=await c.env.DB.prepare('SELECT * FROM envelope_recipients WHERE id=? AND envelope_id=?').bind(rid,envId).first() as any
  if(!e||!r)return c.json({error:'envelope or recipient not found'},404);if(!['sent','viewed','in_progress'].includes(e.status))return c.json({error:'Recipient replacement is only available after send and before completion.'},409);if(r.status==='completed')return c.json({error:'Completed recipients cannot be replaced.'},409);if(!b.name||!b.email||reason.length<5)return c.json({error:'replacement name, email, and reason are required'},400)
  const newId=uuid(),newEmail=String(b.email).toLowerCase().trim().slice(0,200),newName=String(b.name).trim().slice(0,160),shouldInvite=['invited','viewed','authenticated','in_progress'].includes(r.status)
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO envelope_recipients(id,envelope_id,role,routing_order,name,email,phone_e164,status,replacement_of_recipient_id,replacement_reason) VALUES (?,?,?,?,?,?,?,'pending',?,?)`).bind(newId,envId,r.role,r.routing_order,newName,newEmail,b.phone_e164||null,r.id,reason.slice(0,1000)),
    c.env.DB.prepare(`UPDATE document_fields SET recipient_id=?,updated_at=? WHERE recipient_id=? AND envelope_id=?`).bind(newId,now(),r.id,envId),
    c.env.DB.prepare(`UPDATE envelope_recipients SET status='expired',access_revoked_at=?,invitation_token_hash=NULL,invitation_expires_at=?,updated_at=? WHERE id=?`).bind(now(),now(),now(),r.id),
    c.env.DB.prepare(`INSERT INTO recipient_replacements(id,envelope_id,original_recipient_id,replacement_recipient_id,reason,replaced_by_user_id) VALUES (?,?,?,?,?,?)`).bind(uuid(),envId,r.id,newId,reason.slice(0,1000),c.get('user').id),
  ])
  if(shouldInvite){const replacement={id:newId,name:newName,email:newEmail};await issueRecipientInvitation(c.env,e,replacement,'replacement')}
  c.executionCtx.waitUntil(sendEmail(c.env,{to:r.email,subject:`Access updated: ${e.title}`,html:`<p>${escapeHtml(r.name)},</p><p>Your access to <strong>${escapeHtml(e.title)}</strong> has been revoked because the recipient assignment was securely replaced.</p><p>If you believe this was unexpected, contact Pinnacle Management Ventures.</p>`}).catch(()=>{}))
  await appendStaffEvent(c,envId,'recipient.replaced',newId,{original_recipient_id:r.id,replacement_recipient_id:newId,reason})
  return c.json({ok:true,replacement_recipient_id:newId,invited:shouldInvite})
})
documentPlatformV2AdminRoutes.post('/document-platform/envelopes/:envelopeId/recipients/:recipientId/revoke',async c=>{const envId=c.req.param('envelopeId'),rid=c.req.param('recipientId'),b=await c.req.json<any>().catch(()=>({})),reason=String(b.reason||'').trim();if(reason.length<5)return c.json({error:'revocation reason is required'},400);const r=await c.env.DB.prepare('SELECT * FROM envelope_recipients WHERE id=? AND envelope_id=?').bind(rid,envId).first() as any;if(!r)return c.json({error:'recipient not found'},404);await c.env.DB.prepare(`UPDATE envelope_recipients SET access_revoked_at=?,invitation_token_hash=NULL,invitation_expires_at=?,status=CASE WHEN status='completed' THEN status ELSE 'expired' END,updated_at=? WHERE id=?`).bind(now(),now(),now(),rid).run();await appendStaffEvent(c,envId,'recipient.access_revoked',rid,{reason});c.executionCtx.waitUntil(sendEmail(c.env,{to:r.email,subject:'Document access revoked',html:`<p>${escapeHtml(r.name)},</p><p>Your access to this Pinnacle document has been revoked.</p><p>Reason: ${escapeHtml(reason.slice(0,500))}</p>`}).catch(()=>{}));return c.json({ok:true})})
documentPlatformV2AdminRoutes.post('/document-platform/shares/:shareId/revoke',async c=>{const b=await c.req.json<any>().catch(()=>({})),reason=String(b.reason||'').trim();if(reason.length<3)return c.json({error:'revocation reason is required'},400);const s=await c.env.DB.prepare('SELECT * FROM internal_document_shares WHERE id=?').bind(c.req.param('shareId')).first() as any;if(!s)return c.json({error:'share not found'},404);await c.env.DB.prepare('UPDATE internal_document_shares SET revoked_at=?,revoked_reason=?,revoked_by_user_id=? WHERE id=?').bind(now(),reason.slice(0,1000),c.get('user').id,s.id).run();return c.json({ok:true})})

// Version comparison for internal documents
documentPlatformV2AdminRoutes.get('/document-platform/documents/:documentId/compare',async c=>{
  const id=c.req.param('documentId'),left=Number(c.req.query('left')||0),right=Number(c.req.query('right')||0),rows=await c.env.DB.prepare('SELECT version_number,text_content,file_id,change_note FROM internal_document_versions WHERE document_id=? AND version_number IN (?,?)').bind(id,left,right).all() as any
  if((rows.results||[]).length!==2)return c.json({error:'both document versions are required'},400)
  const a=rows.results.find((r:any)=>Number(r.version_number)===left),b=rows.results.find((r:any)=>Number(r.version_number)===right),summary=diffText(String(a.text_content||`file:${a.file_id||''}`),String(b.text_content||`file:${b.file_id||''}`))
  await c.env.DB.prepare(`INSERT INTO document_version_comparisons(id,subject_type,subject_id,left_version,right_version,summary_json,created_by_user_id) VALUES (?,'document',?,?,?,?,?)`).bind(uuid(),id,left,right,JSON.stringify(summary),c.get('user').id).run()
  return c.json({left,right,summary})
})

// Retention policies and legal holds
documentPlatformV2AdminRoutes.get('/document-platform/retention',async c=>{const [policies,holds,assignments]=await Promise.all([c.env.DB.prepare('SELECT * FROM document_retention_policies ORDER BY active DESC,name').all(),c.env.DB.prepare('SELECT * FROM retention_legal_holds ORDER BY created_at DESC LIMIT 200').all(),c.env.DB.prepare('SELECT * FROM retention_assignments ORDER BY created_at DESC LIMIT 200').all()]);return c.json({policies:policies.results||[],holds:holds.results||[],assignments:assignments.results||[]})})
documentPlatformV2AdminRoutes.post('/document-platform/retention/policies',requireOwner,async c=>{const b=await c.req.json<any>().catch(()=>({})),name=String(b.name||'').trim();if(!name)return c.json({error:'policy name is required'},400);const id=uuid();await c.env.DB.prepare(`INSERT INTO document_retention_policies(id,name,description,retention_days,legal_hold_default,active,created_by_user_id) VALUES (?,?,?,?,?,?,?)`).bind(id,name.slice(0,160),String(b.description||'').slice(0,1000)||null,b.retention_days?Math.max(1,Number(b.retention_days)):null,b.legal_hold_default?1:0,b.active===false?0:1,c.get('user').id).run();return c.json({id},201)})
documentPlatformV2AdminRoutes.post('/document-platform/retention/assign',requireOwner,async c=>{const b=await c.req.json<any>().catch(()=>({}));if(!b.policy_id||!['document','envelope','client'].includes(b.scope_type)||!b.scope_id)return c.json({error:'policy_id, scope_type, and scope_id are required'},400);const p=await c.env.DB.prepare('SELECT retention_days FROM document_retention_policies WHERE id=? AND active=1').bind(b.policy_id).first() as any;if(!p)return c.json({error:'active policy not found'},404);const disposition=p.retention_days?new Date(Date.now()+Number(p.retention_days)*86400000).toISOString():null;await c.env.DB.prepare(`INSERT OR REPLACE INTO retention_assignments(id,policy_id,scope_type,scope_id,effective_at,disposition_at,created_by_user_id) VALUES (?,?,?,?,?,?,?)`).bind(uuid(),b.policy_id,b.scope_type,String(b.scope_id),now(),disposition,c.get('user').id).run();return c.json({ok:true,disposition_at:disposition})})
documentPlatformV2AdminRoutes.post('/document-platform/retention/holds',requireOwner,async c=>{const b=await c.req.json<any>().catch(()=>({})),reason=String(b.reason||'').trim(),name=String(b.name||'').trim();if(!['document','envelope','client','global'].includes(b.scope_type)||!name||reason.length<5)return c.json({error:'scope, name, and reason are required'},400);const id=uuid();await c.env.DB.prepare(`INSERT INTO retention_legal_holds(id,scope_type,scope_id,name,reason,status,created_by_user_id) VALUES (?,?,?,?,?,'active',?)`).bind(id,b.scope_type,b.scope_id||null,name.slice(0,180),reason.slice(0,2000),c.get('user').id).run();return c.json({id},201)})
documentPlatformV2AdminRoutes.post('/document-platform/retention/holds/:holdId/release',requireOwner,async c=>{await c.env.DB.prepare(`UPDATE retention_legal_holds SET status='released',released_by_user_id=?,released_at=? WHERE id=? AND status='active'`).bind(c.get('user').id,now(),c.req.param('holdId')).run();return c.json({ok:true})})

// Bulk envelope operations
documentPlatformV2AdminRoutes.post('/document-platform/envelopes/bulk',async c=>{
  const b=await c.req.json<any>().catch(()=>({})),ids:string[]=Array.isArray(b.envelope_ids)?Array.from(new Set<string>(b.envelope_ids.map((v:any)=>String(v)))).slice(0,100):[],operation=String(b.operation||'')
  if(!ids.length||!['send','void','remind','archive','download','status'].includes(operation))return c.json({error:'valid operation and envelope_ids are required'},400)
  const jobId=uuid(),results:any[]=[];let success=0,failed=0
  await c.env.DB.prepare(`INSERT INTO envelope_bulk_jobs(id,operation,requested_count,status,requested_by_user_id,request_json) VALUES (?,?,?,'running',?,?)`).bind(jobId,operation,ids.length,c.get('user').id,JSON.stringify(b)).run()
  for(const id of ids){try{const e=await c.env.DB.prepare('SELECT * FROM envelopes WHERE id=?').bind(id).first() as any;if(!e)throw new Error('not found')
    if(operation==='void'){if(['completed','voided'].includes(e.status))throw new Error('cannot void');await c.env.DB.prepare(`UPDATE envelopes SET status='voided',voided_at=?,void_reason=?,updated_at=? WHERE id=?`).bind(now(),String(b.reason||'Bulk void').slice(0,1000),now(),id).run();await appendStaffEvent(c,id,'envelope.bulk_voided',null,{job_id:jobId})}
    else if(operation==='remind'){if(!['sent','viewed','in_progress'].includes(e.status))throw new Error('not active');const rs=await c.env.DB.prepare(`SELECT * FROM envelope_recipients WHERE envelope_id=? AND access_revoked_at IS NULL AND status NOT IN ('completed','declined','expired') AND role IN ('signer','approver','witness','notary') ORDER BY routing_order`).bind(id).all() as any;for(const r of rs.results||[])await issueRecipientInvitation(c.env,e,r,'reminder');await appendStaffEvent(c,id,'envelope.bulk_reminded',null,{job_id:jobId,count:(rs.results||[]).length})}
    else if(operation==='send'){if(e.status!=='draft')throw new Error('not draft');const rs=await c.env.DB.prepare(`SELECT * FROM envelope_recipients WHERE envelope_id=? AND role IN ('signer','approver','witness','notary') ORDER BY routing_order`).bind(id).all() as any;if(!(rs.results||[]).length)throw new Error('no recipients');await c.env.DB.prepare(`UPDATE envelopes SET status='sent',sent_at=?,updated_at=? WHERE id=?`).bind(now(),now(),id).run();const min=e.signing_order_mode==='sequential'?Math.min(...rs.results.map((r:any)=>Number(r.routing_order||1))):null;for(const r of rs.results)if(min===null||Number(r.routing_order||1)===min)await issueRecipientInvitation(c.env,e,r,'send');await appendStaffEvent(c,id,'envelope.bulk_sent',null,{job_id:jobId})}
    else if(operation==='archive'){const tags=safeJson<string[]>(e.tags_json,[]);if(!tags.includes('archived'))tags.push('archived');await c.env.DB.prepare('UPDATE envelopes SET tags_json=?,updated_at=? WHERE id=?').bind(JSON.stringify(tags),now(),id).run()}
    else if(operation==='status'){const requested=String(b.status||'');if(requested==='voided'){if(['completed','voided'].includes(e.status))throw new Error('invalid transition');await c.env.DB.prepare(`UPDATE envelopes SET status='voided',voided_at=?,void_reason=?,updated_at=? WHERE id=?`).bind(now(),String(b.reason||'Bulk status update').slice(0,1000),now(),id).run()}else throw new Error('unsupported status transition')}
    else if(operation==='download'){results.push({id,links:{signed:`/api/admin/envelopes/${id}/artifacts/signed`,audit:`/api/admin/envelopes/${id}/artifacts/audit`,manifest:`/api/admin/envelopes/${id}/artifacts/manifest`}})}
    success+=1;if(operation!=='download')results.push({id,ok:true})
  }catch(err){failed+=1;results.push({id,ok:false,error:err instanceof Error?err.message:'failed'})}}
  const status=failed&&success?'partial':failed?'failed':'success';await c.env.DB.prepare(`UPDATE envelope_bulk_jobs SET succeeded_count=?,failed_count=?,status=?,result_json=?,finished_at=? WHERE id=?`).bind(success,failed,status,JSON.stringify(results),now(),jobId).run();return c.json({job_id:jobId,status,succeeded:success,failed,results})
})

// Automation Center rules and manual run
documentPlatformV2AdminRoutes.get('/document-platform/automation',async c=>{const [rules,runs]=await Promise.all([c.env.DB.prepare('SELECT * FROM envelope_automation_rules ORDER BY rule_type,name').all(),c.env.DB.prepare("SELECT * FROM automation_runs WHERE automation_key='document_envelopes' ORDER BY started_at DESC LIMIT 50").all()]);return c.json({rules:rules.results||[],runs:runs.results||[]})})
documentPlatformV2AdminRoutes.patch('/document-platform/automation/rules/:ruleId',requireOwner,async c=>{const b=await c.req.json<any>().catch(()=>({}));await c.env.DB.prepare('UPDATE envelope_automation_rules SET name=COALESCE(?,name),enabled=COALESCE(?,enabled),config_json=COALESCE(?,config_json),updated_by_user_id=?,updated_at=? WHERE id=?').bind(b.name!==undefined?String(b.name).slice(0,180):null,b.enabled!==undefined?(b.enabled?1:0):null,b.config!==undefined?JSON.stringify(b.config):null,c.get('user').id,now(),c.req.param('ruleId')).run();return c.json({ok:true})})
documentPlatformV2AdminRoutes.post('/document-platform/automation/run',requireOwner,async c=>{const result=await runDocumentAutomation(c.env,100,c.get('user').id,'manual');return c.json({ok:true,...result})})

// Public signer overrides: revoked access, packet context, conditions and validation.
documentPlatformV2PublicRoutes.get('/sign/:token',async c=>{
  const h=await sha256Hex(c.req.param('token')),r=await c.env.DB.prepare(`SELECT r.*,e.title,e.message,e.public_id,e.status envelope_status,e.expires_at,e.branding_profile_id FROM envelope_recipients r JOIN envelopes e ON e.id=r.envelope_id WHERE r.invitation_token_hash=?`).bind(h).first() as any
  if(!r)return c.json({error:'invalid or revoked link'},404);if(r.access_revoked_at)return c.json({error:'access revoked'},410);if(r.invitation_expires_at&&r.invitation_expires_at<now())return c.json({error:'link expired'},410);if(r.expires_at&&r.expires_at<now())return c.json({error:'envelope expired'},410);if(['voided','expired','declined'].includes(r.envelope_status))return c.json({error:`envelope ${r.envelope_status}`},410)
  if(r.status==='invited'){await c.env.DB.prepare(`UPDATE envelope_recipients SET status='viewed',first_viewed_at=?,updated_at=? WHERE id=?`).bind(now(),now(),r.id).run();await c.env.DB.prepare(`UPDATE envelopes SET status=CASE WHEN status='sent' THEN 'viewed' ELSE status END,updated_at=? WHERE id=?`).bind(now(),r.envelope_id).run();await appendSystemEvent(c.env,r.envelope_id,'recipient.viewed',{recipient_id:r.id})}
  const [fields,docs]=await Promise.all([c.env.DB.prepare(`SELECT id,envelope_document_id,page_number,field_type,x,y,width,height,required,label,value_text,completed_at,validation_json,condition_json,validation_error_message FROM document_fields WHERE recipient_id=? ORDER BY page_number,created_at`).bind(r.id).all(),c.env.DB.prepare(`SELECT d.id,d.title,d.sort_order,d.required,f.original_name,f.mime_type FROM envelope_documents d JOIN document_files f ON f.id=d.document_file_id WHERE d.envelope_id=? ORDER BY d.sort_order`).bind(r.envelope_id).all()])
  return c.json({recipient:{id:r.id,name:r.name,email:r.email,status:r.status},envelope:{id:r.envelope_id,title:r.title,message:r.message,public_id:r.public_id,status:r.envelope_status,expires_at:r.expires_at,branding_profile_id:r.branding_profile_id},documents:docs.results||[],fields:fields.results||[]})
})
documentPlatformV2PublicRoutes.post('/sign/:token/fields/:fieldId',async c=>{
  const ses=await signerSession(c);if(!ses)return c.json({error:'authentication required'},401)
  const r=await c.env.DB.prepare('SELECT access_revoked_at,status FROM envelope_recipients WHERE id=?').bind(ses.recipient_id).first() as any;if(!r||r.access_revoked_at||r.status==='expired')return c.json({error:'access revoked'},410)
  const b=await c.req.json<any>().catch(()=>null),f=await c.env.DB.prepare('SELECT * FROM document_fields WHERE id=? AND recipient_id=?').bind(c.req.param('fieldId'),ses.recipient_id).first() as any;if(!f)return c.json({error:'field not found'},404)
  const condition=safeJson<any>(f.condition_json,{});if(condition.field_id){const dep=await c.env.DB.prepare('SELECT value_text FROM document_fields WHERE id=? AND recipient_id=?').bind(String(condition.field_id),ses.recipient_id).first() as any;const actual=String(dep?.value_text||'');const expected=String(condition.equals??'');if(condition.equals!==undefined&&actual!==expected)return c.json({error:'This field is not currently active.'},409)}
  const value=f.field_type==='checkbox'?(b?.checked?'true':'false'):String(b?.value??'').slice(0,2000),validationError=validateField(f,value);if(validationError)return c.json({error:validationError,field_id:f.id},422)
  await c.env.DB.batch([c.env.DB.prepare(`UPDATE document_fields SET value_text=?,completed_at=?,updated_at=? WHERE id=?`).bind(value,now(),now(),f.id),c.env.DB.prepare(`UPDATE envelope_recipients SET status='in_progress',updated_at=? WHERE id=?`).bind(now(),ses.recipient_id),c.env.DB.prepare(`UPDATE envelopes SET status='in_progress',updated_at=? WHERE id=?`).bind(now(),ses.envelope_id)])
  await appendSystemEvent(c.env,ses.envelope_id,'field.completed',{recipient_id:ses.recipient_id,field_id:f.id,field_type:f.field_type,validated:true})
  return c.json({ok:true})
})

// Scheduled document automation route
documentPlatformV2AutomationRoutes.post('/automation/document-envelopes/run',requireAutomation,async c=>{const result=await runDocumentAutomation(c.env,150,undefined,'scheduled');return c.json({ok:true,...result})})

export async function runDocumentAutomation(env:any,limit=100,actorUserId?:string,triggerType:'scheduled'|'manual'='scheduled'){
  const runId=uuid();await env.DB.prepare(`INSERT INTO automation_runs(id,automation_key,trigger_type,status,triggered_by_user_id) VALUES (?,'document_envelopes',?,'running',?)`).bind(runId,triggerType,actorUserId||null).run()
  let processed=0,sent=0,expired=0,retained=0,failed=0
  try{
    const rules=await env.DB.prepare('SELECT rule_type,enabled,config_json FROM envelope_automation_rules').all() as any,enabled=new Set((rules.results||[]).filter((r:any)=>Number(r.enabled)===1).map((r:any)=>r.rule_type))
    if(enabled.has('expiration')){const due=await env.DB.prepare(`SELECT id FROM envelopes WHERE status IN ('sent','viewed','in_progress') AND expires_at IS NOT NULL AND expires_at<=? LIMIT ?`).bind(now(),limit).all() as any;for(const e of due.results||[]){try{await env.DB.batch([env.DB.prepare(`UPDATE envelopes SET status='expired',updated_at=? WHERE id=?`).bind(now(),e.id),env.DB.prepare(`UPDATE envelope_recipients SET status=CASE WHEN status='completed' THEN status ELSE 'expired' END,access_revoked_at=CASE WHEN status='completed' THEN access_revoked_at ELSE ? END,invitation_token_hash=NULL,updated_at=? WHERE envelope_id=?`).bind(now(),now(),e.id)]);await appendSystemEvent(env,e.id,'envelope.expired',{automation_run_id:runId});expired+=1;processed+=1}catch{failed+=1}}}
    if(enabled.has('reminder')){const active=await env.DB.prepare(`SELECT * FROM envelopes WHERE status IN ('sent','viewed','in_progress') AND reminder_frequency!='none' AND (expires_at IS NULL OR expires_at>?) ORDER BY COALESCE(last_reminder_at,sent_at) ASC LIMIT ?`).bind(now(),limit).all() as any;for(const e of active.results||[]){try{const base=new Date(e.last_reminder_at||e.sent_at||e.updated_at).getTime(),days=e.reminder_frequency==='daily'?1:e.reminder_frequency==='every_3_days'?3:7;if(Date.now()-base<days*86400000)continue;const rs=await env.DB.prepare(`SELECT * FROM envelope_recipients WHERE envelope_id=? AND access_revoked_at IS NULL AND status NOT IN ('completed','declined','expired') AND role IN ('signer','approver','witness','notary') ORDER BY routing_order`).bind(e.id).all() as any;let targets=rs.results||[];if(e.signing_order_mode==='sequential'&&targets.length){const min=Math.min(...targets.map((r:any)=>Number(r.routing_order||1)));targets=targets.filter((r:any)=>Number(r.routing_order||1)===min)}for(const r of targets)await issueRecipientInvitation(env,e,r,'reminder');await env.DB.prepare('UPDATE envelopes SET last_reminder_at=?,next_reminder_at=?,updated_at=? WHERE id=?').bind(now(),new Date(Date.now()+days*86400000).toISOString(),now(),e.id).run();await appendSystemEvent(env,e.id,'envelope.automatic_reminder_sent',{automation_run_id:runId,recipient_count:targets.length});sent+=targets.length;processed+=1}catch{failed+=1}}}
    if(enabled.has('retention')){const due=await env.DB.prepare(`SELECT * FROM retention_assignments WHERE disposition_at IS NOT NULL AND disposition_at<=? AND disposed_at IS NULL LIMIT ?`).bind(now(),limit).all() as any;for(const a of due.results||[]){try{const globalHold=await env.DB.prepare(`SELECT 1 FROM retention_legal_holds WHERE status='active' AND (scope_type='global' OR (scope_type=? AND scope_id=?)) LIMIT 1`).bind(a.scope_type,a.scope_id).first();if(globalHold)continue;if(a.scope_type==='document')await env.DB.prepare(`UPDATE internal_documents SET status='archived',archived_at=COALESCE(archived_at,?),updated_at=? WHERE id=?`).bind(now(),now(),a.scope_id).run();else if(a.scope_type==='envelope'){const e=await env.DB.prepare('SELECT tags_json FROM envelopes WHERE id=?').bind(a.scope_id).first() as any;if(e){const tags=safeJson<string[]>(e.tags_json,[]);if(!tags.includes('retention-archived'))tags.push('retention-archived');await env.DB.prepare('UPDATE envelopes SET tags_json=?,updated_at=? WHERE id=?').bind(JSON.stringify(tags),now(),a.scope_id).run();await appendSystemEvent(env,a.scope_id,'retention.disposition_applied',{automation_run_id:runId})}}await env.DB.prepare('UPDATE retention_assignments SET disposed_at=? WHERE id=?').bind(now(),a.id).run();retained+=1;processed+=1}catch{failed+=1}}}
    const status=failed&&processed?'partial':failed?'failed':'success';await env.DB.prepare(`UPDATE automation_runs SET status=?,items_processed=?,items_succeeded=?,items_failed=?,detail_json=?,finished_at=? WHERE id=?`).bind(status,processed,Math.max(0,processed-failed),failed,JSON.stringify({sent,expired,retained}),now(),runId).run();return {run_id:runId,status,processed,sent,expired,retained,failed}
  }catch(err){await env.DB.prepare(`UPDATE automation_runs SET status='failed',items_processed=?,items_failed=?,detail_json=?,finished_at=? WHERE id=?`).bind(processed,failed+1,JSON.stringify({error:err instanceof Error?err.message:'automation failed'}),now(),runId).run();throw err}
}
