import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { uuid } from '../crypto'
import { requireUser } from '../mid'
import { escapeHtml, notifyStaff } from '../email'

export const documentLifecycleAdminRoutes = new Hono<AppEnv>()
export const documentLifecyclePublicRoutes = new Hono<AppEnv>()

const enc = new TextEncoder()
async function sha256Hex(input: string | ArrayBuffer | Uint8Array) {
  const bytes = typeof input === 'string' ? enc.encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')
}
function now(){ return new Date().toISOString() }
function code6(){ return String(Math.floor(100000+Math.random()*900000)) }
function token(){ const a=crypto.getRandomValues(new Uint8Array(24)); return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'') }

function requestEvidence(c:any){
  const cf = c.req.raw.cf as any
  const ua = c.req.header('user-agent') || null
  return {
    ip: c.req.header('CF-Connecting-IP') || null,
    city: cf?.city || null,
    region: cf?.region || null,
    country: cf?.country || null,
    lat: cf?.latitude ? Number(cf.latitude) : null,
    lon: cf?.longitude ? Number(cf.longitude) : null,
    ua,
  }
}
async function appendEvent(c:any, envId:string, type:string, actorType:string, actorId:string|null, recipientId:string|null, metadata:any={}){
  const prev = await c.env.DB.prepare('SELECT event_hash FROM envelope_events WHERE envelope_id=? ORDER BY occurred_at_utc DESC, id DESC LIMIT 1').bind(envId).first<any>()
  const e=requestEvidence(c); const occurred=now(); const id=uuid(); const requestId=uuid(); const prevHash=prev?.event_hash||'GENESIS'
  const canonical=JSON.stringify({id,envId,recipientId,actorType,actorId,type,occurred,requestId,metadata,prevHash,ip:e.ip,city:e.city,region:e.region,country:e.country,lat:e.lat,lon:e.lon,ua:e.ua})
  const hash=await sha256Hex(canonical)
  await c.env.DB.prepare(`INSERT INTO envelope_events (id,envelope_id,recipient_id,actor_type,actor_id,event_type,occurred_at_utc,ip_address,geo_city,geo_region,geo_country,geo_lat_approx,geo_lon_approx,user_agent,request_id,metadata_json,prev_event_hash,event_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,envId,recipientId,actorType,actorId,type,occurred,e.ip,e.city,e.region,e.country,e.lat,e.lon,e.ua,requestId,JSON.stringify(metadata),prevHash,hash).run()
  return hash
}

async function requireAdmin(c:any,next:any){ return requireUser(c, async()=>{ const u=c.get('user'); if(u.role!=='admin'&&u.role!=='staff') return c.json({error:'forbidden'},403); return next() }) }

documentLifecycleAdminRoutes.use('/documents/*', requireAdmin)
documentLifecycleAdminRoutes.use('/envelopes/*', requireAdmin)

documentLifecycleAdminRoutes.get('/envelopes', async c=>{
  const rows=await c.env.DB.prepare(`SELECT e.*, (SELECT COUNT(*) FROM envelope_recipients r WHERE r.envelope_id=e.id) signer_count, (SELECT COUNT(*) FROM envelope_recipients r WHERE r.envelope_id=e.id AND r.status='completed') completed_signer_count FROM envelopes e ORDER BY e.created_at DESC LIMIT 200`).all()
  return c.json({envelopes:rows.results})
})

documentLifecycleAdminRoutes.post('/documents/upload', async c=>{
  if(!c.env.UPLOADS) return c.json({error:'Document storage is not configured.'},503)
  const form=await c.req.formData(); const file=form.get('file') as File | null
  if(!file) return c.json({error:'file is required'},400)
  const bytes=await file.arrayBuffer(); const hash=await sha256Hex(bytes); const id=uuid(); const key=`documents/source/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`
  await c.env.UPLOADS.put(key,bytes,{httpMetadata:{contentType:file.type||'application/octet-stream'}})
  await c.env.DB.prepare(`INSERT INTO document_files (id,kind,original_name,mime_type,storage_key,size_bytes,sha256,created_by_user_id) VALUES (?,?,?,?,?,?,?,?)`).bind(id,'source',file.name,file.type||'application/octet-stream',key,file.size,hash,c.get('user').id).run()
  return c.json({file:{id,name:file.name,mime_type:file.type,size_bytes:file.size,sha256:hash}},201)
})

documentLifecycleAdminRoutes.post('/envelopes', async c=>{
  const b=await c.req.json<any>().catch(()=>null); if(!b?.title||!b?.source_file_id) return c.json({error:'title and source_file_id are required'},400)
  const id=uuid(); const publicId=`PMV-${new Date().getUTCFullYear()}-${uuid().split('-')[0].toUpperCase()}`
  await c.env.DB.prepare(`INSERT INTO envelopes (id,public_id,title,message,client_id,source_file_id,canonical_file_id,status,signing_order_mode,expires_at,created_by_user_id) VALUES (?,?,?,?,?,?,?,'draft',?,?,?)`).bind(id,publicId,String(b.title).slice(0,200),b.message||null,b.client_id||null,b.source_file_id,b.source_file_id,b.signing_order_mode==='sequential'?'sequential':'parallel',b.expires_at||null,c.get('user').id).run()
  await appendEvent(c,id,'envelope.created','staff',c.get('user').id,null,{title:b.title})
  return c.json({id,public_id:publicId},201)
})

documentLifecycleAdminRoutes.get('/envelopes/:id', async c=>{
  const id=c.req.param('id'); const envelope=await c.env.DB.prepare('SELECT * FROM envelopes WHERE id=?').bind(id).first(); if(!envelope) return c.json({error:'not found'},404)
  const [recipients,fields,events]=await Promise.all([
    c.env.DB.prepare('SELECT * FROM envelope_recipients WHERE envelope_id=? ORDER BY routing_order,created_at').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM document_fields WHERE envelope_id=? ORDER BY page_number,created_at').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM envelope_events WHERE envelope_id=? ORDER BY occurred_at_utc,id').bind(id).all(),
  ])
  return c.json({envelope,recipients:recipients.results,fields:fields.results,events:events.results})
})

documentLifecycleAdminRoutes.post('/envelopes/:id/recipients', async c=>{
  const envId=c.req.param('id'); const b=await c.req.json<any>().catch(()=>null); if(!b?.name||!b?.email) return c.json({error:'name and email required'},400)
  const id=uuid(); await c.env.DB.prepare(`INSERT INTO envelope_recipients (id,envelope_id,role,routing_order,name,email,phone_e164,status) VALUES (?,?,?,?,?,?,?,'pending')`).bind(id,envId,b.role||'signer',Number(b.routing_order||1),String(b.name).slice(0,160),String(b.email).toLowerCase().slice(0,200),b.phone_e164||null).run()
  await appendEvent(c,envId,'recipient.added','staff',c.get('user').id,id,{email:b.email,role:b.role||'signer'})
  return c.json({id},201)
})

documentLifecycleAdminRoutes.post('/envelopes/:id/fields', async c=>{
  const envId=c.req.param('id'); const b=await c.req.json<any>().catch(()=>null); const allowed=['signature','initial','date','text','checkbox']
  if(!b?.recipient_id||!allowed.includes(b.field_type)) return c.json({error:'invalid field'},400)
  for(const k of ['x','y','width','height']) if(typeof b[k]!=='number'||b[k]<0||b[k]>1) return c.json({error:`invalid ${k}`},400)
  const id=uuid(); await c.env.DB.prepare(`INSERT INTO document_fields (id,envelope_id,recipient_id,page_number,field_type,x,y,width,height,required,label,validation_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,envId,b.recipient_id,Number(b.page_number||1),b.field_type,b.x,b.y,b.width,b.height,b.required===false?0:1,b.label||null,b.validation?JSON.stringify(b.validation):null).run()
  await appendEvent(c,envId,'field.placed','staff',c.get('user').id,b.recipient_id,{field_type:b.field_type,page_number:b.page_number||1,x:b.x,y:b.y})
  return c.json({id},201)
})

