import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff, requireOwner } from '../mid'
import { uuid, verifyPassword } from '../crypto'
import { canAccessClient, scopeFilter } from '../scope'
import { auditInsert, logAudit, actorGeo, actorIp, actorUserAgent } from '../auditLog'

export const deletionRoutes = new Hono<AppEnv>()

const ARCHIVABLE: Record<string, string> = {
  inquiries: 'contact_inquiries', matters: 'matters', tasks: 'client_tasks', invoices: 'invoices',
  documents: 'client_documents', tickets: 'support_tickets', notes: 'internal_notes',
}
const DELETABLE: Record<string, string> = { ...ARCHIVABLE, users: 'users' }
const UNSCOPED = new Set(['inquiries', 'users'])

async function loadRow(env: AppEnv['Bindings'], table: string, id: string): Promise<Record<string, any> | null> {
  return env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<Record<string, any>>()
}
function labelFor(entity:string,row:Record<string,any>){
  if(entity==='users'||entity==='inquiries')return row.full_name||row.name||row.email||row.id
  if(entity==='invoices')return `Invoice ${(Number(row.amount_cents||0)/100).toLocaleString(undefined,{style:'currency',currency:'USD'})}`
  return row.title||row.subject||row.file_name||row.category||String(row.body||'').slice(0,80)||row.id
}
async function safeCount(env:AppEnv['Bindings'],sql:string,...params:string[]){try{return (await env.DB.prepare(sql).bind(...params).first<{n:number}>())?.n||0}catch{return 0}}
async function dependencySummary(env:AppEnv['Bindings'],entity:string,id:string){
  const deps:Record<string,number>={}
  if(entity==='inquiries'){
    deps.notes=await safeCount(env,'SELECT COUNT(*) n FROM internal_notes WHERE inquiry_id=?',id)
    deps.emails=await safeCount(env,'SELECT COUNT(*) n FROM email_log WHERE inquiry_id=?',id)
    deps.activity=await safeCount(env,'SELECT COUNT(*) n FROM activity_events WHERE inquiry_id=?',id)
    deps.crm_lists=await safeCount(env,'SELECT COUNT(*) n FROM crm_list_members WHERE inquiry_id=?',id)
  }else if(entity==='users'){
    deps.client_profile=await safeCount(env,'SELECT COUNT(*) n FROM client_profiles WHERE user_id=?',id)
    deps.staff_assignments=await safeCount(env,'SELECT COUNT(*) n FROM staff_assignments WHERE client_user_id=? OR staff_user_id=?',id,id)
    deps.matters=await safeCount(env,'SELECT COUNT(*) n FROM matters WHERE client_user_id=?',id)
    deps.tasks=await safeCount(env,'SELECT COUNT(*) n FROM client_tasks WHERE client_user_id=?',id)
    deps.invoices=await safeCount(env,'SELECT COUNT(*) n FROM invoices WHERE client_user_id=?',id)
    deps.documents=await safeCount(env,'SELECT COUNT(*) n FROM client_documents WHERE client_user_id=?',id)
    deps.tickets=await safeCount(env,'SELECT COUNT(*) n FROM support_tickets WHERE client_user_id=?',id)
    deps.messages=await safeCount(env,'SELECT COUNT(*) n FROM secure_messages WHERE client_user_id=? OR sender_user_id=?',id,id)
  }else if(entity==='matters'){
    deps.tasks=await safeCount(env,'SELECT COUNT(*) n FROM client_tasks WHERE matter_id=?',id)
  }else if(entity==='documents'){
    deps.document_events=await safeCount(env,'SELECT COUNT(*) n FROM document_events WHERE document_id=?',id)
  }
  return deps
}

