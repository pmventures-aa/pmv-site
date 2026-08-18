// Cleaning property profiles API - standalone so it does not touch the cleaning
// jobs module.
//
//   cleaningPropertyPortalRoutes -> '/portal'  (client manages own properties)
//   cleaningPropertyAdminRoutes  -> '/admin'   (staff manage + attach to jobs,
//                                               vendor reads instructions for
//                                               their assigned job)
//
// Access model:
//   * A client owns and sees only their own profiles, including the sensitive
//     access instructions for their own property.
//   * Staff see and manage all profiles, with access instructions.
//   * A vendor only sees a property's instructions (including access) for a job
//     that is assigned to them and not yet closed - never by browsing profiles.

import { Hono } from 'hono'
import type { AppEnv, Env } from '../types'
import { requireStaff, requireUser } from '../mid'
import { uuid } from '../crypto'
import { sanitizePropertyInput, type CleaningPropertyProfile } from '../../../shared/cleaningProperty'

export const cleaningPropertyPortalRoutes = new Hono<AppEnv>()
export const cleaningPropertyAdminRoutes = new Hono<AppEnv>()

interface ProfileRow {
  id: string
  nickname: string | null
  property_type: string | null
  address: string | null
  unit: string | null
  county: string | null
  bedrooms: number | null
  bathrooms: number | null
  beds: number | null
  square_feet: number | null
  parking: string | null
  building_entry: string | null
  trash_location: string | null
  supply_location: string | null
  laundry_notes: string | null
  linen_standards: string | null
  cleaning_preferences: string | null
  do_not_touch: string | null
  pet_notes: string | null
  special_warnings: string | null
  checkin_time: string | null
  checkout_time: string | null
  emergency_contact: string | null
  access_instructions: string | null
  client_user_id: string | null
}

function view(row: ProfileRow, includeAccess: boolean): CleaningPropertyProfile {
  const base: CleaningPropertyProfile = {
    id: row.id,
    nickname: row.nickname,
    propertyType: row.property_type,
    address: row.address,
    unit: row.unit,
    county: row.county,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    beds: row.beds,
    squareFeet: row.square_feet,
    parking: row.parking,
    buildingEntry: row.building_entry,
    trashLocation: row.trash_location,
    supplyLocation: row.supply_location,
    laundryNotes: row.laundry_notes,
    linenStandards: row.linen_standards,
    cleaningPreferences: row.cleaning_preferences,
    doNotTouch: row.do_not_touch,
    petNotes: row.pet_notes,
    specialWarnings: row.special_warnings,
    checkinTime: row.checkin_time,
    checkoutTime: row.checkout_time,
    emergencyContact: row.emergency_contact,
  }
  if (includeAccess) base.accessInstructions = row.access_instructions
  return base
}

const SELECT = 'SELECT id, nickname, property_type, address, unit, county, bedrooms, bathrooms, beds, square_feet, parking, building_entry, trash_location, supply_location, laundry_notes, linen_standards, cleaning_preferences, do_not_touch, pet_notes, special_warnings, checkin_time, checkout_time, emergency_contact, access_instructions, client_user_id FROM cleaning_property_profiles'

const INSERT_COLUMNS = [
  'nickname', 'address', 'unit', 'parking', 'building_entry', 'trash_location', 'supply_location',
  'laundry_notes', 'linen_standards', 'cleaning_preferences', 'do_not_touch', 'pet_notes',
  'special_warnings', 'checkin_time', 'checkout_time', 'emergency_contact',
]
const INT_COLUMNS = ['bedrooms', 'bathrooms', 'beds', 'square_feet']

