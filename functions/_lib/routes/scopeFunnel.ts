import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { uuid } from '../crypto'
import { activityInsert } from '../activity'
import { escapeHtml, notifyStaff } from '../email'
import { requireOwner, requireUser } from '../mid'
import { calculateCleaningEstimate, CLIENT_PORTAL_BASE, sendScopeConfirmation, twoBusinessHoursFrom, type QuoteRule } from '../scopeFunnel'
import { ensureServiceOfferingsSeeded } from './serviceOfferings'
import { createActivationToken } from '../session'
import { sendAccountWelcome, CLIENT_PORTAL_URL } from '../accountEmails'
import { advanceInquiryLifecycle } from '../lifecycle'

export const scopeFunnelPublicRoutes = new Hono<AppEnv>()
export const scopeFunnelAdminRoutes = new Hono<AppEnv>()

const MAX_PER_HOUR = 12
const JOBS: Record<string,{label:string;serviceKey:string|null;guideSlug?:string;remote?:boolean}> = {
  business_operations: { label:'business operations or administrative support', serviceKey:'consulting', guideSlug:'ongoing-administrative-support', remote:true },
  pos_payments: { label:'POS, payments, or a system transition', serviceKey:'merchant_services', guideSlug:'switching-pos-payment-providers', remote:true },
  cleaning_turnover: { label:'property cleaning or turnover work', serviceKey:'property_management', guideSlug:'property-cleaning-turnover' },
  property_inspection: { label:'a property inspection or documented field visit', serviceKey:'property_inspections', guideSlug:'local-support-south-florida' },
  documents_notary: { label:'documents, filing, signing, or notary support', serviceKey:'admin_support', remote:true },
  eviction_reo: { label:'eviction, REO, or property recovery support', serviceKey:'property_management', guideSlug:'eviction-turnover-support' },
  local_field: { label:'local South Florida field support', serviceKey:'property_inspections', guideSlug:'local-support-south-florida' },
  other: { label:'a professional support request', serviceKey:null, remote:true },
}

const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0,max) : ''
const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

function answersPayload(raw: unknown): { json: string | null; text: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { json: null, text: '' }
  const object: Record<string, string | number | boolean | string[]> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>).slice(0, 40)) {
    if (!key.trim()) continue
    if (Array.isArray(value)) {
      object[key] = value.map((item) => String(item).slice(0, 200)).filter(Boolean).slice(0, 12)
      continue
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') object[key] = value
  }
  const keys = Object.keys(object)
  if (!keys.length) return { json: null, text: '' }
  const text = keys.map((key) => {
    const value = object[key]
    return `${key.replace(/_/g, ' ')}: ${Array.isArray(value) ? value.join(', ') : String(value)}`
  }).join('\n')
  return { json: JSON.stringify(object).slice(0, 8000), text }
}

function setupUrlFor(token: string) {
  return `${CLIENT_PORTAL_URL.replace(/\/$/, '')}/set-password?token=${encodeURIComponent(token)}`
}

async function throttled(c: any) {
  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  const key = `scope:${ip}`
  const count = Number(await c.env.SESSIONS.get(key) || 0)
  if (count >= MAX_PER_HOUR) return true
  await c.env.SESSIONS.put(key, String(count + 1), { expirationTtl:3600 })
  return false
}

async function estimateFor(c: any, jobType: string, quote: any) {
  if (!quote || (jobType !== 'cleaning_turnover' && jobType !== 'property_inspection')) return null
  if (jobType === 'cleaning_turnover') {
    const ruleKey = ['clean_standard','clean_deep','clean_moveout'].includes(clean(quote.rule_key,40)) ? clean(quote.rule_key,40) : 'clean_deep'
    const rule = await c.env.DB.prepare('SELECT * FROM public_quote_rules WHERE key=? AND active=1').bind(ruleKey).first() as QuoteRule | null
    if (!rule) return null
    const sqft = Number(quote.square_feet)
    if (!Number.isFinite(sqft) || sqft < 200 || sqft > 20_000) return null
    return calculateCleaningEstimate(rule, sqft, clean(quote.condition,20), clean(quote.rush,10) === 'true' || quote.rush === true)
  }
  const offeringId = clean(quote.offering_id,100)
  if (!offeringId) return null
  await ensureServiceOfferingsSeeded(c.env)
  const row = await c.env.DB.prepare("SELECT id,name,starting_price_cents FROM service_offerings WHERE id=? AND service_key='property_inspections' AND active=1").bind(offeringId).first() as any
  if (!row?.starting_price_cents) return null
  const rush = quote.rush === true || clean(quote.rush,10) === 'true'
  const base = Number(row.starting_price_cents) * (rush ? 1.2 : 1)
  return { lowCents:Math.round(base / 100) * 100, highCents:Math.round(base * 1.35 / 100) * 100, basis:`${row.name} planning range${rush ? ' with rush scheduling' : ''}`, offeringId:row.id }
}

