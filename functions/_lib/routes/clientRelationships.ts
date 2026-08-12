import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { canAccessClient } from '../scope'
import { uuid } from '../crypto'
import { toDisplayCase } from '../../../shared/displayCase'
import { requireNamedPermission } from '../capabilities'

export const clientRelationshipRoutes = new Hono<AppEnv>()

const RELATION_TYPES = new Set(['spouse','partner','household_member','business_partner','primary_contact','contact','principal','owner','authorized_representative','other'])

function text(value: unknown, max = 300): string {
  return typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, max) : ''
}
function email(value: unknown): string { return text(value, 254).toLowerCase() }

async function requireClientAccess(c: any): Promise<string | Response> {
  const clientId = c.req.param('id') || ''
  if (!(await canAccessClient(c.env, c.get('user'), clientId))) return c.json({ error: 'forbidden' }, 403)
  return clientId
}

async function ensurePrimaryPerson(c: any, clientId: string): Promise<string> {
  const existing = await c.env.DB.prepare(
    `SELECT ap.party_id FROM account_parties ap JOIN relationship_parties p ON p.id=ap.party_id
     WHERE ap.user_id=? AND ap.is_primary=1 AND p.party_type='person'`,
  ).bind(clientId).first()
  if (existing?.party_id) return existing.party_id
  const user = await c.env.DB.prepare('SELECT email,full_name,first_name,last_name,phone FROM users WHERE id=?').bind(clientId).first()
  if (!user) throw new Error('client not found')
  const id = uuid(), display = toDisplayCase(user.full_name || `${user.first_name || ''} ${user.last_name || ''}`) || user.email
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO relationship_parties(id,party_type,display_name,email,phone,created_by_user_id) VALUES (?,?,?,?,?,?)').bind(id, 'person', display, user.email, user.phone, c.get('user').id),
    c.env.DB.prepare('INSERT INTO relationship_people(party_id,first_name,last_name) VALUES (?,?,?)').bind(id, toDisplayCase(user.first_name) || null, toDisplayCase(user.last_name) || null),
    c.env.DB.prepare("INSERT INTO account_parties(user_id,party_id,access_role,is_primary) VALUES (?,?,'self',1)").bind(clientId, id),
    c.env.DB.prepare('UPDATE client_profiles SET primary_party_id=? WHERE user_id=?').bind(id, clientId),
  ])
  return id
}

clientRelationshipRoutes.get('/clients/:id/relationships', requireStaff, async (c) => {
  const access = await requireClientAccess(c)
  if (access instanceof Response) return access
  const clientId = access
  const primaryPartyId = await ensurePrimaryPerson(c, clientId)
  const [parties, links, matters, accounts] = await Promise.all([
    c.env.DB.prepare(
      `WITH connected AS (
         SELECT party_id id FROM account_parties WHERE user_id=?
         UNION SELECT from_party_id FROM party_relationships WHERE to_party_id IN (SELECT party_id FROM account_parties WHERE user_id=?)
         UNION SELECT to_party_id FROM party_relationships WHERE from_party_id IN (SELECT party_id FROM account_parties WHERE user_id=?)
         UNION SELECT business_party_id FROM client_profiles WHERE user_id=? AND business_party_id IS NOT NULL
       )
       SELECT p.*,rp.first_name,rp.middle_name,rp.last_name,rp.title,
              rb.legal_name,rb.dba_name,rb.entity_type,rb.ein,rb.state,rb.primary_contact_party_id,
              CASE WHEN ap.user_id IS NOT NULL THEN 1 ELSE 0 END has_account_access,
              ap.user_id linked_user_id,ap.access_role
       FROM relationship_parties p
       LEFT JOIN relationship_people rp ON rp.party_id=p.id
       LEFT JOIN relationship_businesses rb ON rb.party_id=p.id
       LEFT JOIN account_parties ap ON ap.party_id=p.id
       WHERE p.id IN (SELECT id FROM connected) ORDER BY p.party_type,p.display_name`,
    ).bind(clientId, clientId, clientId, clientId).all(),
    c.env.DB.prepare(
      `SELECT pr.*,f.display_name from_name,t.display_name to_name
       FROM party_relationships pr JOIN relationship_parties f ON f.id=pr.from_party_id JOIN relationship_parties t ON t.id=pr.to_party_id
       WHERE pr.from_party_id IN (SELECT party_id FROM account_parties WHERE user_id=?)
          OR pr.to_party_id IN (SELECT party_id FROM account_parties WHERE user_id=?)
       ORDER BY pr.created_at DESC`,
    ).bind(clientId, clientId).all(),
    c.env.DB.prepare(
      `SELECT m.id,m.title,m.type,m.status,m.due_date,mp.party_id,mp.matter_role,mp.is_primary,p.display_name,p.party_type
       FROM matters m LEFT JOIN matter_parties mp ON mp.matter_id=m.id LEFT JOIN relationship_parties p ON p.id=mp.party_id
       WHERE m.client_user_id=? ORDER BY m.created_at DESC,p.display_name`,
    ).bind(clientId).all(),
    c.env.DB.prepare(
      `SELECT u.id,u.full_name,u.email FROM users u WHERE u.role='client'
       AND (u.id=? OR u.id IN (SELECT user_id FROM account_parties WHERE party_id IN (
         SELECT from_party_id FROM party_relationships WHERE to_party_id=?
         UNION SELECT to_party_id FROM party_relationships WHERE from_party_id=?
       ))) ORDER BY u.full_name,u.email`,
    ).bind(clientId, primaryPartyId, primaryPartyId).all(),
  ])
  return c.json({ primary_party_id: primaryPartyId, parties: parties.results || [], relationships: links.results || [], matter_parties: matters.results || [], linked_accounts: accounts.results || [] })
})