deletionRoutes.patch('/records/:entity/:id/archive', requireStaff, async (c) => {
  const entity = c.req.param('entity')??''; const table = ARCHIVABLE[entity]
  if (!table) return c.json({ error: 'unknown or non-archivable entity' }, 404)
  const user = c.get('user'); const id = c.req.param('id')??''
  if(!id)return c.json({error:'not found'},404)
  const row = await loadRow(c.env, table, id)
  if (!row) return c.json({ error: 'not found' }, 404)
  if (!UNSCOPED.has(entity) && row.client_user_id && !(await canAccessClient(c.env,user,row.client_user_id))) return c.json({error:'forbidden'},403)
  if (row.archived_at) return c.json({ error: 'already archived' }, 409)
  const body = await c.req.json<{ reason?: string }>().catch(() => ({} as {reason?:string}))
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) || null : null
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE ${table} SET archived_at = datetime('now'), archived_by = ?, archived_reason = ? WHERE id = ?`).bind(user.id, reason, id),
    auditInsert(c.env, { actorUserId:user.id,actorIp:actorIp(c.req.raw),actorUserAgent:actorUserAgent(c.req.raw),actorGeo:actorGeo(c.req.raw),action:'record_archived',entityType:entity,entityId:id,before:row }),
  ])
  return c.json({ ok: true })
})

deletionRoutes.patch('/records/:entity/:id/restore', requireStaff, async (c) => {
  const entity=c.req.param('entity')??'';const table=ARCHIVABLE[entity]
  if(!table)return c.json({error:'unknown or non-archivable entity'},404)
  const user=c.get('user');const id=c.req.param('id')??''
  if(!id)return c.json({error:'not found'},404)
  const row=await loadRow(c.env,table,id)
  if(!row)return c.json({error:'not found'},404)
  if(!UNSCOPED.has(entity)&&row.client_user_id&&!(await canAccessClient(c.env,user,row.client_user_id)))return c.json({error:'forbidden'},403)
  if(!row.archived_at)return c.json({error:'not archived'},409)
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE ${table} SET archived_at=NULL,archived_by=NULL,archived_reason=NULL WHERE id=?`).bind(id),
    auditInsert(c.env,{actorUserId:user.id,actorIp:actorIp(c.req.raw),actorUserAgent:actorUserAgent(c.req.raw),actorGeo:actorGeo(c.req.raw),action:'record_restored',entityType:entity,entityId:id,before:row}),
  ])
  return c.json({ok:true})
})

deletionRoutes.get('/records/users/archived', requireOwner, async(c)=>{
  const res=await c.env.DB.prepare("SELECT id,email,full_name,role,status,last_login_at,created_at FROM users WHERE status!='active' ORDER BY created_at DESC LIMIT 200").all()
  return c.json({entity:'users',records:res.results||[]})
})

deletionRoutes.get('/records/:entity/archived', requireStaff, async (c) => {
  const entity=c.req.param('entity')??'';const table=ARCHIVABLE[entity]
  if(!table)return c.json({error:'unknown or non-archivable entity'},404)
  const user=c.get('user');let where='archived_at IS NOT NULL';let params:unknown[]=[]
  if(!UNSCOPED.has(entity)){const sf=await scopeFilter(c.env,user);where+=` AND (client_user_id IS NULL OR ${sf.where})`;params=sf.params}
  const res=await c.env.DB.prepare(`SELECT * FROM ${table} WHERE ${where} ORDER BY archived_at DESC LIMIT 200`).bind(...params).all()
  return c.json({entity,records:res.results??[]})
})

deletionRoutes.get('/records/:entity/:id/deletion-impact', requireOwner, async(c)=>{
  const entity=c.req.param('entity')??'';const table=DELETABLE[entity]
  if(!table)return c.json({error:'unknown entity'},404)
  const id=c.req.param('id')??''
  if(!id)return c.json({error:'not found'},404)
  const row=await loadRow(c.env,table,id)
  if(!row)return c.json({error:'not found'},404)
  const dependencies=await dependencySummary(c.env,entity,id)
  const total=Object.values(dependencies).reduce((a,b)=>a+b,0)
  const eligible=entity==='users'?row.status!=='active':!!row.archived_at
  return c.json({impact:{entity,id,label:labelFor(entity,row),eligible,required_state:entity==='users'?'suspended or inactive':'archived',dependencies,total_dependencies:total,confirmation:`DELETE ${entity}:${id}`}})
})