async function validServiceKey(c: any, value: unknown) {
  const candidate = clean(value,100)
  if (!candidate) return null
  const row = await c.env.DB.prepare('SELECT key FROM services WHERE key=? AND active=1').bind(candidate).first() as {key:string}|null
  return row?.key || null
}

async function validOfferingId(c: any, value: unknown, serviceKey: string | null) {
  const candidate = clean(value,100)
  if (!candidate || !serviceKey) return null
  await ensureServiceOfferingsSeeded(c.env)
  const row = await c.env.DB.prepare('SELECT id FROM service_offerings WHERE id=? AND service_key=? AND active=1').bind(candidate,serviceKey).first() as {id:string}|null
  return row?.id || null
}

scopeFunnelPublicRoutes.post('/scope-requests', async (c) => {
  const body = await c.req.json<any>().catch(() => null)
  if (!body) return c.json({error:'invalid request body'},400)
  if (clean(body.website,200)) return c.json({ok:true},201)
  if (await throttled(c)) return c.json({error:'too many requests — call (561) 388-7879 if the need is urgent'},429)

  const jobType = clean(body.job_type,60)
  const job = JOBS[jobType]
  const timing = clean(body.timing,80)
  const name = clean(body.contact_name,160)
  const email = clean(body.email,200).toLowerCase()
  const phone = clean(body.phone,40)
  const locationType = body.location_type === 'remote' ? 'remote' : 'onsite'
  const city = clean(body.city,100); const state = clean(body.state,40).toUpperCase(); const postal = clean(body.postal_code,20)
  const details = clean(body.details,4000)
  if (!job) return c.json({error:'choose the type of work you need'},400)
  if (!timing) return c.json({error:'choose when you need the work'},400)
  if (!name) return c.json({error:'enter your name'},400)
  if (!emailOk(email)) return c.json({error:'enter a valid email address'},400)
  if (locationType === 'onsite' && (!city || !state)) return c.json({error:'enter the city and state for on-site work'},400)
  if(body.quote&&state!=='FL')return c.json({error:'instant estimates are currently available for Florida field work; use the scope form for other locations'},400)

  let serviceKey = job.serviceKey
  const requestedServiceKey = await validServiceKey(c,body.service_key)
  if (requestedServiceKey) serviceKey = requestedServiceKey
  const quote = await estimateFor(c, jobType, body.quote)
  const id = uuid(); const token = uuid(); const inquiryId = uuid()
  const responseDueAt = twoBusinessHoursFrom(new Date())
  const followUp = body.follow_up_opt_in === true ? 1 : 0
  const answers = answersPayload(body.service_answers)
  const message = [job.label, locationType === 'remote' ? 'Remote / nationwide' : [city,state,postal].filter(Boolean).join(', '), `Timing: ${timing}`, details, answers.text].filter(Boolean).join('\n')
  const requestedOfferingId = body.offering_id || body.quote?.offering_id
  const offeringId = quote && 'offeringId' in quote && quote.offeringId ? quote.offeringId : await validOfferingId(c,requestedOfferingId,serviceKey)
  const nameParts = name.trim().split(/\s+/).filter(Boolean)
  const firstName = nameParts[0] || null
  const lastName = nameParts.slice(1).join(' ') || null

  const existingUser = await c.env.DB.prepare('SELECT id, role, password_hash FROM users WHERE lower(email) = lower(?)').bind(email).first<{id:string;role:string;password_hash:string|null}>()
  let reservedUserId: string | null = null
  let setupUrl: string | null = null
  let accountStatus: 'reserved' | 'existing' | 'none' = 'none'
  const statements: ReturnType<typeof c.env.DB.prepare>[] = []

  if (existingUser?.role === 'client') {
    reservedUserId = existingUser.id
    accountStatus = existingUser.password_hash ? 'existing' : 'reserved'
    if (!existingUser.password_hash) {
      setupUrl = setupUrlFor(await createActivationToken(c.env, existingUser.id))
    }
  } else if (!existingUser) {
    reservedUserId = uuid()
    accountStatus = 'reserved'
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, role, full_name, first_name, last_name, phone, two_factor_enabled, status)
         VALUES (?, ?, NULL, 'client', ?, ?, ?, ?, 0, 'active')`,
      ).bind(reservedUserId, email, name, firstName, lastName, phone || null),
      c.env.DB.prepare(
        `INSERT INTO client_profiles (id, user_id, services_enrolled, onboarding_completed) VALUES (?, ?, ?, 0)`,
      ).bind(uuid(), reservedUserId, serviceKey ? JSON.stringify([serviceKey]) : null),
    )
    setupUrl = setupUrlFor(await createActivationToken(c.env, reservedUserId))
  }

  statements.push(
    c.env.DB.prepare(`INSERT INTO contact_inquiries(id,name,email,phone,service_key,message,source,city,state,postal_code,lifecycle_stage,first_name,last_name,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?, 'lead',?,?,datetime('now'))`).bind(inquiryId,name,email,phone||null,serviceKey,message,clean(body.source,100)||'public_scope_request',city||null,state||null,postal||null,firstName,lastName),
    c.env.DB.prepare(`INSERT INTO public_scope_requests
      (id,public_token,inquiry_id,job_type,service_key,offering_id,guide_slug,audience,location_type,city,state,postal_code,timing,details,contact_name,email,phone,follow_up_opt_in,response_due_at,estimate_low_cents,estimate_high_cents,estimate_basis,quote_inputs_json,status,answers_json,reserved_user_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        id,token,inquiryId,jobType,serviceKey,offeringId,clean(body.guide_slug,120)||job.guideSlug||null,clean(body.audience,80)||null,locationType,city||null,state||null,postal||null,timing,details||null,name,email,phone||null,followUp,responseDueAt,quote?.lowCents||null,quote?.highCents||null,quote?.basis||null,body.quote?JSON.stringify(body.quote):null,quote?'quoted':'new',answers.json,reservedUserId,
      ),
    activityInsert(c.env,{kind:'scope_request_submitted',detail:{job_type:jobType,service_key:serviceKey,source:clean(body.source,100)||'public',account_status:accountStatus}}),
  )

  await c.env.DB.batch(statements)

  c.executionCtx.waitUntil(Promise.all([
    sendScopeConfirmation(c.env,{name,email,jobLabel:job.label,token}),
    notifyStaff(c.env,{staffUserIds:[],kind:'lead_created',subject:`New scoped request: ${name}`,html:`<p><strong>${escapeHtml(name)}</strong> submitted a request for ${escapeHtml(job.label)}.</p><p>${escapeHtml(message).replace(/\n/g,'<br>')}</p><p><strong>Response target:</strong> ${escapeHtml(responseDueAt)}</p>`}),
    setupUrl && reservedUserId ? sendAccountWelcome(c.env, {
      userId: reservedUserId, role: 'client', email, firstName, creationType: 'lead_conversion',
      actionLabel: 'Open My Workspace', actionUrl: setupUrl,
    }).catch((err) => console.error('[account-email] scope reserve failed', err)) : Promise.resolve(),
  ]))
  return c.json({
    ok:true,
    request_token:token,
    response_due_at:responseDueAt,
    estimate:quote?{low_cents:quote.lowCents,high_cents:quote.highCents,basis:quote.basis}:null,
    confirmation_url:`/scope-request/confirmation?request=${encodeURIComponent(token)}`,
    signup_url:`${CLIENT_PORTAL_BASE}/signup?scope=${encodeURIComponent(token)}&source=scope-confirmation`,
    setup_url:setupUrl,
    account_status:accountStatus,
  },201)
})