clientRelationshipRoutes.get('/relationship-parties/search', requireStaff, requireNamedPermission('manage_users'), async (c) => {
  const query = text(c.req.query('q'), 120)
  if (query.length < 2) return c.json({ parties: [] })
  const like = `%${query}%`
  const rows = await c.env.DB.prepare(
    `SELECT p.id,p.party_type,p.display_name,p.email,p.phone,ap.user_id linked_user_id
     FROM relationship_parties p LEFT JOIN account_parties ap ON ap.party_id=p.id
     WHERE p.status='active' AND (p.display_name LIKE ? OR p.email LIKE ?) ORDER BY p.display_name LIMIT 30`,
  ).bind(like, like).all()
  return c.json({ parties: rows.results || [] })
})

clientRelationshipRoutes.post('/clients/:id/relationships/people', requireStaff, async (c) => {
  const access = await requireClientAccess(c); if (access instanceof Response) return access
  const clientId = access, actor = c.get('user'), body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>))
  const primary = await ensurePrimaryPerson(c, clientId)
  const first = toDisplayCase(body.first_name), last = toDisplayCase(body.last_name)
  const name = toDisplayCase(body.display_name) || [first,last].filter(Boolean).join(' ')
  if (!name) return c.json({ error: 'person name is required' }, 400)
  const relation = RELATION_TYPES.has(String(body.relationship_type)) ? String(body.relationship_type) : 'other'
  const id = uuid(), relationshipId = uuid()
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO relationship_parties(id,party_type,display_name,email,phone,created_by_user_id) VALUES (?,?,?,?,?,?)').bind(id, 'person', name, email(body.email)||null, text(body.phone,60)||null, actor.id),
    c.env.DB.prepare('INSERT INTO relationship_people(party_id,first_name,last_name,title) VALUES (?,?,?,?)').bind(id,first||null,last||null,toDisplayCase(body.title)||null),
    c.env.DB.prepare('INSERT INTO party_relationships(id,from_party_id,to_party_id,relationship_type,label,notes,created_by_user_id) VALUES (?,?,?,?,?,?,?)').bind(relationshipId,primary,id,relation,toDisplayCase(body.label)||null,text(body.notes,2000)||null,actor.id),
  ])
  return c.json({ ok: true, party_id: id, relationship_id: relationshipId }, 201)
})

clientRelationshipRoutes.post('/clients/:id/relationships/businesses', requireStaff, async (c) => {
  const access = await requireClientAccess(c); if (access instanceof Response) return access
  const clientId = access, actor = c.get('user'), body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>))
  const legalName = toDisplayCase(body.legal_name)
  const contactId = text(body.primary_contact_party_id, 100) || await ensurePrimaryPerson(c, clientId)
  if (!legalName) return c.json({ error: 'business legal name is required' }, 400)
  const contact = await c.env.DB.prepare("SELECT id FROM relationship_parties WHERE id=? AND party_type='person' AND status='active'").bind(contactId).first()
  if (!contact) return c.json({ error: 'every business requires an active contact person' }, 400)
  const id = uuid()
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO relationship_parties(id,party_type,display_name,email,phone,created_by_user_id) VALUES (?,?,?,?,?,?)').bind(id, 'business', legalName, email(body.email)||null, text(body.phone,60)||null, actor.id),
    c.env.DB.prepare('INSERT INTO relationship_businesses(party_id,legal_name,dba_name,entity_type,ein,state,primary_contact_party_id) VALUES (?,?,?,?,?,?,?)').bind(id,legalName,toDisplayCase(body.dba_name)||null,toDisplayCase(body.entity_type)||null,text(body.ein,100)||null,toDisplayCase(body.state)||null,contactId),
    c.env.DB.prepare("INSERT INTO party_relationships(id,from_party_id,to_party_id,relationship_type,label,created_by_user_id) VALUES (?,?,?,'primary_contact','Primary Contact',?)").bind(uuid(),contactId,id,actor.id),
  ])
  if (body.make_profile_business === true) {
    await c.env.DB.prepare('UPDATE client_profiles SET business_party_id=?,business_name=?,entity_type=?,ein=?,state=? WHERE user_id=?').bind(id,legalName,toDisplayCase(body.entity_type)||null,text(body.ein,100)||null,toDisplayCase(body.state)||null,clientId).run()
  }
  return c.json({ ok: true, party_id: id }, 201)
})

