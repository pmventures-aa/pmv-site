import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { scopeFilter } from '../scope'

// Global search across durable relationship/work records. Lead/prospect CRM
// records are not client-assignment scoped until conversion; client/work
// records keep the existing assignment scope.
export const searchRoutes = new Hono<AppEnv>()

const RESULT_LIMIT = 8

searchRoutes.get('/search', requireStaff, async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 2) return c.json({ clients: [], inquiries: [], matters: [], invoices: [] })
  const user = c.get('user')
  const like = `%${q}%`

  const clientScope = await scopeFilter(c.env, user, 'u.id')
  const matterScope = await scopeFilter(c.env, user, 'm.client_user_id')
  const invoiceScope = await scopeFilter(c.env, user, 'i.client_user_id')

  const [clients, inquiries, matters, invoices] = await Promise.all([
    c.env.DB.prepare(
      `SELECT u.id, u.full_name, u.email, cp.business_name
       FROM users u LEFT JOIN client_profiles cp ON cp.user_id = u.id
       WHERE u.role = 'client' AND ${clientScope.where}
         AND (u.full_name LIKE ? OR u.email LIKE ? OR cp.business_name LIKE ?)
       ORDER BY u.full_name LIMIT ?`,
    ).bind(...clientScope.params, like, like, like, RESULT_LIMIT).all(),
    c.env.DB.prepare(
      `SELECT id, name, email, phone, company_name, record_type, lifecycle_stage, status
       FROM contact_inquiries
       WHERE converted_at IS NULL AND archived_at IS NULL
         AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR company_name LIKE ?)
       ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ?`,
    ).bind(like, like, like, like, RESULT_LIMIT).all(),
    c.env.DB.prepare(
      `SELECT m.id, m.title, m.status, m.client_user_id, u.full_name AS client_name, u.email AS client_email
       FROM matters m JOIN users u ON u.id = m.client_user_id
       WHERE ${matterScope.where} AND m.title LIKE ?
       ORDER BY m.created_at DESC LIMIT ?`,
    ).bind(...matterScope.params, like, RESULT_LIMIT).all(),
    c.env.DB.prepare(
      `SELECT i.id, i.amount_cents, i.status, i.client_user_id, u.full_name AS client_name, u.email AS client_email
       FROM invoices i JOIN users u ON u.id = i.client_user_id
       WHERE ${invoiceScope.where} AND (u.full_name LIKE ? OR u.email LIKE ? OR i.id LIKE ?)
       ORDER BY i.created_at DESC LIMIT ?`,
    ).bind(...invoiceScope.params, like, like, like, RESULT_LIMIT).all(),
  ])

  return c.json({ clients: clients.results ?? [], inquiries: inquiries.results ?? [], matters: matters.results ?? [], invoices: invoices.results ?? [] })
})
