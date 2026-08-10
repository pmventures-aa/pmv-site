import type { Env } from './types'
import { renderPinnacleEmailLayout } from './emailTemplates/layout'

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export interface EmailTag {
  name: string
  value: string
}

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
  idempotencyKey?: string
  tags?: EmailTag[]
}

export async function sendEmailStrict(env: Env, opts: SendEmailOptions): Promise<string> {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured')
  const from = env.RESEND_FROM_EMAIL || 'Pinnacle Management Ventures <orders@pinnaclemanagementventures.com>'
  const body: Record<string, unknown> = { from, to: opts.to, subject: opts.subject, html: opts.html }
  if (typeof opts.text === 'string') body.text = opts.text
  if (opts.replyTo) body.reply_to = opts.replyTo
  if (opts.tags?.length) body.tags = opts.tags.slice(0, 10).map((tag) => ({ name: tag.name, value: tag.value }))
  const headers: Record<string, string> = { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey.slice(0, 256)
  const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers, body: JSON.stringify(body) })
  const payload = await res.json<any>().catch(() => ({}))
  if (!res.ok || !payload?.id) throw new Error(payload?.message || `Resend send failed (${res.status})`)
  return payload.id as string
}

export async function sendEmail(env: Env, opts: SendEmailOptions): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log('[email] RESEND_API_KEY not set — skipping send', { to: opts.to, subject: opts.subject })
    return
  }
  try { await sendEmailStrict(env, opts) } catch (err) { console.error('[email] send failed', err) }
}

export type NotificationFallbackMode = 'no_recipients' | 'no_staff'

export function shouldUseNotificationFallback(staffUserIds: string[], recipients: string[], mode: NotificationFallbackMode): boolean {
  return mode === 'no_staff' ? staffUserIds.length === 0 : recipients.length === 0
}

interface NotificationTemplateRow {
  subject:string|null;preheader:string|null;eyebrow:string|null;title:string|null;body_html:string|null;cta_label:string|null;enabled:number|null
}

function applyTemplateTokens(value:string, subject:string, body:string):string {
  return value.replace(/\{\{event_subject\}\}/g,subject).replace(/\{\{event_body\}\}/g,body)
}

async function brandedNotification(env:Env, kind:string, subject:string, html:string):Promise<{subject:string;html:string}> {
  let override:NotificationTemplateRow|null=null
  try {
    override=await env.DB.prepare('SELECT subject,preheader,eyebrow,title,body_html,cta_label,enabled FROM notification_template_overrides WHERE event_key=?').bind(kind).first<NotificationTemplateRow>()
  } catch { override=null }
  if(override?.enabled===0) return {subject,html:''}
  const finalSubject=override?.subject?applyTemplateTokens(override.subject,subject,html):subject
  const finalBody=override?.body_html?applyTemplateTokens(override.body_html,subject,html):html
  return {
    subject:finalSubject,
    html:renderPinnacleEmailLayout({
      preheader:override?.preheader||finalSubject,
      eyebrow:override?.eyebrow||'Pinnacle HQ notification',
      title:override?.title||finalSubject,
      bodyHtml:finalBody,
    }),
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
    const binds:string[]=[]
    let where="u.role IN ('staff','admin') AND u.status='active'"
    if(staffUserIds.length){
      where+=` AND u.id IN (${staffUserIds.map(()=>'?').join(',')})`
      binds.push(...staffUserIds)
    }
    binds.push(kind)
    const res=await env.DB.prepare(
      `SELECT u.email,
              COALESCE(nup.email_enabled,nec.default_email,0) event_email_enabled,
              np.muted_kinds legacy_muted,np.email_enabled legacy_email_enabled
       FROM users u
       LEFT JOIN notification_event_catalog nec ON nec.event_key=?
       LEFT JOIN notification_user_preferences nup ON nup.user_id=u.id AND nup.event_key=nec.event_key
       LEFT JOIN notification_prefs np ON np.user_id=u.id
       WHERE ${where}`.replace('nec.event_key=?',`nec.event_key=?`),
    ).bind(kind,...staffUserIds).all<any>()
    recipients=(res.results||[]).filter((row:any)=>{
      let muted:string[]=[];try{muted=JSON.parse(row.legacy_muted||'[]')}catch{muted=[]}
      const eventEnabled=row.event_email_enabled===1
      const legacyEnabled=row.legacy_email_enabled===1
      return !muted.includes(kind) && (eventEnabled||legacyEnabled)
    }).map((row:any)=>row.email).filter(Boolean)
  } catch (err) {
    console.error('[notification] preference lookup failed',err)
  }

  if (shouldUseNotificationFallback(staffUserIds, recipients, fallbackMode)) {
    const setting = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'firm_notify_email'").first<{ value: string }>()
    if (setting?.value) { recipients = [setting.value]; usedFallback = true }
  }

  const rendered=await brandedNotification(env,kind,subject,html)
  if(rendered.html) await Promise.all([...new Set(recipients)].map((to) => sendEmail(env, {
    to, subject:rendered.subject, html:rendered.html, replyTo:'orders@pinnaclemanagementventures.com',
    tags:[{name:'category',value:'event_notification'},{name:'event',value:kind.slice(0,50)}],
  })))
  return { recipients:[...new Set(recipients)], usedFallback }
}
