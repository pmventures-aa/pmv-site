import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { canAccessClient } from '../scope'

export const staffServicePrefillRoutes = new Hono<AppEnv>()

staffServicePrefillRoutes.get('/service-applications/:id/prefill-form', requireStaff, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')!
  const application = await c.env.DB.prepare(
    `SELECT sa.id, sa.client_user_id, sa.service_key, sa.status, sa.submission_source, sa.assigned_by_user_id,
            sa.assigned_at, sa.client_signature_name, sa.client_signed_at, s.name AS service_name,
            u.full_name AS client_name, u.email AS client_email
     FROM service_applications sa
     JOIN services s ON s.key = sa.service_key
     JOIN users u ON u.id = sa.client_user_id
     WHERE sa.id = ?`,
  ).bind(id).first<any>()
  if (!application) return c.json({ error: 'application not found' }, 404)
  if (!(await canAccessClient(c.env, user, application.client_user_id))) return c.json({ error: 'forbidden' }, 403)
  const [questions, answers] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, service_key, question_key, label, help_text, input_type, options, required, step_label, step_order, sort_order,
              show_if_question_key, show_if_operator, show_if_value, allow_multiple
       FROM onboarding_questions WHERE service_key = ? ORDER BY step_order, sort_order`,
    ).bind(application.service_key).all<any>(),
    c.env.DB.prepare(
      `SELECT question_key, value_json FROM service_application_answers WHERE application_id = ?`,
    ).bind(id).all<{ question_key: string; value_json: string }>(),
  ])
  const answerMap: Record<string, unknown> = {}
  for (const row of answers.results ?? []) {
    try { answerMap[row.question_key] = JSON.parse(row.value_json) } catch { answerMap[row.question_key] = row.value_json }
  }
  return c.json({ application, questions: questions.results ?? [], answers: answerMap })
})
