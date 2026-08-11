import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { uuid } from '../crypto'
import { createActivationToken } from '../session'
import { activityInsert } from '../activity'
import { sendAccountWelcome } from '../accountEmails'
import { logAudit, actorGeo, actorIp, actorUserAgent } from '../auditLog'

export const conversionRoutes = new Hono<AppEnv>()

async function conversionPreview(env:AppEnv['Bindings'],id:string){
  const inquiry=await env.DB.prepare('SELECT * FROM contact_inquiries WHERE id=?').bind(id).first<any>()
  if(!inquiry)return null
  const [existing,notes,emails,activity,lists]=await Promise.all([
    env.DB.prepare('SELECT id,email,role,status FROM users WHERE lower(email)=lower(?)').bind(inquiry.email).first<any>(),
    env.DB.prepare('SELECT COUNT(*) n FROM internal_notes WHERE inquiry_id=?').bind(id).first<{n:number}>(),
    env.DB.prepare('SELECT COUNT(*) n FROM email_log WHERE inquiry_id=?').bind(id).first<{n:number}>(),
    env.DB.prepare('SELECT COUNT(*) n FROM activity_events WHERE inquiry_id=?').bind(id).first<{n:number}>(),
    env.DB.prepare('SELECT COUNT(*) n FROM crm_list_members WHERE inquiry_id=?').bind(id).first<{n:number}>().catch(()=>({n:0})),
  ])
  const blockers:string[]=[]
  if(inquiry.client_user_id)blockers.push('This lead has already been converted.')
  if(inquiry.archived_at)blockers.push('Restore this lead from the archive before converting it.')
  if(existing&&!inquiry.client_user_id)blockers.push('A user with this email already exists; link the account from Users instead of creating a duplicate.')
  const attribution={
    source:inquiry.source||null,record_type:inquiry.record_type||null,lifecycle_stage:inquiry.lifecycle_stage||null,
    lead_status:inquiry.status||null,service_key:inquiry.service_key||null,owner_staff_user_id:inquiry.owner_staff_user_id||null,
    company_name:inquiry.company_name||null,created_at:inquiry.created_at||null,last_contacted_at:inquiry.last_contacted_at||null,
  }
  return {inquiry,blockers,ready:blockers.length===0,transfer:{notes:notes?.n||0,emails:emails?.n||0,activity:activity?.n||0,list_memberships:(lists as any)?.n||0},attribution,existing_user:existing||null}
}

conversionRoutes.get('/inquiries/:id/conversion-preview', requireStaff, async(c)=>{
  const preview=await conversionPreview(c.env,c.req.param('id'))
  if(!preview)return c.json({error:'not found'},404)
  return c.json({preview:{ready:preview.ready,blockers:preview.blockers,transfer:preview.transfer,attribution:preview.attribution,lead:{id:preview.inquiry.id,name:preview.inquiry.name,email:preview.inquiry.email,phone:preview.inquiry.phone,company_name:preview.inquiry.company_name,service_key:preview.inquiry.service_key},existing_user:preview.existing_user}})
})

