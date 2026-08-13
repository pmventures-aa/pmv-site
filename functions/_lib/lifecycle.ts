import type { Env } from './types'
import { nextLifecycle } from '../../shared/lifecycle'

export { nextLifecycle } from '../../shared/lifecycle'

export async function advanceInquiryLifecycle(env: Env, input: { userId?: string | null; inquiryId?: string | null; email?: string | null; target: string }) {
  const target = input.target
  if (input.inquiryId) {
    const row = await env.DB.prepare('SELECT id, lifecycle_stage FROM contact_inquiries WHERE id = ?').bind(input.inquiryId).first<{ id: string; lifecycle_stage: string | null }>()
    if (!row) return
    const next = nextLifecycle(row.lifecycle_stage, target)
    if (next === row.lifecycle_stage) return
    await env.DB.prepare("UPDATE contact_inquiries SET lifecycle_stage = ?, updated_at = datetime('now') WHERE id = ?").bind(next, row.id).run()
    return
  }

  if (input.userId) {
    const rows = await env.DB.prepare(
      "SELECT id, lifecycle_stage FROM contact_inquiries WHERE client_user_id = ? AND archived_at IS NULL AND converted_at IS NULL",
    ).bind(input.userId).all<{ id: string; lifecycle_stage: string | null }>()
    const matched = rows.results || []
    if (matched.length) {
      for (const row of matched) {
        const next = nextLifecycle(row.lifecycle_stage, target)
        if (next !== row.lifecycle_stage) {
          await env.DB.prepare("UPDATE contact_inquiries SET lifecycle_stage = ?, updated_at = datetime('now') WHERE id = ?").bind(next, row.id).run()
        }
      }
      return
    }
  }

  let email = input.email || null
  if (!email && input.userId) {
    const user = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(input.userId).first<{ email: string }>()
    email = user?.email || null
  }
  if (!email) return
  const row = await env.DB.prepare(
    "SELECT id, lifecycle_stage FROM contact_inquiries WHERE lower(email) = lower(?) AND archived_at IS NULL AND converted_at IS NULL ORDER BY created_at DESC LIMIT 1",
  ).bind(email).first<{ id: string; lifecycle_stage: string | null }>()
  if (!row) return
  const next = nextLifecycle(row.lifecycle_stage, target)
  if (next === row.lifecycle_stage) return
  await env.DB.prepare("UPDATE contact_inquiries SET lifecycle_stage = ?, updated_at = datetime('now') WHERE id = ?").bind(next, row.id).run()
}
