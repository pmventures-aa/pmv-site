import type { Env } from './types'
import { sendEmail } from './email'
import { notificationPreference } from './relationshipAutomation'
import { renderRelationshipEvent } from './emailTemplates/relationship'

export async function notifyClientEvent(env:Env,input:{
  clientUserId:string;eventKey:string;subject:string;title:string;body:string;ctaLabel?:string;ctaPath?:string;eyebrow?:string
}):Promise<{sent:boolean}>{
  const pref=await notificationPreference(env,input.clientUserId,input.eventKey)
  if(!pref.email)return {sent:false}
  const user=await env.DB.prepare('SELECT email,first_name,full_name,status FROM users WHERE id=? AND role=\'client\'').bind(input.clientUserId).first<{email:string;first_name:string|null;full_name:string|null;status:string}>()
  if(!user||user.status!=='active')return {sent:false}
  const portal='https://client.pinnaclemanagementventures.com'
  const rendered=renderRelationshipEvent({
    eventKey:input.eventKey,firstName:user.first_name||user.full_name,subject:input.subject,title:input.title,body:input.body,
    eyebrow:input.eyebrow||'Your Pinnacle relationship',ctaLabel:input.ctaLabel,ctaUrl:input.ctaPath?`${portal}${input.ctaPath}`:undefined,
  })
  await sendEmail(env,{to:user.email,subject:rendered.subject,html:rendered.html,text:rendered.text,replyTo:'orders@pinnaclemanagementventures.com',tags:[{name:'category',value:'client_event'},{name:'event',value:input.eventKey.slice(0,50)}]})
  return {sent:true}
}