// Atomic lead -> client conversion. Existing notes, activity and email rows are
// re-keyed rather than copied, so one source of truth survives the lifecycle transition.
conversionRoutes.post('/inquiries/:id/convert', requireStaff, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')!
  const preview=await conversionPreview(c.env,id)
  if(!preview)return c.json({error:'not found'},404)
  if(!preview.ready)return c.json({error:preview.blockers[0],blockers:preview.blockers},409)
  const inquiry=preview.inquiry

  const clientId = uuid()
  const nameParts = (inquiry.name || '').trim().split(/\s+/).filter(Boolean)
  const firstName = nameParts[0] ?? null
  const lastName = nameParts.slice(1).join(' ') || null
  const conversionId = uuid()
  const previewSnapshot={lead:{id:inquiry.id,name:inquiry.name,email:inquiry.email,phone:inquiry.phone,company_name:inquiry.company_name},transfer:preview.transfer,blockers:[]}

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, full_name, first_name, last_name, phone, two_factor_enabled, status)
       VALUES (?, ?, NULL, 'client', ?, ?, ?, ?, 0, 'active')`,
    ).bind(clientId, inquiry.email, inquiry.name || null, firstName, lastName, inquiry.phone ?? null),
    c.env.DB.prepare(
      `INSERT INTO client_profiles (id, user_id, business_name, services_enrolled, onboarding_completed) VALUES (?, ?, ?, ?, 0)`,
    ).bind(uuid(), clientId, inquiry.company_name||null, inquiry.service_key ? JSON.stringify([inquiry.service_key]) : null),
    c.env.DB.prepare(`UPDATE internal_notes SET client_user_id = ? WHERE inquiry_id = ? AND client_user_id IS NULL`).bind(clientId, id),
    c.env.DB.prepare(`UPDATE activity_events SET client_user_id = ? WHERE inquiry_id = ? AND client_user_id IS NULL`).bind(clientId, id),
    c.env.DB.prepare(`UPDATE email_log SET client_user_id = ? WHERE inquiry_id = ? AND client_user_id IS NULL`).bind(clientId, id),
    c.env.DB.prepare(`UPDATE contact_inquiries SET client_user_id = ?, converted_at = datetime('now'), status = 'converted' WHERE id = ?`).bind(clientId, id),
    c.env.DB.prepare(
      `INSERT INTO lead_conversions (id,inquiry_id,client_user_id,converted_by,notes_transferred,emails_transferred,activity_transferred,attribution_json,preview_json)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(conversionId,id,clientId,user.id,preview.transfer.notes,preview.transfer.emails,preview.transfer.activity,JSON.stringify(preview.attribution),JSON.stringify(previewSnapshot)),
    activityInsert(c.env, { actorUserId: user.id, clientUserId: clientId, kind: 'lead_converted', detail: { name: inquiry.name, email: inquiry.email, source:inquiry.source||null, service_key:inquiry.service_key||null } }),
  ])

  await logAudit(c.env,{actorUserId:user.id,actorIp:actorIp(c.req.raw),actorUserAgent:actorUserAgent(c.req.raw),actorGeo:actorGeo(c.req.raw),action:'client_converted',entityType:'lead_conversion',entityId:conversionId,before:previewSnapshot,after:{client_user_id:clientId,attribution:preview.attribution}})

  const setupToken = await createActivationToken(c.env, clientId)
  const setupUrl = `https://client.pinnaclemanagementventures.com/set-password?token=${encodeURIComponent(setupToken)}`
  c.executionCtx.waitUntil(
    sendAccountWelcome(c.env, {
      userId: clientId, role: 'client', email: inquiry.email, firstName, businessName:inquiry.company_name||null,
      creationType: 'lead_conversion', actionLabel: 'Set Up My Pinnacle Account', actionUrl: setupUrl, actorUserId: user.id,
    }).catch((err) => console.error('[account-email] converted lead invite failed', err)),
  )
  return c.json({ ok: true, client_user_id: clientId, setup_token: setupToken, conversion_id:conversionId }, 201)
})

conversionRoutes.get('/inquiries/:id/conversion', requireStaff, async (c) => {
  const id = c.req.param('id')!
  const row = await c.env.DB.prepare(
    `SELECT lc.*, u.full_name AS converted_by_name, u.email AS converted_by_email
     FROM lead_conversions lc JOIN users u ON u.id = lc.converted_by WHERE lc.inquiry_id = ?`,
  ).bind(id).first()
  if (!row) return c.json({ error: 'this lead has not been converted' }, 404)
  return c.json({ conversion: row })
})

conversionRoutes.get('/conversions', requireStaff, async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT lc.*, ci.name AS lead_name, ci.email AS lead_email,
            u.full_name AS converted_by_name, u.email AS converted_by_email
     FROM lead_conversions lc JOIN contact_inquiries ci ON ci.id = lc.inquiry_id JOIN users u ON u.id = lc.converted_by
     ORDER BY lc.created_at DESC LIMIT 300`,
  ).all()
  return c.json({ conversions: res.results ?? [] })
})