scopeFunnelPublicRoutes.get('/scope-requests/:token', async (c) => {
  const token = c.req.param('token')
  let row: any = null
  try {
    row = await c.env.DB.prepare(`SELECT r.public_token,r.job_type,r.service_key,r.offering_id,r.guide_slug,r.audience,r.location_type,r.city,r.state,r.postal_code,r.timing,r.details,r.contact_name,r.email,r.phone,r.status,r.response_due_at,r.estimate_low_cents,r.estimate_high_cents,r.estimate_basis,r.preferred_slot_at,r.created_at,r.reserved_user_id,u.password_hash
      FROM public_scope_requests r LEFT JOIN users u ON u.id = r.reserved_user_id WHERE r.public_token=?`).bind(token).first<any>()
  } catch {
    row = await c.env.DB.prepare(`SELECT public_token,job_type,service_key,offering_id,guide_slug,audience,location_type,city,state,postal_code,timing,details,contact_name,email,phone,status,response_due_at,estimate_low_cents,estimate_high_cents,estimate_basis,preferred_slot_at,created_at FROM public_scope_requests WHERE public_token=?`).bind(token).first<any>()
  }
  if (!row) return c.json({error:'request not found'},404)
  const {reserved_user_id,password_hash,...request} = row
  const accountStatus = reserved_user_id ? (password_hash ? 'existing' : 'reserved') : 'none'
  return c.json({request,job_label:JOBS[row.job_type]?.label||'professional support',signup_url:`${CLIENT_PORTAL_BASE}/signup?scope=${encodeURIComponent(row.public_token)}&source=scope-confirmation`,account_status:accountStatus},{headers:{'Cache-Control':'no-store'}})
})

