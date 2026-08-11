import type { Env } from './types'
import { renderPinnacleEmailLayout } from './emailTemplates/layout'
import { renderBrandedEmail } from './communicationBranding'
import { uuid } from './crypto'

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export interface EmailTag { name: string; value: string }
export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
  idempotencyKey?: string
  tags?: EmailTag[]
  alreadyBranded?: boolean
}

function assertFirstPartyRelay(url: string) {
  const parsed = new URL(url)
  const host = parsed.hostname.toLowerCase()
  if (host !== 'mail.pinnaclemanagementventures.com' && !host.endsWith('.pinnaclemanagementventures.com')) {
    throw new Error('Self-hosted mail relay must use a Pinnacle-controlled hostname')
  }
}

async function queueMail(env: Env, opts: SendEmailOptions, html: string): Promise<string> {
  const id = uuid()
  const from = env.SELF_HOSTED_MAIL_FROM || 'Pinnacle Management Ventures <mail@pinnaclemanagementventures.com>'
  if (opts.idempotencyKey) {
    const existing = await env.DB.prepare('SELECT id FROM self_hosted_mail_outbox WHERE idempotency_key=?').bind(opts.idempotencyKey.slice(0,256)).first<{id:string}>().catch(()=>null)
    if (existing?.id) return existing.id
  }
  await env.DB.prepare(`INSERT INTO self_hosted_mail_outbox(id,recipient_address,subject,html_body,text_body,reply_to,from_address,tags_json,idempotency_key,status) VALUES(?,?,?,?,?,?,?,?,?,'queued')`).bind(
    id, opts.to.trim().toLowerCase(), opts.subject.slice(0,300), html, opts.text || null, opts.replyTo || null, from, JSON.stringify(opts.tags || []), opts.idempotencyKey?.slice(0,256) || null,
  ).run()
  return id
}

