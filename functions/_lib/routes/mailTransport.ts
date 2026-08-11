import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { flushSelfHostedMailOutbox } from '../email'
import { requireStaff } from '../mid'

export const mailTransportRoutes = new Hono<AppEnv>()
export const mailTransportAdminRoutes = new Hono<AppEnv>()

function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0}
mailTransportRoutes.post('/automation/mail-outbox/run',async c=>{
  const expected=String(c.env.AUTOMATION_CRON_SECRET1||'').trim(),actual=String(c.req.header('x-pmv-automation-secret')||'').trim()
  if(!expected||!actual||!safeEqual(expected,actual))return c.json({error:'forbidden'},403)
  return c.json(await flushSelfHostedMailOutbox(c.env,100))
})
mailTransportAdminRoutes.get('/mail/outbox',requireStaff,async c=>{
  const rows=await c.env.DB.prepare("SELECT id,recipient_address,subject,status,attempt_count,next_attempt_at,last_error,relay_message_id,created_at,sent_at FROM self_hosted_mail_outbox ORDER BY created_at DESC LIMIT 200").all()
  const counts=await c.env.DB.prepare("SELECT status,COUNT(*) n FROM self_hosted_mail_outbox GROUP BY status").all()
  return c.json({messages:rows.results,counts:counts.results,relay_configured:!!c.env.SELF_HOSTED_MAIL_RELAY_URL})
})
mailTransportAdminRoutes.post('/mail/outbox/flush',requireStaff,async c=>c.json(await flushSelfHostedMailOutbox(c.env,100)))