documentLifecycleAdminRoutes.post('/envelopes/:id/send', async c=>{
  const envId=c.req.param('id'); const env=await c.env.DB.prepare('SELECT * FROM envelopes WHERE id=?').bind(envId).first<any>(); if(!env) return c.json({error:'not found'},404)
  const rs=await c.env.DB.prepare(`SELECT * FROM envelope_recipients WHERE envelope_id=? AND role IN ('signer','approver','witness','notary') ORDER BY routing_order`).bind(envId).all<any>(); if(!rs.results.length) return c.json({error:'add at least one signer'},400)
  await c.env.DB.prepare(`UPDATE envelopes SET status='sent',sent_at=?,updated_at=? WHERE id=?`).bind(now(),now(),envId).run()
  for(const r of rs.results){ const raw=token(); const hash=await sha256Hex(raw); const exp=new Date(Date.now()+7*86400000).toISOString(); await c.env.DB.prepare(`UPDATE envelope_recipients SET status='invited',invitation_token_hash=?,invitation_expires_at=?,updated_at=? WHERE id=?`).bind(hash,exp,now(),r.id).run();
    c.executionCtx.waitUntil(notifyStaff(c.env,{staffUserIds:[],kind:'document_signature_invite',subject:`Signature requested: ${env.title}`,html:`<p>${escapeHtml(r.name)},</p><p>Pinnacle Management Ventures has sent you a document for review and signature.</p><p><a href="https://pinnaclemanagementventures.com/sign/${encodeURIComponent(raw)}">Review and sign document</a></p><p>This secure link expires in 7 days.</p>`}).catch(()=>{})) }
  await appendEvent(c,envId,'envelope.sent','staff',c.get('user').id,null,{recipient_count:rs.results.length})
  return c.json({ok:true})
})

