import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireClient, requireStaff } from '../mid'
import { uuid } from '../crypto'
import { canAccessClient } from '../scope'

export const signaturePortalSyncRoutes = new Hono<AppEnv>()
export const signatureAdminSyncRoutes = new Hono<AppEnv>()

const NAME_KEY = '__pmv_signature_name__'
const DATE_KEY = '__pmv_signature_signed_at__'

async function clearSignatureAnswers(env: AppEnv['Bindings'], applicationId: string) {
  await env.DB.prepare(
    `DELETE FROM service_application_answers WHERE application_id = ? AND question_key IN (?, ?)`,
  ).bind(applicationId, NAME_KEY, DATE_KEY).run()
}

async function storeSignatureAnswers(env: AppEnv['Bindings'], applicationId: string, name: string, signedAt: string) {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO service_application_answers
        (id, application_id, question_id, question_key, question_label, step_label, step_order, sort_order, value_json, updated_at)
       VALUES (?, ?, NULL, ?, 'Signed by', 'Client electronic signature', 9998, 1, ?, datetime('now'))
       ON CONFLICT(application_id, question_key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`,
    ).bind(uuid(), applicationId, NAME_KEY, JSON.stringify(name)),
    env.DB.prepare(
      `INSERT INTO service_application_answers
        (id, application_id, question_id, question_key, question_label, step_label, step_order, sort_order, value_json, updated_at)
       VALUES (?, ?, NULL, ?, 'Signed at', 'Client electronic signature', 9998, 2, ?, datetime('now'))
       ON CONFLICT(application_id, question_key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`,
    ).bind(uuid(), applicationId, DATE_KEY, JSON.stringify(signedAt)),
  ])
}

// Wrap the existing signing route: it remains authoritative for identity/IP/UA,
// then we mirror just name/date into the answer stream consumed by the PDF.
signaturePortalSyncRoutes.use('/service-applications/:id/sign', requireClient, async (c, next) => {
  await next()
  if (c.res.status >= 400) return
  const id = c.req.param('id')!
  const row = await c.env.DB.prepare(
    `SELECT client_user_id, client_signature_name, client_signed_at FROM service_applications WHERE id = ?`,
  ).bind(id).first<any>()
  if (row?.client_user_id === c.get('user').id && row.client_signature_name && row.client_signed_at) {
    await storeSignatureAnswers(c.env, id, row.client_signature_name, row.client_signed_at)
  }
})

signaturePortalSyncRoutes.use('/service-applications/:id', requireClient, async (c, next) => {
  await next()
  if (c.req.method === 'PATCH' && c.res.status < 400) await clearSignatureAnswers(c.env, c.req.param('id')!)
})

signaturePortalSyncRoutes.use('/service-applications/:id/files/*', requireClient, async (c, next) => {
  await next()
  if ((c.req.method === 'POST' || c.req.method === 'DELETE') && c.res.status < 400) await clearSignatureAnswers(c.env, c.req.param('id')!)
})

// Staff prefill changes also invalidate the mirrored signature.
signatureAdminSyncRoutes.use('/service-applications/:id/prefill', requireStaff, async (c, next) => {
  const actor = c.get('user')
  const app = await c.env.DB.prepare(`SELECT client_user_id FROM service_applications WHERE id = ?`).bind(c.req.param('id')!).first<any>()
  if (!app || !(await canAccessClient(c.env, actor, app.client_user_id))) return c.json({ error: 'forbidden' }, 403)
  await next()
  if (c.res.status < 400) await clearSignatureAnswers(c.env, c.req.param('id')!)
})
