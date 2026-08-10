import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireOwner, requireUser } from '../mid'
import { runDueClientNurture } from '../relationshipAutomation'
import { runClientNotificationOutbox } from '../clientNotificationOutbox'

export const relationshipAutomationRoutes = new Hono<AppEnv>()
export const relationshipAutomationAdminRoutes = new Hono<AppEnv>()

function timingSafeEqualText(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function requireAutomationCron(c: any, next: any) {
  const expected = String(c.env.AUTOMATION_CRON_SECRET || '').trim()
  if (!expected) return c.json({ error: 'automation secret not configured' }, 503)
  const provided = String(c.req.header('x-pmv-automation-secret') || '').trim()
  if (!provided || !timingSafeEqualText(provided, expected)) return c.json({ error: 'forbidden' }, 403)
  await next()
}

relationshipAutomationRoutes.get('/portal/notification-preferences', requireUser, async (c) => {
  const user = c.get('user')
  if (user.role !== 'client') return c.json({ error:'client account required' },403)
  const rows = await c.env.DB.prepare(
    `SELECT nec.event_key,nec.label,nec.category,nec.description,
            COALESCE(nup.in_app_enabled,nec.default_in_app) in_app_enabled,
            COALESCE(nup.email_enabled,nec.default_email) email_enabled
     FROM notification_event_catalog nec
     LEFT JOIN notification_user_preferences nup ON nup.event_key=nec.event_key AND nup.user_id=?
     WHERE nec.active=1 AND nec.client_configurable=1 AND nec.audience IN ('client','both')
     ORDER BY nec.category,nec.sort_order,nec.label`,
  ).bind(user.id).all()
  const nurture = await c.env.DB.prepare('SELECT status,enrolled_at,next_step,last_sent_at FROM client_nurture_enrollments WHERE user_id=?').bind(user.id).first()
  return c.json({ events:rows.results||[], nurture:nurture||null })
})

relationshipAutomationRoutes.patch('/portal/notification-preferences', requireUser, async (c) => {
  const user = c.get('user')
  if (user.role !== 'client') return c.json({ error:'client account required' },403)
  type Body={ preferences?:Array<{event_key?:string;in_app_enabled?:boolean;email_enabled?:boolean}>; nurture_status?:string }
  const body=await c.req.json<Body>().catch(()=>({} as Body))
  const statements=[]
  for(const pref of body.preferences||[]){
    const key=String(pref.event_key||'').slice(0,100)
    const allowed=await c.env.DB.prepare("SELECT 1 FROM notification_event_catalog WHERE event_key=? AND client_configurable=1 AND audience IN ('client','both')").bind(key).first()
    if(!allowed) continue
    statements.push(c.env.DB.prepare(
      `INSERT INTO notification_user_preferences(user_id,event_key,in_app_enabled,email_enabled,updated_at)
       VALUES(?,?,?,?,datetime('now')) ON CONFLICT(user_id,event_key) DO UPDATE SET
       in_app_enabled=excluded.in_app_enabled,email_enabled=excluded.email_enabled,updated_at=datetime('now')`,
    ).bind(user.id,key,pref.in_app_enabled===false?0:1,pref.email_enabled===true?1:0))
  }
  if(body.nurture_status==='paused'||body.nurture_status==='unsubscribed'||body.nurture_status==='active'){
    statements.push(c.env.DB.prepare("UPDATE client_nurture_enrollments SET status=?,updated_at=datetime('now') WHERE user_id=?").bind(body.nurture_status,user.id))
  }
  if(statements.length) await c.env.DB.batch(statements)
  return c.json({ok:true})
})

relationshipAutomationAdminRoutes.get('/notification-center', requireOwner, async (c) => {
  const user=c.get('user')
  const events=await c.env.DB.prepare(
    `SELECT nec.*,
            COALESCE(nup.in_app_enabled,nec.default_in_app) in_app_enabled,
            COALESCE(nup.email_enabled,nec.default_email) email_enabled,
            nto.subject,nto.preheader,nto.eyebrow,nto.title,nto.body_html,nto.cta_label,COALESCE(nto.enabled,1) template_enabled
     FROM notification_event_catalog nec
     LEFT JOIN notification_user_preferences nup ON nup.event_key=nec.event_key AND nup.user_id=?
     LEFT JOIN notification_template_overrides nto ON nto.event_key=nec.event_key
     WHERE nec.active=1 ORDER BY nec.category,nec.sort_order,nec.label`,
  ).bind(user.id).all()
  return c.json({events:events.results||[]})
})

relationshipAutomationAdminRoutes.patch('/notification-center/preferences', requireOwner, async (c) => {
  const user=c.get('user')
  type Body={preferences?:Array<{event_key?:string;in_app_enabled?:boolean;email_enabled?:boolean}>}
  const body=await c.req.json<Body>().catch(()=>({} as Body))
  const statements=(body.preferences||[]).map((pref)=>c.env.DB.prepare(
    `INSERT INTO notification_user_preferences(user_id,event_key,in_app_enabled,email_enabled,updated_at)
     SELECT ?,event_key,?,?,datetime('now') FROM notification_event_catalog WHERE event_key=?
     ON CONFLICT(user_id,event_key) DO UPDATE SET in_app_enabled=excluded.in_app_enabled,email_enabled=excluded.email_enabled,updated_at=datetime('now')`,
  ).bind(user.id,pref.in_app_enabled===false?0:1,pref.email_enabled===true?1:0,String(pref.event_key||'').slice(0,100)))
  if(statements.length) await c.env.DB.batch(statements)
  return c.json({ok:true})
})

relationshipAutomationAdminRoutes.patch('/notification-center/templates/:eventKey', requireOwner, async (c) => {
  const user=c.get('user');const eventKey=c.req.param('eventKey')
  const exists=await c.env.DB.prepare('SELECT 1 FROM notification_event_catalog WHERE event_key=?').bind(eventKey).first()
  if(!exists)return c.json({error:'event not found'},404)
  type Body={subject?:string;preheader?:string;eyebrow?:string;title?:string;body_html?:string;cta_label?:string;enabled?:boolean}
  const b=await c.req.json<Body>().catch(()=>({} as Body))
  const clean=(v:unknown,n:number)=>typeof v==='string'?v.trim().slice(0,n):''
  await c.env.DB.prepare(
    `INSERT INTO notification_template_overrides(event_key,subject,preheader,eyebrow,title,body_html,cta_label,enabled,updated_by_user_id,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(event_key) DO UPDATE SET
     subject=excluded.subject,preheader=excluded.preheader,eyebrow=excluded.eyebrow,title=excluded.title,body_html=excluded.body_html,
     cta_label=excluded.cta_label,enabled=excluded.enabled,updated_by_user_id=excluded.updated_by_user_id,updated_at=datetime('now')`,
  ).bind(eventKey,clean(b.subject,200)||null,clean(b.preheader,240)||null,clean(b.eyebrow,80)||null,clean(b.title,180)||null,clean(b.body_html,8000)||null,clean(b.cta_label,80)||null,b.enabled===false?0:1,user.id).run()
  return c.json({ok:true})
})

relationshipAutomationAdminRoutes.get('/nurture-campaign', requireOwner, async (c) => {
  const summary=await c.env.DB.prepare(`SELECT status,COUNT(*) count FROM client_nurture_enrollments GROUP BY status`).all()
  const deliveries=await c.env.DB.prepare(
    `SELECT d.*,u.email,u.full_name FROM client_nurture_deliveries d JOIN users u ON u.id=d.user_id ORDER BY d.sent_at DESC LIMIT 100`,
  ).all()
  const outbox=await c.env.DB.prepare(
    `SELECT status,COUNT(*) count FROM client_notification_outbox GROUP BY status`,
  ).all()
  return c.json({summary:summary.results||[],deliveries:deliveries.results||[],notification_outbox:outbox.results||[]})
})

// Scheduled handlers are idempotent and protected by a dedicated cron secret.
relationshipAutomationRoutes.post('/automation/nurture/run', requireAutomationCron, async (c) => {
  const result=await runDueClientNurture(c.env,50)
  return c.json({ok:true,...result})
})
relationshipAutomationRoutes.post('/automation/client-notifications/run', requireAutomationCron, async (c) => {
  const result=await runClientNotificationOutbox(c.env,75)
  return c.json({ok:true,...result})
})
