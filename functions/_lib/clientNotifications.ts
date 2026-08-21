import type { Env } from './types'
import { sendEmail } from './email'
import { notificationPreference } from './relationshipAutomation'
import { renderRelationshipEvent } from './emailTemplates/relationship'
import { portalUrl } from './appUrls'
import { renderHqEmailBySlug } from './hqEmailTemplates'

interface TemplateOverride { subject:string|null;preheader:string|null;eyebrow:string|null;title:string|null;body_html:string|null;cta_label:string|null;enabled:number|null }
const tokens=(value:string,subject:string,body:string)=>value.replace(/\{\{event_subject\}\}/g,subject).replace(/\{\{event_body\}\}/g,body)

export async function notifyClientEvent(env:Env,input:{
  clientUserId:string;eventKey:string;subject:string;title:string;body:string;ctaLabel?:string;ctaPath?:string;eyebrow?:string
}):Promise<{sent:boolean}>{
  const pref=await notificationPreference(env,input.clientUserId,input.eventKey)
  if(!pref.email)return {sent:false}
  const user=await env.DB.prepare("SELECT email,first_name,full_name,status FROM users WHERE id=? AND role='client'").bind(input.clientUserId).first<{email:string;first_name:string|null;full_name:string|null;status:string}>()
  if(!user||user.status!=='active')return {sent:false}
  const portalBase = portalUrl()
  const actionUrl = input.ctaPath ? `${portalBase}${input.ctaPath}` : ''

  // One store. Client notifications now read the same hq_email_templates row
  // that staff notifications already did, so both audiences are edited in one
  // place instead of this path silently using a second table nobody was
  // looking at. The old override table stays as the fallback for any event
  // that has not been seeded yet.
  try {
    const stored = await renderHqEmailBySlug(env, `notify_${input.eventKey}`, {
      event_subject: input.subject,
      event_body: input.body,
      first_name: user.first_name || user.full_name || 'there',
      action_url: actionUrl,
      action_label: input.ctaLabel || '',
    })
    // A disabled template means do not send, matching the staff path.
    if (stored?.skipped) return { sent: false }
    if (stored) {
      await sendEmail(env, {
        to: user.email, subject: stored.subject, html: stored.html, text: stored.text,
        replyTo: 'orders@pinnaclemanagementventures.com',
        tags: [{ name: 'category', value: 'client_event' }, { name: 'event', value: input.eventKey.slice(0, 50) }],
      })
      return { sent: true }
    }
  } catch (err) {
    // A template problem must not swallow the notification; fall through to
    // the original path rather than dropping the message.
    console.error('[client-notification] hq template render failed', err)
  }

  const override=await env.DB.prepare('SELECT subject,preheader,eyebrow,title,body_html,cta_label,enabled FROM notification_template_overrides WHERE event_key=?').bind(input.eventKey).first<TemplateOverride>().catch(()=>null)
  if(override?.enabled===0)return {sent:false}
  const subject=override?.subject?tokens(override.subject,input.subject,input.body):input.subject
  const body=override?.body_html?tokens(override.body_html,input.subject,input.body):input.body
  const portal = portalBase
  const rendered=renderRelationshipEvent({
    eventKey:input.eventKey,firstName:user.first_name||user.full_name,subject,title:override?.title||input.title,body,
    preheader:override?.preheader||subject,eyebrow:override?.eyebrow||input.eyebrow||'Your Pinnacle relationship',ctaLabel:override?.cta_label||input.ctaLabel,ctaUrl:input.ctaPath?`${portal}${input.ctaPath}`:undefined,
  })
  await sendEmail(env,{to:user.email,subject:rendered.subject,html:rendered.html,text:rendered.text,replyTo:'orders@pinnaclemanagementventures.com',tags:[{name:'category',value:'client_event'},{name:'event',value:input.eventKey.slice(0,50)}]})
  return {sent:true}
}