documentLifecyclePublicRoutes.get('/sign/:token', async c=>{
  const raw=c.req.param('token'); const h=await sha256Hex(raw); const r=await c.env.DB.prepare(`SELECT r.*,e.title,e.message,e.public_id,e.status envelope_status,e.expires_at FROM envelope_recipients r JOIN envelopes e ON e.id=r.envelope_id WHERE r.invitation_token_hash=?`).bind(h).first<any>();
  if(!r) return c.json({error:'invalid link'},404); if(r.invitation_expires_at&&r.invitation_expires_at<now()) return c.json({error:'link expired'},410)
  if(r.status==='invited'){ await c.env.DB.prepare(`UPDATE envelope_recipients SET status='viewed',first_viewed_at=?,updated_at=? WHERE id=?`).bind(now(),now(),r.id).run(); await c.env.DB.prepare(`UPDATE envelopes SET status=CASE WHEN status='sent' THEN 'viewed' ELSE status END,updated_at=? WHERE id=?`).bind(now(),r.envelope_id).run(); await appendEvent(c,r.envelope_id,'recipient.viewed','signer',r.id,r.id,{}) }
  const fields=await c.env.DB.prepare('SELECT id,page_number,field_type,x,y,width,height,required,label,value_text,completed_at FROM document_fields WHERE recipient_id=? ORDER BY page_number,created_at').bind(r.id).all()
  return c.json({recipient:{id:r.id,name:r.name,email:r.email,status:r.status},envelope:{id:r.envelope_id,title:r.title,message:r.message,public_id:r.public_id,status:r.envelope_status,expires_at:r.expires_at},fields:fields.results})
})

documentLifecyclePublicRoutes.post('/sign/:token/otp', async c=>{
  const h=await sha256Hex(c.req.param('token')); const r=await c.env.DB.prepare('SELECT * FROM envelope_recipients WHERE invitation_token_hash=?').bind(h).first<any>(); if(!r) return c.json({error:'invalid link'},404)
  const code=code6(); const codeHash=await sha256Hex(`${code}:${c.env.SESSION_SECRET}`); const id=uuid(); const exp=new Date(Date.now()+10*60000).toISOString(); await c.env.DB.prepare(`INSERT INTO otp_challenges (id,recipient_id,channel,destination_masked,code_hash,expires_at) VALUES (?,?,'email',?,?,?)`).bind(id,r.id,r.email.replace(/^(.{2}).*(@.*)$/,'$1***$2'),codeHash,exp).run()
  c.executionCtx.waitUntil(notifyStaff(c.env,{staffUserIds:[],kind:'document_otp',subject:'Your Pinnacle verification code',html:`<p>Your verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`}).catch(()=>{}))
  await appendEvent(c,r.envelope_id,'authentication.otp_sent','signer',r.id,r.id,{channel:'email'})
  return c.json({challenge_id:id,expires_at:exp})
})

documentLifecyclePublicRoutes.post('/sign/:token/otp/verify', async c=>{
  const raw=c.req.param('token'); const h=await sha256Hex(raw); const b=await c.req.json<any>().catch(()=>null); const r=await c.env.DB.prepare('SELECT * FROM envelope_recipients WHERE invitation_token_hash=?').bind(h).first<any>(); if(!r||!b?.challenge_id||!b?.code) return c.json({error:'invalid request'},400)
  const ch=await c.env.DB.prepare('SELECT * FROM otp_challenges WHERE id=? AND recipient_id=?').bind(b.challenge_id,r.id).first<any>(); if(!ch||ch.consumed_at||ch.expires_at<now()) return c.json({error:'code expired'},410)
  const actual=await sha256Hex(`${String(b.code)}:${c.env.SESSION_SECRET}`); if(actual!==ch.code_hash){ await c.env.DB.prepare('UPDATE otp_challenges SET attempt_count=attempt_count+1 WHERE id=?').bind(ch.id).run(); return c.json({error:'incorrect code'},401) }
  await c.env.DB.batch([c.env.DB.prepare('UPDATE otp_challenges SET consumed_at=? WHERE id=?').bind(now(),ch.id),c.env.DB.prepare(`UPDATE envelope_recipients SET status='authenticated',updated_at=? WHERE id=?`).bind(now(),r.id)])
  await appendEvent(c,r.envelope_id,'authentication.passed','signer',r.id,r.id,{method:'email_otp'})
  const session=token(); await c.env.SESSIONS.put(`sign:${session}`,JSON.stringify({recipient_id:r.id,envelope_id:r.envelope_id}),{expirationTtl:3600})
  return c.json({session_token:session})
})

