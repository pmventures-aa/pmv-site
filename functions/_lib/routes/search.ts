import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { scopeFilter } from '../scope'

// Global search across the entities staff look up most often. Each section
// runs its own small, indexed-friendly query rather than one giant UNION —
// simpler to scope per-entity (clients/matters/invoices are staff-visibility
// scoped via scopeFilter; inquiries aren't client-scoped, same as the
// existing /admin/inquiries list) and to reason about independently.
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
      `SELECT id, name, email, status FROM contact_inquiries
       WHERE archived_at IS NULL AND (name LIKE ? OR email LIKE ?)
       ORDER BY created_at DESC LIMIT ?`,
    ).bind(like, like, RESULT_LIMIT).all(),
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

  return c.json({
    clients: clients.results ?? [],
    inquiries: inquiries.results ?? [],
    matters: matters.results ?? [],
    invoices: invoices.results ?? [],
  })
})