scopeFunnelPublicRoutes.get('/public-booking-slots', async (c) => {
  const jobType=clean(c.req.query('job_type'),60)
  if(!['cleaning_turnover','property_inspection'].includes(jobType))return c.json({error:'choose an eligible service type'},400)
  const rows=await c.env.DB.prepare(`SELECT id,job_type,starts_at,ends_at,capacity-booked_count AS remaining
    FROM public_service_slots
    WHERE job_type=? AND active=1 AND booked_count<capacity AND julianday(starts_at)>julianday('now','+2 hours')
    ORDER BY starts_at LIMIT 20`).bind(jobType).all()
  c.header('Cache-Control','public, max-age=30, s-maxage=30')
  return c.json({slots:rows.results||[]})
})

scopeFunnelPublicRoutes.post('/scope-requests/:token/book', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const slotId=clean(body.slot_id,100)
  if(!slotId)return c.json({error:'choose an available appointment'},400)
  const request=await c.env.DB.prepare(`SELECT id,job_type,contact_name,email,status,estimate_low_cents
    FROM public_scope_requests WHERE public_token=?`).bind(c.req.param('token')).first<any>()
  if(!request)return c.json({error:'request not found'},404)
  if(request.status==='closed')return c.json({error:'this request is closed; start a new request to book service'},409)
  if(!['cleaning_turnover','property_inspection'].includes(request.job_type)||request.estimate_low_cents==null)return c.json({error:'online booking is available after an eligible estimate'},400)
  const existing=await c.env.DB.prepare(`SELECT b.id,s.id slot_id,s.starts_at,s.ends_at FROM public_scope_bookings b
    JOIN public_service_slots s ON s.id=b.slot_id WHERE b.scope_request_id=? AND b.status='confirmed'`).bind(request.id).first<any>()
  if(existing){
    if(existing.slot_id!==slotId)return c.json({error:'this request already has a confirmed appointment'},409)
    return c.json({ok:true,booking:{id:existing.id,starts_at:existing.starts_at,ends_at:existing.ends_at,status:'confirmed'}})
  }
  const bookingId=uuid()
  const results=await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE public_service_slots SET booked_count=booked_count+1,last_reservation_id=?,updated_at=datetime('now')
      WHERE id=? AND job_type=? AND active=1 AND booked_count<capacity AND julianday(starts_at)>julianday('now','+2 hours')`).bind(bookingId,slotId,request.job_type),
    c.env.DB.prepare(`INSERT INTO public_scope_bookings(id,scope_request_id,slot_id)
      SELECT ?,?,id FROM public_service_slots WHERE id=? AND last_reservation_id=?`).bind(bookingId,request.id,slotId,bookingId),
    c.env.DB.prepare(`UPDATE public_scope_requests SET preferred_slot_at=(SELECT starts_at FROM public_service_slots WHERE id=?),booked_at=datetime('now'),status='booked',updated_at=datetime('now')
      WHERE id=? AND EXISTS(SELECT 1 FROM public_scope_bookings WHERE id=?)`).bind(slotId,request.id,bookingId),
  ])
  if(!Number((results[1] as any)?.meta?.changes||0))return c.json({error:'that appointment is no longer available; choose another time'},409)
  const slot=await c.env.DB.prepare('SELECT starts_at,ends_at FROM public_service_slots WHERE id=?').bind(slotId).first<any>()
  c.executionCtx.waitUntil(notifyStaff(c.env,{staffUserIds:[],kind:'lead_created',subject:`Appointment booked: ${request.contact_name}`,html:`<p><strong>${escapeHtml(request.contact_name)}</strong> confirmed an online appointment.</p><p><strong>Starts:</strong> ${escapeHtml(slot.starts_at)}</p><p><strong>Request:</strong> ${escapeHtml(request.job_type.replace(/_/g,' '))}</p>`}))
  return c.json({ok:true,booking:{id:bookingId,starts_at:slot.starts_at,ends_at:slot.ends_at,status:'confirmed'}},201)
})

scopeFunnelPublicRoutes.post('/scope-requests/:token/convert', requireUser, async (c) => {
  const user = c.get('user')
  if (user.role !== 'client') return c.json({error:'client account required'},403)
  const row = await c.env.DB.prepare('SELECT id,inquiry_id FROM public_scope_requests WHERE public_token=?').bind(c.req.param('token')).first<any>()
  if (!row) return c.json({error:'request not found'},404)
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE public_scope_requests SET converted_user_id=?,status='converted',updated_at=datetime('now') WHERE id=?").bind(user.id,row.id),
    c.env.DB.prepare("UPDATE contact_inquiries SET client_user_id=?,updated_at=datetime('now') WHERE id=? AND converted_at IS NULL").bind(user.id,row.inquiry_id),
  ])
  await advanceInquiryLifecycle(c.env, { inquiryId: row.inquiry_id, target: 'prospect' })
  return c.json({ok:true})
})

scopeFunnelPublicRoutes.get('/public-proof', async (c) => {
  const serviceKey = clean(c.req.query('service_key'),100)
  const audience = clean(c.req.query('audience'),80)
  const clauses = ['published=1']; const values:string[] = []
  if (serviceKey) { clauses.push('(service_key=? OR service_key IS NULL)'); values.push(serviceKey) }
  if (audience) { clauses.push('(audience=? OR audience IS NULL)'); values.push(audience) }
  const cases = await c.env.DB.prepare(`SELECT id,service_key,guide_slug,audience,headline,outcome,timeline_label,redacted_location,image_url,image_alt FROM public_case_studies WHERE ${clauses.join(' AND ')} ORDER BY sort_order,updated_at DESC LIMIT 4`).bind(...values).all()
  const monthKey = new Date().toISOString().slice(0,7)
  let metrics = await c.env.DB.prepare('SELECT * FROM public_metric_snapshots WHERE month_key=?').bind(monthKey).first<any>()
  if (!metrics) {
    const [properties,jobs,response,states] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) n FROM properties').first<any>(),
      c.env.DB.prepare("SELECT COUNT(*) n FROM field_assignments WHERE status='completed' OR completed_at IS NOT NULL").first<any>(),
      c.env.DB.prepare("SELECT ROUND(AVG((julianday(first_response_at)-julianday(created_at))*1440)) n FROM support_tickets WHERE first_response_at IS NOT NULL").first<any>(),
      c.env.DB.prepare("SELECT COUNT(DISTINCT upper(site_state)) n FROM field_assignments WHERE (status='completed' OR completed_at IS NOT NULL) AND site_state IS NOT NULL AND trim(site_state)!=''").first<any>(),
    ])
    metrics = {month_key:monthKey,properties_served:Number(properties?.n||0),jobs_completed:Number(jobs?.n||0),average_response_minutes:response?.n==null?null:Number(response.n),states_covered:Number(states?.n||0)}
    await c.env.DB.prepare('INSERT OR IGNORE INTO public_metric_snapshots(month_key,properties_served,jobs_completed,average_response_minutes,states_covered) VALUES(?,?,?,?,?)').bind(monthKey,metrics.properties_served,metrics.jobs_completed,metrics.average_response_minutes,metrics.states_covered).run()
  }
  c.header('Cache-Control','public, max-age=3600, s-maxage=2592000')
  return c.json({case_studies:cases.results||[],metrics})
})

scopeFunnelAdminRoutes.get('/public-funnel', requireOwner, async (c) => {
  const [cases,rules,requests,slots] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM public_case_studies ORDER BY sort_order,updated_at DESC').all(),
    c.env.DB.prepare('SELECT * FROM public_quote_rules ORDER BY key').all(),
    c.env.DB.prepare('SELECT id,job_type,service_key,contact_name,email,status,response_due_at,estimate_low_cents,estimate_high_cents,created_at FROM public_scope_requests ORDER BY created_at DESC LIMIT 100').all(),
    c.env.DB.prepare(`SELECT id,job_type,starts_at,ends_at,capacity,booked_count,active,internal_note
      FROM public_service_slots WHERE julianday(ends_at)>julianday('now','-30 days') ORDER BY starts_at LIMIT 150`).all(),
  ])
  return c.json({case_studies:cases.results||[],quote_rules:rules.results||[],scope_requests:requests.results||[],booking_slots:slots.results||[]})
})

scopeFunnelAdminRoutes.post('/public-funnel/booking-slots', requireOwner, async (c) => {
  const b=await c.req.json<any>().catch(()=>({}));const jobType=clean(b.job_type,60);const starts=new Date(clean(b.starts_at,80));const ends=new Date(clean(b.ends_at,80));const capacity=Math.round(Number(b.capacity)||1)
  if(!['cleaning_turnover','property_inspection'].includes(jobType))return c.json({error:'choose cleaning or property verification'},400)
  if(Number.isNaN(starts.getTime())||Number.isNaN(ends.getTime())||ends<=starts)return c.json({error:'enter a valid start and end time'},400)
  if(starts.getTime()<=Date.now()+30*60_000)return c.json({error:'appointment must start at least 30 minutes from now'},400)
  if(capacity<1||capacity>25)return c.json({error:'capacity must be between 1 and 25'},400)
  const id=uuid();await c.env.DB.prepare(`INSERT INTO public_service_slots(id,job_type,starts_at,ends_at,capacity,internal_note) VALUES(?,?,?,?,?,?)`).bind(id,jobType,starts.toISOString(),ends.toISOString(),capacity,clean(b.internal_note,500)||null).run()
  return c.json({ok:true,id},201)
})

scopeFunnelAdminRoutes.patch('/public-funnel/booking-slots/:id', requireOwner, async (c) => {
  const b=await c.req.json<any>().catch(()=>({}));const capacity=Math.round(Number(b.capacity)||1)
  if(capacity<1||capacity>25)return c.json({error:'capacity must be between 1 and 25'},400)
  const result=await c.env.DB.prepare(`UPDATE public_service_slots SET capacity=?,active=?,internal_note=?,updated_at=datetime('now')
    WHERE id=? AND booked_count<=?`).bind(capacity,b.active===false?0:1,clean(b.internal_note,500)||null,c.req.param('id'),capacity).run()
  if(!result.meta.changes)return c.json({error:'slot not found or capacity is below confirmed bookings'},400)
  return c.json({ok:true})
})

scopeFunnelAdminRoutes.delete('/public-funnel/booking-slots/:id', requireOwner, async (c) => {
  const result=await c.env.DB.prepare('DELETE FROM public_service_slots WHERE id=? AND booked_count=0').bind(c.req.param('id')).run()
  if(!result.meta.changes)return c.json({error:'slot not found or it already has a confirmed booking'},409)
  return c.json({ok:true})
})

scopeFunnelAdminRoutes.post('/public-funnel/case-studies', requireOwner, async (c) => {
  const b = await c.req.json<any>().catch(() => ({})); const headline=clean(b.headline,180);const outcome=clean(b.outcome,500);const timeline=clean(b.timeline_label,80)
  if(!headline||!outcome||!timeline)return c.json({error:'headline, outcome, and timeline are required'},400)
  const imageUrl=clean(b.image_url,1000);if(imageUrl&&!/^https:\/\//i.test(imageUrl))return c.json({error:'image URL must use https'},400)
  const requestedService=clean(b.service_key,100);const serviceKey=await validServiceKey(c,requestedService)
  if(requestedService&&!serviceKey)return c.json({error:'choose a valid active service'},400)
  const id=uuid();await c.env.DB.prepare(`INSERT INTO public_case_studies(id,service_key,guide_slug,audience,headline,outcome,timeline_label,redacted_location,image_url,image_alt,published,sort_order,updated_by_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,serviceKey,clean(b.guide_slug,120)||null,clean(b.audience,80)||null,headline,outcome,timeline,clean(b.redacted_location,120)||null,imageUrl||null,clean(b.image_alt,200)||null,b.published===true?1:0,Number(b.sort_order)||0,c.get('user').id).run();return c.json({ok:true,id},201)
})

