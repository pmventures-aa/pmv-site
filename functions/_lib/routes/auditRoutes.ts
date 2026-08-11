import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { requireCapability } from '../capabilities'
import { csvResponse } from '../csv'
import { uuid } from '../crypto'
import { logAudit, actorGeo, actorIp, actorUserAgent } from '../auditLog'

export const auditRoutes = new Hono<AppEnv>()
interface Filter { where:string;params:unknown[] }
function buildFilter(c:{req:{query(key:string):string|undefined}}):Filter{
  const clauses=['1=1'];const params:unknown[]=[];const fields:[string,string][]=[['actor','al.actor_user_id'],['action','al.action'],['entity_type','al.entity_type']]
  for(const[key,column]of fields){const v=c.req.query(key);if(v){clauses.push(`${column} = ?`);params.push(v)}}
  const from=c.req.query('from');const to=c.req.query('to');const before=c.req.query('before')
  if(from){clauses.push('al.created_at >= ?');params.push(from)}if(to){clauses.push('al.created_at <= ?');params.push(to)}if(before){clauses.push('al.created_at < ?');params.push(before)}
  return{where:clauses.join(' AND '),params}
}

auditRoutes.get('/audit-log',requireStaff,requireCapability('can_view_audit_log'),async(c)=>{
  const{where,params}=buildFilter(c);const limit=Math.min(Math.max(parseInt(c.req.query('limit')??'50',10)||50,1),200)
  const res=await c.env.DB.prepare(`SELECT al.*,u.full_name actor_name,u.email actor_email FROM audit_log al LEFT JOIN users u ON u.id=al.actor_user_id WHERE ${where} ORDER BY al.created_at DESC LIMIT ?`).bind(...params,limit).all()
  return c.json({entries:res.results??[]})
})
auditRoutes.get('/audit-log/actions',requireStaff,requireCapability('can_view_audit_log'),async(c)=>{const res=await c.env.DB.prepare('SELECT DISTINCT action FROM audit_log ORDER BY action').all<{action:string}>();return c.json({actions:(res.results??[]).map(r=>r.action)})})

auditRoutes.get('/audit-log/export-events',requireStaff,requireCapability('can_view_audit_log'),async(c)=>{
  const rows=await c.env.DB.prepare(`SELECT e.*,u.full_name actor_name,u.email actor_email FROM data_export_events e LEFT JOIN users u ON u.id=e.actor_user_id ORDER BY e.created_at DESC LIMIT 200`).all()
  return c.json({exports:rows.results||[]})
})

auditRoutes.get('/audit-log/export.csv',requireStaff,requireCapability('can_view_audit_log'),async(c)=>{
  const user=c.get('user');const{where,params}=buildFilter(c)
  const res=await c.env.DB.prepare(`SELECT al.created_at,u.full_name actor_name,u.email actor_email,al.action,al.entity_type,al.entity_id,al.actor_ip,al.actor_user_agent,al.actor_city,al.actor_region,al.actor_country FROM audit_log al LEFT JOIN users u ON u.id=al.actor_user_id WHERE ${where} ORDER BY al.created_at DESC LIMIT 5000`).bind(...params).all<any>()
  const rows=(res.results??[]).map(r=>[r.created_at,r.actor_name??r.actor_email??'System',r.actor_email??'',r.action,r.entity_type??'',r.entity_id??'',r.actor_ip??'',[r.actor_city,r.actor_region,r.actor_country].filter(Boolean).join(', '),r.actor_user_agent??''])
  const filters={actor:c.req.query('actor')||null,action:c.req.query('action')||null,entity_type:c.req.query('entity_type')||null,from:c.req.query('from')||null,to:c.req.query('to')||null}
  await Promise.all([
    c.env.DB.prepare('INSERT INTO data_export_events(id,actor_user_id,export_type,entity_type,filters_json,row_count) VALUES (?,?,?,?,?,?)').bind(uuid(),user.id,'csv','audit_log',JSON.stringify(filters),rows.length).run(),
    logAudit(c.env,{actorUserId:user.id,actorIp:actorIp(c.req.raw),actorUserAgent:actorUserAgent(c.req.raw),actorGeo:actorGeo(c.req.raw),action:'data_exported',entityType:'audit_log',after:{format:'csv',rows:rows.length,filters}}),
  ])
  return csvResponse('audit-log.csv',['Timestamp (UTC)','Actor','Actor Email','Action','Entity Type','Entity ID','IP','Location','User Agent'],rows)
})
