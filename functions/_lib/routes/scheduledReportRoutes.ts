import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { requireCapability } from '../capabilities'
import { nextScheduledReportRun, runScheduledReportTemplate } from '../scheduledReports'
import { logAudit, actorGeo, actorIp, actorUserAgent } from '../auditLog'

export const scheduledReportRoutes = new Hono<AppEnv>()

scheduledReportRoutes.patch('/report-templates/:id/schedule', requireStaff, requireCapability('can_view_reports'), async(c)=>{
  const user=c.get('user');const id=c.req.param('id')
  const template=await c.env.DB.prepare('SELECT * FROM report_templates WHERE id=? AND created_by=?').bind(id,user.id).first<any>()
  if(!template)return c.json({error:'saved report not found'},404)
  const body=await c.req.json<{schedule_kind?:string|null;schedule_time?:string|null;schedule_day?:number|null;recipients?:string[];enabled?:boolean}>().catch(()=>({}))
  const kind=['daily','weekly','monthly'].includes(String(body.schedule_kind))?String(body.schedule_kind):null
  const time=typeof body.schedule_time==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(body.schedule_time)?body.schedule_time:'08:00'
  const day=kind==='weekly'?Math.min(Math.max(Number(body.schedule_day)||1,0),6):kind==='monthly'?Math.min(Math.max(Number(body.schedule_day)||1,1),28):null
  const recipients=[...new Set((body.recipients||[]).map(v=>String(v).trim().toLowerCase()).filter(v=>v.includes('@')))].slice(0,25)
  const enabled=body.enabled!==false&&!!kind
  const next=enabled?nextScheduledReportRun(kind,time,day):null
  await c.env.DB.prepare('UPDATE report_templates SET schedule_kind=?,schedule_time=?,schedule_day=?,recipients_json=?,enabled=?,next_run_at=? WHERE id=?').bind(kind,time,day,JSON.stringify(recipients),enabled?1:0,next,id).run()
  await logAudit(c.env,{actorUserId:user.id,actorIp:actorIp(c.req.raw),actorUserAgent:actorUserAgent(c.req.raw),actorGeo:actorGeo(c.req.raw),action:'report_schedule_changed',entityType:'report_template',entityId:id,after:{kind,time,day,recipients,enabled,next_run_at:next}})
  return c.json({ok:true,next_run_at:next})
})

scheduledReportRoutes.post('/report-templates/:id/deliver-now', requireStaff, requireCapability('can_view_reports'), async(c)=>{
  const user=c.get('user');const template=await c.env.DB.prepare('SELECT * FROM report_templates WHERE id=? AND created_by=?').bind(c.req.param('id'),user.id).first<any>()
  if(!template)return c.json({error:'saved report not found'},404)
  const result=await runScheduledReportTemplate(c.env,template,'manual')
  await logAudit(c.env,{actorUserId:user.id,actorIp:actorIp(c.req.raw),actorUserAgent:actorUserAgent(c.req.raw),actorGeo:actorGeo(c.req.raw),action:'scheduled_report_delivered',entityType:'report_template',entityId:template.id,after:result})
  return c.json({ok:true,...result})
})