async function createProfile(env: Env, body: Record<string, unknown>, clientUserId: string | null, createdBy: string): Promise<string> {
  const s = sanitizePropertyInput(body)
  const id = uuid()
  const cols = ['id', 'client_user_id', 'county', 'property_type', 'access_instructions', 'created_by_user_id', ...INSERT_COLUMNS, ...INT_COLUMNS]
  const binds: unknown[] = [id, clientUserId, s.county, s.propertyType, s.accessInstructions, createdBy]
  for (const c of INSERT_COLUMNS) binds.push(s.text[c] ?? null)
  for (const c of INT_COLUMNS) binds.push(s.ints[c] ?? null)
  await env.DB.prepare(`INSERT INTO cleaning_property_profiles (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...binds).run()
  return id
}

async function updateProfile(env: Env, id: string, body: Record<string, unknown>): Promise<void> {
  const s = sanitizePropertyInput(body)
  const sets: string[] = ['county=?', 'property_type=?', 'access_instructions=?']
  const binds: unknown[] = [s.county, s.propertyType, s.accessInstructions]
  for (const c of INSERT_COLUMNS) { sets.push(`${c}=?`); binds.push(s.text[c] ?? null) }
  for (const c of INT_COLUMNS) { sets.push(`${c}=?`); binds.push(s.ints[c] ?? null) }
  sets.push("updated_at=datetime('now')")
  binds.push(id)
  await env.DB.prepare(`UPDATE cleaning_property_profiles SET ${sets.join(', ')} WHERE id=?`).bind(...binds).run()
}

// ---------------------------------------------------------------------------
// Portal (client-owned)
// ---------------------------------------------------------------------------

cleaningPropertyPortalRoutes.get('/cleaning/properties', requireUser, async (c) => {
  const me = c.get('user')!
  const rows = await c.env.DB.prepare(`${SELECT} WHERE client_user_id=? AND active=1 ORDER BY created_at DESC`).bind(me.id).all<ProfileRow>()
  return c.json({ properties: (rows.results || []).map((r) => view(r, true)) })
})

cleaningPropertyPortalRoutes.post('/cleaning/properties', requireUser, async (c) => {
  const me = c.get('user')!
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const id = await createProfile(c.env, body, me.id, me.id)
  return c.json({ ok: true, id }, 201)
})

cleaningPropertyPortalRoutes.patch('/cleaning/properties/:id', requireUser, async (c) => {
  const me = c.get('user')!
  const id = c.req.param('id')!
  const owned = await c.env.DB.prepare('SELECT id FROM cleaning_property_profiles WHERE id=? AND client_user_id=?').bind(id, me.id).first()
  if (!owned) return c.json({ error: 'Not found' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  await updateProfile(c.env, id, body)
  return c.json({ ok: true })
})

cleaningPropertyPortalRoutes.delete('/cleaning/properties/:id', requireUser, async (c) => {
  const me = c.get('user')!
  const id = c.req.param('id')!
  await c.env.DB.prepare("UPDATE cleaning_property_profiles SET active=0, updated_at=datetime('now') WHERE id=? AND client_user_id=?").bind(id, me.id).run()
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Admin (staff)
// ---------------------------------------------------------------------------

cleaningPropertyAdminRoutes.get('/cleaning/properties', requireStaff, async (c) => {
  const client = c.req.query('client')
  const rows = client
    ? await c.env.DB.prepare(`${SELECT} WHERE client_user_id=? AND active=1 ORDER BY created_at DESC LIMIT 300`).bind(client).all<ProfileRow>()
    : await c.env.DB.prepare(`${SELECT} WHERE active=1 ORDER BY created_at DESC LIMIT 300`).all<ProfileRow>()
  return c.json({ properties: (rows.results || []).map((r) => view(r, true)) })
})

cleaningPropertyAdminRoutes.get('/cleaning/properties/:id', requireStaff, async (c) => {
  const row = await c.env.DB.prepare(`${SELECT} WHERE id=?`).bind(c.req.param('id')!).first<ProfileRow>()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json({ property: view(row, true) })
})

cleaningPropertyAdminRoutes.post('/cleaning/properties', requireStaff, async (c) => {
  const me = c.get('user')!
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const clientUserId = typeof body.client_user_id === 'string' ? body.client_user_id : null
  const id = await createProfile(c.env, body, clientUserId, me.id)
  return c.json({ ok: true, id }, 201)
})

cleaningPropertyAdminRoutes.patch('/cleaning/properties/:id', requireStaff, async (c) => {
  const id = c.req.param('id')!
  const exists = await c.env.DB.prepare('SELECT id FROM cleaning_property_profiles WHERE id=?').bind(id).first()
  if (!exists) return c.json({ error: 'Not found' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  await updateProfile(c.env, id, body)
  return c.json({ ok: true })
})

// Attach a property profile to an existing cleaning job.
cleaningPropertyAdminRoutes.post('/cleaning/jobs/:jobId/attach-property', requireStaff, async (c) => {
  const jobId = c.req.param('jobId')!
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const profileId = typeof body.profileId === 'string' ? body.profileId : null
  const job = await c.env.DB.prepare('SELECT id FROM cleaning_jobs WHERE id=?').bind(jobId).first()
  if (!job) return c.json({ error: 'Job not found' }, 404)
  if (profileId) {
    const prof = await c.env.DB.prepare('SELECT id FROM cleaning_property_profiles WHERE id=?').bind(profileId).first()
    if (!prof) return c.json({ error: 'Property not found' }, 404)
  }
  await c.env.DB.prepare("UPDATE cleaning_jobs SET property_profile_id=?, updated_at=datetime('now') WHERE id=?").bind(profileId, jobId).run()
  return c.json({ ok: true })
})

// Property instructions for a job. Staff always; the assigned vendor only while
// the job is theirs and not closed. This is how a cleaner gets the on-site
// instructions (including access) without browsing the client's properties.
cleaningPropertyAdminRoutes.get('/cleaning/jobs/:jobId/property', requireUser, async (c) => {
  const me = c.get('user')!
  const jobId = c.req.param('jobId')!
  const job = await c.env.DB.prepare('SELECT property_profile_id, assigned_vendor_user_id, status FROM cleaning_jobs WHERE id=?')
    .bind(jobId).first<{ property_profile_id: string | null; assigned_vendor_user_id: string | null; status: string }>()
  if (!job || !job.property_profile_id) return c.json({ property: null })
  const isStaff = me.role === 'staff' || me.role === 'admin'
  const assignedActive = job.assigned_vendor_user_id === me.id && !['completed', 'cancelled'].includes(job.status)
  if (!isStaff && !assignedActive) return c.json({ error: 'Not found' }, 404)
  const row = await c.env.DB.prepare(`${SELECT} WHERE id=?`).bind(job.property_profile_id).first<ProfileRow>()
  if (!row) return c.json({ property: null })
  return c.json({ property: view(row, true) })
})