deletionRoutes.delete('/records/:entity/:id/permanent', requireOwner, async (c) => {
  const entity=c.req.param('entity')??'';const table=DELETABLE[entity]
  if(!table)return c.json({error:'unknown entity'},404)
  const user=c.get('user');const id=c.req.param('id')??''
  if(!id)return c.json({error:'not found'},404)
  if(entity==='users'&&id===user.id)return c.json({error:"you can't permanently delete your own account"},400)
  const body=await c.req.json<{password?:string;reason?:string;confirmation?:string}>().catch(()=>({} as {password?:string;reason?:string;confirmation?:string}))
  const reason=typeof body.reason==='string'?body.reason.trim():''
  if(reason.length<8)return c.json({error:'a specific reason (at least 8 characters) is required'},400)
  if(!body.password)return c.json({error:'password is required'},400)
  const expected=`DELETE ${entity}:${id}`
  if(body.confirmation!==expected)return c.json({error:`type ${expected} exactly to confirm`},400)
  const actor=await c.env.DB.prepare('SELECT password_hash FROM users WHERE id=?').bind(user.id).first<{password_hash:string|null}>()
  if(!actor?.password_hash||!(await verifyPassword(body.password,actor.password_hash,c.env.SESSION_SECRET)))return c.json({error:'incorrect password'},401)
  const row=await loadRow(c.env,table,id)
  if(!row)return c.json({error:'not found'},404)
  if(entity==='users'&&row.status==='active')return c.json({error:'suspend or deactivate this account before permanent deletion'},409)
  if(entity!=='users'&&!row.archived_at)return c.json({error:'archive this record before permanent deletion'},409)
  const dependencies=await dependencySummary(c.env,entity,id)
  const ip=actorIp(c.req.raw);const permId=uuid();const label=labelFor(entity,row)
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO permanent_deletions (id,entity_type,entity_id,snapshot_json,deleted_by,reason,actor_ip,record_label,dependency_summary_json) VALUES (?,?,?,?,?,?,?,?,?)').bind(permId,entity,id,JSON.stringify(row),user.id,reason.slice(0,500),ip,label,JSON.stringify(dependencies)),
    auditInsert(c.env,{actorUserId:user.id,actorIp:ip,actorUserAgent:actorUserAgent(c.req.raw),actorGeo:actorGeo(c.req.raw),action:'record_permanently_deleted',entityType:entity,entityId:id,before:row,after:{reason,dependencies,record_label:label}}),
    c.env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id),
  ])
  return c.json({ok:true,deletion_id:permId})
})

deletionRoutes.get('/permanent-deletions', requireOwner, async(c)=>{
  const res=await c.env.DB.prepare(`SELECT pd.*,u.full_name AS deleted_by_name,u.email AS deleted_by_email FROM permanent_deletions pd JOIN users u ON u.id=pd.deleted_by ORDER BY pd.deleted_at DESC LIMIT 500`).all()
  return c.json({deletions:res.results??[]})
})

deletionRoutes.get('/permanent-deletions/export.csv', requireOwner, async(c)=>{
  const user=c.get('user')
  const rows=await c.env.DB.prepare(`SELECT pd.entity_type,pd.entity_id,pd.record_label,pd.reason,pd.dependency_summary_json,pd.actor_ip,pd.deleted_at,u.full_name deleted_by_name,u.email deleted_by_email FROM permanent_deletions pd JOIN users u ON u.id=pd.deleted_by ORDER BY pd.deleted_at DESC LIMIT 5000`).all<any>()
  const esc=(v:unknown)=>{const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
  const headers=['Entity','Entity ID','Record','Reason','Dependencies','IP','Deleted by','Deleted by email','Deleted at']
  const csv=[headers.join(','),...(rows.results||[]).map(r=>[r.entity_type,r.entity_id,r.record_label,r.reason,r.dependency_summary_json,r.actor_ip,r.deleted_by_name,r.deleted_by_email,r.deleted_at].map(esc).join(','))].join('\r\n')
  await logAudit(c.env,{actorUserId:user.id,actorIp:actorIp(c.req.raw),actorUserAgent:actorUserAgent(c.req.raw),actorGeo:actorGeo(c.req.raw),action:'data_exported',entityType:'permanent_deletions',after:{rows:(rows.results||[]).length}})
  return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="pmv-permanent-deletions.csv"'}})
})