clientRelationshipRoutes.post('/clients/:id/relationships/link', requireStaff, async (c) => {
  const access = await requireClientAccess(c); if (access instanceof Response) return access
  const primary = await ensurePrimaryPerson(c, access), actor = c.get('user'), body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>))
  const partyId = text(body.party_id, 100), relation = RELATION_TYPES.has(String(body.relationship_type)) ? String(body.relationship_type) : 'other'
  if (!partyId || partyId === primary) return c.json({ error: 'choose another person or business' }, 400)
  const party = await c.env.DB.prepare("SELECT id FROM relationship_parties WHERE id=? AND status='active'").bind(partyId).first()
  if (!party) return c.json({ error: 'relationship record not found' }, 404)
  await c.env.DB.prepare('INSERT OR IGNORE INTO party_relationships(id,from_party_id,to_party_id,relationship_type,label,notes,created_by_user_id) VALUES (?,?,?,?,?,?,?)').bind(uuid(),primary,partyId,relation,toDisplayCase(body.label)||null,text(body.notes,2000)||null,actor.id).run()
  return c.json({ ok: true })
})

clientRelationshipRoutes.get('/client-accounts/search', requireStaff, requireNamedPermission('manage_users'), async (c) => {
  const query = text(c.req.query('q'), 120)
  if (query.length < 2) return c.json({ accounts: [] })
  const like = `%${query}%`
  const rows = await c.env.DB.prepare(
    `SELECT u.id,u.full_name,u.email,cp.business_name FROM users u LEFT JOIN client_profiles cp ON cp.user_id=u.id
     WHERE u.role='client' AND u.status='active' AND (u.full_name LIKE ? OR u.email LIKE ? OR cp.business_name LIKE ?)
     ORDER BY u.full_name,u.email LIMIT 30`,
  ).bind(like,like,like).all()
  return c.json({ accounts: rows.results || [] })
})

clientRelationshipRoutes.post('/relationship-parties/:partyId/accounts', requireStaff, requireNamedPermission('manage_users'), async (c) => {
  const actor = c.get('user'), body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>)), userId = text(body.user_id, 100)
  const [party,user] = await Promise.all([
    c.env.DB.prepare('SELECT id,party_type FROM relationship_parties WHERE id=?').bind(c.req.param('partyId')).first(),
    c.env.DB.prepare("SELECT id FROM users WHERE id=? AND role='client'").bind(userId).first(),
  ])
  if (!party || !user) return c.json({ error: 'person/business or client account not found' }, 404)
  await c.env.DB.prepare('INSERT OR IGNORE INTO account_parties(user_id,party_id,access_role,is_primary) VALUES (?,?,?,0)').bind(userId,party.id,party.party_type==='business'?'authorized_user':'self').run()
  void actor
  return c.json({ ok: true })
})

clientRelationshipRoutes.post('/clients/:id/matters/:matterId/parties', requireStaff, async (c) => {
  const access = await requireClientAccess(c); if (access instanceof Response) return access
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>)), partyId = text(body.party_id, 100), role = toDisplayCase(body.matter_role || 'Client').slice(0,100)
  const matter = await c.env.DB.prepare('SELECT id FROM matters WHERE id=? AND client_user_id=?').bind(c.req.param('matterId'), access).first()
  const party = await c.env.DB.prepare('SELECT id FROM relationship_parties WHERE id=?').bind(partyId).first()
  if (!matter || !party) return c.json({ error: 'matter or relationship record not found' }, 404)
  await c.env.DB.prepare('INSERT OR REPLACE INTO matter_parties(matter_id,party_id,matter_role,is_primary,added_by_user_id) VALUES (?,?,?,?,?)').bind(c.req.param('matterId'),partyId,role||'Client',body.is_primary===true?1:0,c.get('user').id).run()
  return c.json({ ok: true })
})