async function signerSession(c:any){ const s=c.req.header('x-signing-session')||''; const v=await c.env.SESSIONS.get(`sign:${s}`); return v?JSON.parse(v):null }

documentLifecyclePublicRoutes.post('/sign/:token/fields/:fieldId', async c=>{
  const ses=await signerSession(c); if(!ses) return c.json({error:'authentication required'},401); const b=await c.req.json<any>().catch(()=>null); const f=await c.env.DB.prepare('SELECT * FROM document_fields WHERE id=? AND recipient_id=?').bind(c.req.param('fieldId'),ses.recipient_id).first<any>(); if(!f) return c.json({error:'field not found'},404)
  const value=f.field_type==='checkbox'?(b?.checked?'true':'false'):String(b?.value??'').slice(0,2000); await c.env.DB.prepare(`UPDATE document_fields SET value_text=?,completed_at=?,updated_at=? WHERE id=?`).bind(value,now(),now(),f.id).run(); await c.env.DB.prepare(`UPDATE envelope_recipients SET status='in_progress',updated_at=? WHERE id=?`).bind(now(),ses.recipient_id).run(); await c.env.DB.prepare(`UPDATE envelopes SET status='in_progress',updated_at=? WHERE id=?`).bind(now(),ses.envelope_id).run(); await appendEvent(c,ses.envelope_id,'field.completed','signer',ses.recipient_id,ses.recipient_id,{field_id:f.id,field_type:f.field_type})
  return c.json({ok:true})
})

documentLifecyclePublicRoutes.post('/sign/:token/complete', async c=>{
  const ses=await signerSession(c); if(!ses) return c.json({error:'authentication required'},401)
  const missing=await c.env.DB.prepare(`SELECT COUNT(*) n FROM document_fields WHERE recipient_id=? AND required=1 AND completed_at IS NULL`).bind(ses.recipient_id).first<any>(); if(Number(missing?.n||0)>0) return c.json({error:'required fields remain'},400)
  await c.env.DB.prepare(`UPDATE envelope_recipients SET status='completed',completed_at=?,updated_at=? WHERE id=?`).bind(now(),now(),ses.recipient_id).run(); await appendEvent(c,ses.envelope_id,'recipient.completed','signer',ses.recipient_id,ses.recipient_id,{})
  const remaining=await c.env.DB.prepare(`SELECT COUNT(*) n FROM envelope_recipients WHERE envelope_id=? AND role IN ('signer','approver','witness','notary') AND status!='completed'`).bind(ses.envelope_id).first<any>()
  if(Number(remaining?.n||0)===0){ const head=await appendEvent(c,ses.envelope_id,'envelope.completed','system',null,null,{}); const e=await c.env.DB.prepare('SELECT * FROM envelopes WHERE id=?').bind(ses.envelope_id).first<any>(); const sf=await c.env.DB.prepare('SELECT sha256 FROM document_files WHERE id=?').bind(e.source_file_id).first<any>(); const signers=await c.env.DB.prepare(`SELECT COUNT(*) n FROM envelope_recipients WHERE envelope_id=? AND role='signer'`).bind(e.id).first<any>(); await c.env.DB.prepare(`UPDATE envelopes SET status='completed',completed_at=?,updated_at=? WHERE id=?`).bind(now(),now(),e.id).run(); await c.env.DB.prepare(`INSERT OR REPLACE INTO verification_records (id,envelope_id,public_id,verification_status,document_label,issuer_name,completed_date,signer_count,final_pdf_sha256_prefix,sealed_at,updated_at) VALUES (?,?,?,?,?,'Pinnacle Management Ventures',?,?,?,?,?)`).bind(uuid(),e.id,e.public_id,'valid',e.title,now(),Number(signers?.n||0),String(sf?.sha256||head).slice(0,16),now(),now()).run() }
  return c.json({ok:true})
})

documentLifecyclePublicRoutes.post('/sign/:token/decline', async c=>{
  const h=await sha256Hex(c.req.param('token')); const r=await c.env.DB.prepare('SELECT * FROM envelope_recipients WHERE invitation_token_hash=?').bind(h).first<any>(); if(!r) return c.json({error:'invalid link'},404); const b=await c.req.json<any>().catch(()=>({})); await c.env.DB.batch([c.env.DB.prepare(`UPDATE envelope_recipients SET status='declined',declined_at=?,updated_at=? WHERE id=?`).bind(now(),now(),r.id),c.env.DB.prepare(`UPDATE envelopes SET status='declined',declined_at=?,updated_at=? WHERE id=?`).bind(now(),now(),r.envelope_id)]); await appendEvent(c,r.envelope_id,'recipient.declined','signer',r.id,r.id,{reason:String(b.reason||'').slice(0,500)}); return c.json({ok:true})
})
