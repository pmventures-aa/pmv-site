import type { Env } from './types'
import { notifyClientEvent } from './clientNotifications'

interface OutboxRow { id:string;client_user_id:string;event_key:string;entity_type:string|null;entity_id:string|null;payload_json:string|null;attempts:number }

function payload(raw:string|null):Record<string,unknown>{try{const p=JSON.parse(raw||'{}');return p&&typeof p==='object'?p:{}}catch{return {}}}
function dollars(cents:unknown):string{const n=Number(cents||0);return `$${(n/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`}

function copyFor(row:OutboxRow):{subject:string;title:string;body:string;ctaLabel?:string;ctaPath?:string;eyebrow?:string}{
  const p=payload(row.payload_json)
  switch(row.event_key){
    case 'invoice_created': return {subject:'A new Pinnacle invoice is ready',title:'Your invoice is ready to review.',body:`A new invoice for ${dollars(p.amount_cents)} has been added to your Pinnacle account${p.due_date?` and is due ${String(p.due_date)}`:''}. You can review the details from Billing in your Client Portal.`,ctaLabel:'Review Billing',ctaPath:'/billing',eyebrow:'Billing update'}
    case 'appointment_scheduled': return {subject:'A Pinnacle appointment was scheduled',title:'Your schedule has been updated.',body:`${String(p.title||'An appointment')} has been added for ${String(p.starts_at||'the scheduled time')}. Your Client Portal keeps upcoming appointments connected to the rest of your work.`,ctaLabel:'View Calendar',ctaPath:'/calendar',eyebrow:'Schedule update'}
    case 'document_uploaded': return {subject:'A new document is available in Pinnacle',title:'A document was added to your workspace.',body:`${String(p.file_name||'A new document')} is now available in your Client Portal. Documents stay connected to your relationship so you do not have to search through old email threads.`,ctaLabel:'View Documents',ctaPath:'/documents',eyebrow:'Document update'}
    case 'service_assigned': return {subject:'A Pinnacle service was added to your account',title:'Your Pinnacle journey has a new next step.',body:`A service has been added to your account${p.service_key?`: ${String(p.service_key).replace(/_/g,' ')}`:''}. Open My Services to review the status, complete anything needed from you, and see what happens next.`,ctaLabel:'Open My Services',ctaPath:'/services',eyebrow:'Service update'}
    case 'service_completed': return {subject:'A Pinnacle service has been completed',title:'This part of the work is complete.',body:`Your ${String(p.service_key||'service').replace(/_/g,' ')} engagement has been marked complete. The relationship stays available if you need documents, follow-up, or another service later.`,ctaLabel:'View My Services',ctaPath:'/services',eyebrow:'Service complete'}
    case 'service_application_submitted': return {subject:'We received your Pinnacle service application',title:'Your application is in.',body:`We received your ${String(p.service_key||'service').replace(/_/g,' ')} application. Your answers and uploaded documents are saved with your account, and Pinnacle will review the request and follow up if anything needs clarification.`,ctaLabel:'Track My Application',ctaPath:'/services',eyebrow:'Application received'}
    case 'service_application_approved': return {subject:'Your Pinnacle service application is moving forward',title:'You’re ready for the next step.',body:`Your ${String(p.service_key||'service').replace(/_/g,' ')} application has been approved to move forward. Open your Client Portal to review the service and any next action from Pinnacle.`,ctaLabel:'See What’s Next',ctaPath:'/services',eyebrow:'Application update'}
    case 'trusted_contact_accepted': return {subject:'Your Trusted Contact accepted the invitation',title:'Trusted Contact access is now active.',body:`${String(p.full_name||p.email||'Your Trusted Contact')} accepted your invitation. Their access is limited to the sections and View/Edit permissions you chose, and you can change or revoke those permissions at any time.`,ctaLabel:'Manage Trusted Contacts',ctaPath:'/trusted-contacts',eyebrow:'Trusted Contact'}
    case 'message_received': return {subject:'You have a new message from Pinnacle',title:'There’s a new message in your portal.',body:`Your Pinnacle team sent you a secure message${p.preview?`: “${String(p.preview)}${String(p.preview).length>=180?'…':''}”`:'.'} Open Messages to read it in context and reply securely.`,ctaLabel:'Read Message',ctaPath:'/messages',eyebrow:'Secure message'}
    default:return {subject:'There’s an update in your Pinnacle account',title:'Your Pinnacle workspace has an update.',body:'Open your Client Portal to review the latest activity and see whether anything needs your attention.',ctaLabel:'Open My Portal',ctaPath:'/'}
  }
}

export async function runClientNotificationOutbox(env:Env,limit=60):Promise<{processed:number;sent:number;skipped:number;failed:number}>{
  const rows=await env.DB.prepare("SELECT * FROM client_notification_outbox WHERE status='pending' ORDER BY created_at ASC LIMIT ?").bind(limit).all<OutboxRow>()
  let sent=0,skipped=0,failed=0
  for(const row of rows.results||[]){
    const copy=copyFor(row)
    try{
      const result=await notifyClientEvent(env,{clientUserId:row.client_user_id,eventKey:row.event_key,...copy})
      await env.DB.prepare("UPDATE client_notification_outbox SET status=?,attempts=attempts+1,processed_at=datetime('now') WHERE id=?").bind(result.sent?'sent':'skipped',row.id).run()
      if(result.sent)sent++;else skipped++
    }catch(err){
      const message=err instanceof Error?err.message.slice(0,1000):'notification failed'
      await env.DB.prepare("UPDATE client_notification_outbox SET status=CASE WHEN attempts>=2 THEN 'failed' ELSE 'pending' END,attempts=attempts+1,last_error=? WHERE id=?").bind(message,row.id).run()
      failed++
    }
  }
  return {processed:(rows.results||[]).length,sent,skipped,failed}
}
