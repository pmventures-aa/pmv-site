import type { Env } from './types'
import { uuid } from './crypto'
import { sendEmailStrict } from './email'
import { CLIENT_NURTURE_STEPS, renderNurtureEmail } from './emailTemplates/relationship'

export const CLIENT_PORTAL_BASE = 'https://client.pinnaclemanagementventures.com'

export async function enrollClientNurture(env: Env, userId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO client_nurture_enrollments(user_id,campaign_key,status,enrolled_at,next_step)
     VALUES(?,'client_discovery_14d','active',datetime('now'),1)
     ON CONFLICT(user_id) DO NOTHING`,
  ).bind(userId).run()
}

export async function stopClientNurture(env: Env, userId: string, status: 'paused'|'unsubscribed' = 'unsubscribed'): Promise<void> {
  await env.DB.prepare(
    `UPDATE client_nurture_enrollments SET status=?,updated_at=datetime('now') WHERE user_id=?`,
  ).bind(status, userId).run()
}

export async function notificationPreference(
  env: Env,
  userId: string,
  eventKey: string,
): Promise<{ inApp: boolean; email: boolean }> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(nup.in_app_enabled,nec.default_in_app) in_app_enabled,
            COALESCE(nup.email_enabled,nec.default_email) email_enabled
     FROM notification_event_catalog nec
     LEFT JOIN notification_user_preferences nup ON nup.event_key=nec.event_key AND nup.user_id=?
     WHERE nec.event_key=? AND nec.active=1`,
  ).bind(userId, eventKey).first<{ in_app_enabled:number; email_enabled:number }>()
  return { inApp: row ? row.in_app_enabled === 1 : true, email: row ? row.email_enabled === 1 : false }
}

export async function runDueClientNurture(env: Env, limit = 40): Promise<{ processed:number; sent:number; skipped:number }> {
  const rows = await env.DB.prepare(
    `SELECT e.user_id,e.enrolled_at,e.next_step,u.email,u.first_name,u.full_name,u.status,
            COALESCE(cp.marketing_email_status,'subscribed') marketing_email_status
     FROM client_nurture_enrollments e
     JOIN users u ON u.id=e.user_id
     LEFT JOIN client_profiles cp ON cp.user_id=e.user_id
     WHERE e.status='active' AND u.role='client' AND u.status='active'
     ORDER BY e.enrolled_at ASC LIMIT ?`,
  ).bind(limit).all<any>()

  let sent = 0
  let skipped = 0
  for (const row of rows.results || []) {
    const index = Math.max(0, Number(row.next_step || 1) - 1)
    const step = CLIENT_NURTURE_STEPS[index]
    if (!step) {
      await env.DB.prepare("UPDATE client_nurture_enrollments SET status='completed',completed_at=datetime('now'),updated_at=datetime('now') WHERE user_id=?").bind(row.user_id).run()
      continue
    }
    const dueAt = new Date(row.enrolled_at).getTime() + step.day * 86400000
    if (Date.now() < dueAt) continue
    if (String(row.marketing_email_status || '').toLowerCase() === 'unsubscribed') {
      await stopClientNurture(env, row.user_id)
      skipped++
      continue
    }
    const existing = await env.DB.prepare(
      'SELECT 1 FROM client_nurture_deliveries WHERE user_id=? AND campaign_key=? AND step_key=?',
    ).bind(row.user_id, 'client_discovery_14d', step.key).first()
    if (existing) {
      await env.DB.prepare('UPDATE client_nurture_enrollments SET next_step=next_step+1,updated_at=datetime(\'now\') WHERE user_id=?').bind(row.user_id).run()
      skipped++
      continue
    }
    try {
      const email = renderNurtureEmail({ firstName: row.first_name || row.full_name, step, portalBase: CLIENT_PORTAL_BASE })
      const providerId = await sendEmailStrict(env, {
        to: row.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        replyTo: 'orders@pinnaclemanagementventures.com',
        idempotencyKey: `nurture-${row.user_id}-${step.key}`,
        tags: [{ name:'category',value:'client_nurture' },{ name:'step',value:step.key }],
      })
      await env.DB.batch([
        env.DB.prepare(
          `INSERT OR IGNORE INTO client_nurture_deliveries(id,user_id,campaign_key,step_key,provider_message_id,status)
           VALUES(?,?, 'client_discovery_14d', ?, ?, 'sent')`,
        ).bind(uuid(), row.user_id, step.key, providerId),
        env.DB.prepare(
          `UPDATE client_nurture_enrollments SET next_step=next_step+1,last_sent_at=datetime('now'),
             status=CASE WHEN next_step>=? THEN 'completed' ELSE status END,
             completed_at=CASE WHEN next_step>=? THEN datetime('now') ELSE completed_at END,
             updated_at=datetime('now') WHERE user_id=?`,
        ).bind(CLIENT_NURTURE_STEPS.length, CLIENT_NURTURE_STEPS.length, row.user_id),
      ])
      sent++
    } catch (err) {
      console.error('[nurture] send failed', row.user_id, step.key, err)
    }
  }
  return { processed:(rows.results || []).length, sent, skipped }
}