scopeFunnelAdminRoutes.patch('/public-funnel/case-studies/:id', requireOwner, async (c) => {
  const b=await c.req.json<any>().catch(()=>({}));const headline=clean(b.headline,180);const outcome=clean(b.outcome,500);const timeline=clean(b.timeline_label,80)
  if(!headline||!outcome||!timeline)return c.json({error:'headline, outcome, and timeline are required'},400)
  const imageUrl=clean(b.image_url,1000);if(imageUrl&&!/^https:\/\//i.test(imageUrl))return c.json({error:'image URL must use https'},400)
  const requestedService=clean(b.service_key,100);const serviceKey=await validServiceKey(c,requestedService)
  if(requestedService&&!serviceKey)return c.json({error:'choose a valid active service'},400)
  const result=await c.env.DB.prepare(`UPDATE public_case_studies SET service_key=?,guide_slug=?,audience=?,headline=?,outcome=?,timeline_label=?,redacted_location=?,image_url=?,image_alt=?,published=?,sort_order=?,updated_by_user_id=?,updated_at=datetime('now') WHERE id=?`).bind(serviceKey,clean(b.guide_slug,120)||null,clean(b.audience,80)||null,headline,outcome,timeline,clean(b.redacted_location,120)||null,imageUrl||null,clean(b.image_alt,200)||null,b.published===true?1:0,Number(b.sort_order)||0,c.get('user').id,c.req.param('id')).run();if(!result.meta.changes)return c.json({error:'case study not found'},404);return c.json({ok:true})
})

scopeFunnelAdminRoutes.delete('/public-funnel/case-studies/:id', requireOwner, async (c) => {const result=await c.env.DB.prepare('DELETE FROM public_case_studies WHERE id=?').bind(c.req.param('id')).run();if(!result.meta.changes)return c.json({error:'case study not found'},404);return c.json({ok:true})})

scopeFunnelAdminRoutes.patch('/public-funnel/quote-rules/:key', requireOwner, async (c) => {
  const b=await c.req.json<any>().catch(()=>({}));const cents=(v:unknown)=>Math.max(0,Math.round(Number(v)*100));
  if(!Number.isFinite(Number(b.base_price))||!Number.isFinite(Number(b.minimum_price))||!Number.isFinite(Number(b.per_sqft)))return c.json({error:'enter valid quote amounts'},400)
  const result=await c.env.DB.prepare("UPDATE public_quote_rules SET base_price_cents=?,minimum_price_cents=?,per_sqft_cents=?,range_low_percent=?,range_high_percent=?,active=?,updated_by_user_id=?,updated_at=datetime('now') WHERE key=?").bind(cents(b.base_price),cents(b.minimum_price),cents(b.per_sqft),Math.min(100,Math.max(50,Number(b.range_low_percent)||90)),Math.min(250,Math.max(100,Number(b.range_high_percent)||115)),b.active===false?0:1,c.get('user').id,c.req.param('key')).run();if(!result.meta.changes)return c.json({error:'quote rule not found'},404);return c.json({ok:true})
})