async function attemptFirstPartyRelay(env: Env, outboxId: string): Promise<string> {
  if (!env.SELF_HOSTED_MAIL_RELAY_URL) return outboxId
  assertFirstPartyRelay(env.SELF_HOSTED_MAIL_RELAY_URL)
  const row = await env.DB.prepare('SELECT * FROM self_hosted_mail_outbox WHERE id=?').bind(outboxId).first<any>()
  if (!row) throw new Error('Queued email not found')
  await env.DB.prepare("UPDATE self_hosted_mail_outbox SET status='sending',attempt_count=attempt_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(outboxId).run()
  try {
    const res = await fetch(env.SELF_HOSTED_MAIL_RELAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type':'application/json',
        ...(env.SELF_HOSTED_MAIL_RELAY_SECRET ? {'X-Pinnacle-Mail-Relay-Secret':env.SELF_HOSTED_MAIL_RELAY_SECRET} : {}),
      },
      body: JSON.stringify({
        id: row.id,
        from: row.from_address,
        to: row.recipient_address,
        subject: row.subject,
        html: row.html_body,
        text: row.text_body,
        reply_to: row.reply_to,
        tags: JSON.parse(row.tags_json || '[]'),
      }),
    })
    const payload = await res.json<any>().catch(()=>({}))
    if (!res.ok) throw new Error(payload?.error || `mail relay returned ${res.status}`)
    const relayId = String(payload?.message_id || payload?.id || outboxId)
    await env.DB.prepare("UPDATE self_hosted_mail_outbox SET status='sent',relay_message_id=?,sent_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(relayId,outboxId).run()
    return relayId
  } catch (err) {
    await env.DB.prepare("UPDATE self_hosted_mail_outbox SET status='queued',last_error=?,next_attempt_at=datetime('now','+10 minutes'),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(String(err).slice(0,1000),outboxId).run().catch(()=>undefined)
    throw err
  }
}

export async function sendEmailStrict(env: Env, opts: SendEmailOptions): Promise<string> {
  const html = opts.alreadyBranded || /class=["']pmv-shell["']/.test(opts.html)
    ? opts.html
    : await renderBrandedEmail(env,{subject:opts.subject,bodyHtml:opts.html})
  const outboxId = await queueMail(env, opts, html)
  if (!env.SELF_HOSTED_MAIL_RELAY_URL) return outboxId
  return attemptFirstPartyRelay(env, outboxId)
}

export async function sendEmail(env: Env, opts: SendEmailOptions): Promise<void> {
  try { await sendEmailStrict(env, opts) } catch (err) { console.error('[email] first-party delivery queued after relay failure', err) }
}

export async function flushSelfHostedMailOutbox(env:Env,limit=50):Promise<{processed:number;sent:number;failed:number}>{
  if(!env.SELF_HOSTED_MAIL_RELAY_URL)return {processed:0,sent:0,failed:0}
  const rows=await env.DB.prepare("SELECT id FROM self_hosted_mail_outbox WHERE status IN ('queued','failed') AND next_attempt_at<=CURRENT_TIMESTAMP ORDER BY created_at LIMIT ?").bind(Math.max(1,Math.min(200,limit))).all<{id:string}>()
  let sent=0,failed=0
  for(const row of rows.results||[]){try{await attemptFirstPartyRelay(env,row.id);sent++}catch{failed++}}
  return {processed:(rows.results||[]).length,sent,failed}
}

export type NotificationFallbackMode = 'no_recipients' | 'no_staff'
export function shouldUseNotificationFallback(staffUserIds: string[], recipients: string[], mode: NotificationFallbackMode): boolean {
  return mode === 'no_staff' ? staffUserIds.length === 0 : recipients.length === 0
}

interface NotificationTemplateRow { subject:string|null;preheader:string|null;eyebrow:string|null;title:string|null;body_html:string|null;cta_label:string|null;enabled:number|null }
function applyTemplateTokens(value:string, subject:string, body:string):string { return value.replace(/\{\{event_subject\}\}/g,subject).replace(/\{\{event_body\}\}/g,body) }

async function brandedNotification(env:Env, kind:string, subject:string, html:string):Promise<{subject:string;html:string}> {
  let override:NotificationTemplateRow|null=null
  try { override=await env.DB.prepare('SELECT subject,preheader,eyebrow,title,body_html,cta_label,enabled FROM notification_template_overrides WHERE event_key=?').bind(kind).first<NotificationTemplateRow>() } catch { override=null }
  if(override?.enabled===0) return {subject,html:''}
  const finalSubject=override?.subject?applyTemplateTokens(override.subject,subject,html):subject
  const finalBody=override?.body_html?applyTemplateTokens(override.body_html,subject,html):html
  return {
    subject:finalSubject,
    html:renderPinnacleEmailLayout({ preheader:override?.preheader||finalSubject, eyebrow:override?.eyebrow||'Pinnacle HQ notification', title:override?.title||finalSubject, bodyHtml:finalBody }),
  }
}

export async function notifyStaff(
  env: Env,
  opts: { staffUserIds: string[]; kind: string; subject: string; html: string; fallbackMode?: NotificationFallbackMode },
): Promise<{ recipients: string[]; usedFallback: boolean }> {
  const { staffUserIds, kind, subject, html } = opts
  const fallbackMode = opts.fallbackMode ?? 'no_recipients'
  let recipients: string[] = []
  let usedFallback = false
  try {
    let where="u.role IN ('staff','admin') AND u.status='active'"
    if(staffUserIds.length) where+=` AND u.id IN (${staffUserIds.map(()=>'?').join(',')})`
    const res=await env.DB.prepare(
      `SELECT u.email, COALESCE(nup.email_enabled,nec.default_email,0) event_email_enabled, np.muted_kinds legacy_muted,np.email_enabled legacy_email_enabled
       FROM users u LEFT JOIN notification_event_catalog nec ON nec.event_key=? LEFT JOIN notification_user_preferences nup ON nup.user_id=u.id AND nup.event_key=nec.event_key LEFT JOIN notification_prefs np ON np.user_id=u.id WHERE ${where}`,
    ).bind(kind,...staffUserIds).all<any>()
    recipients=(res.results||[]).filter((row:any)=>{let muted:string[]=[];try{muted=JSON.parse(row.legacy_muted||'[]')}catch{muted=[]}return !muted.includes(kind)&&(row.event_email_enabled===1||row.legacy_email_enabled===1)}).map((row:any)=>row.email).filter(Boolean)
  } catch (err) { console.error('[notification] preference lookup failed',err) }
  if (shouldUseNotificationFallback(staffUserIds, recipients, fallbackMode)) {
    const setting = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'firm_notify_email'").first<{ value: string }>()
    if (setting?.value) { recipients = [setting.value]; usedFallback = true }
  }
  const rendered=await brandedNotification(env,kind,subject,html)
  if(rendered.html) await Promise.all([...new Set(recipients)].map((to) => sendEmail(env, {
    to, subject:rendered.subject, html:rendered.html, alreadyBranded:true, replyTo:'mail@pinnaclemanagementventures.com', tags:[{name:'category',value:'event_notification'},{name:'event',value:kind.slice(0,50)}],
  })))
  return { recipients:[...new Set(recipients)], usedFallback }
}
