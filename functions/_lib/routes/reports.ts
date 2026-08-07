import { Hono } from 'hono'
import type { AppEnv, SessionUser } from '../types'
import { requireStaff } from '../mid'
import { requireCapability } from '../capabilities'
import { visibleClientIds } from '../access'
import { REPORTS, REPORTS_BY_KEY, type ReportCtx, type ReportDef, type ReportResult } from '../reportRegistry'
import { csvResponse } from '../csv'
import { uuid } from '../crypto'

export const reportRoutes = new Hono<AppEnv>()

function dateRange(c: { req: { query(key: string): string | undefined } }): { from: string; to: string } {
  const now = new Date()
  const defaultTo = now.toISOString().slice(0, 10)
  const defaultFrom = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
  const from = c.req.query('from') || defaultFrom
  const to = c.req.query('to') || defaultTo
  return { from: `${from} 00:00:00`, to: `${to} 23:59:59` }
}

// Employee-category reports expose every staff member's name and
// firm-wide performance data — unlike Business/Client/Operations, that's
// Admin/Owner only, same restriction as the Employees page itself
// (functions/_lib/routes/employees.ts), not delegable via can_view_reports.
function canRunReport(user: SessionUser, def: ReportDef): boolean {
  return def.category !== 'employee' || user.role === 'admin'
}

reportRoutes.get('/reports/catalog', requireStaff, requireCapability('can_view_reports'), async (c) => {
  const user = c.get('user')
  const reports = REPORTS.filter((r) => canRunReport(user, r))
  return c.json({ reports: reports.map(({ key, label, category, description }) => ({ key, label, category, description })) })
})

reportRoutes.get('/reports/:key', requireStaff, requireCapability('can_view_reports'), async (c) => {
  const key = c.req.param('key')!
  const def = REPORTS_BY_KEY[key]
  if (!def) return c.json({ error: 'unknown report' }, 404)
  const user = c.get('user')
  if (!canRunReport(user, def)) return c.json({ error: 'forbidden' }, 403)
  const { from, to } = dateRange(c)
  const ctx: ReportCtx = { env: c.env, from, to, clientIds: await visibleClientIds(c.env, user) }
  const result = await def.run(ctx)
  return c.json({ key, label: def.label, from, to, ...result })
})

reportRoutes.get('/reports/:key/export.csv', requireStaff, requireCapability('can_view_reports'), async (c) => {
  const key = c.req.param('key')!
  const def = REPORTS_BY_KEY[key]
  if (!def) return c.json({ error: 'unknown report' }, 404)
  const user = c.get('user')
  if (!canRunReport(user, def)) return c.json({ error: 'forbidden' }, 403)
  const { from, to } = dateRange(c)
  const ctx: ReportCtx = { env: c.env, from, to, clientIds: await visibleClientIds(c.env, user) }
  const result: ReportResult = await def.run(ctx)
  const rows = result.rows.map((r) => result.columns.map((col) => r[col.key]))
  return csvResponse(`${key}.csv`, result.columns.map((col) => col.label), rows)
})

// ---------------- saved report templates ----------------

reportRoutes.get('/report-templates', requireStaff, requireCapability('can_view_reports'), async (c) => {
  const user = c.get('user')
  const res = await c.env.DB.prepare('SELECT * FROM report_templates WHERE created_by = ? ORDER BY created_at DESC').bind(user.id).all()
  return c.json({ templates: res.results ?? [] })
})

reportRoutes.post('/report-templates', requireStaff, requireCapability('can_view_reports'), async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ name?: string; report_key?: string; filters?: Record<string, unknown>; schedule_cron?: string }>().catch(() => ({}) as any)
  const name = (body.name || '').trim().slice(0, 200)
  if (!name) return c.json({ error: 'name is required' }, 400)
  const def = body.report_key ? REPORTS_BY_KEY[body.report_key] : undefined
  if (!def) return c.json({ error: 'unknown report' }, 400)
  if (!canRunReport(user, def)) return c.json({ error: 'forbidden' }, 403)
  const id = uuid()
  await c.env.DB.prepare(
    'INSERT INTO report_templates (id, name, report_key, filters_json, schedule_cron, created_by) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(id, name, body.report_key, JSON.stringify(body.filters ?? {}), body.schedule_cron ?? null, user.id).run()
  return c.json({ ok: true, id }, 201)
})

reportRoutes.delete('/report-templates/:id', requireStaff, requireCapability('can_view_reports'), async (c) => {
  const user = c.get('user')
  await c.env.DB.prepare('DELETE FROM report_templates WHERE id = ? AND created_by = ?').bind(c.req.param('id'), user.id).run()
  return c.json({ ok: true })
})

// Manual "run now" for a saved template — always available regardless of
// whether it's scheduled. Cloudflare Pages Functions don't run on a Cron
// Trigger the way a plain Worker does, so automatic scheduled delivery
// (email/R2 export on schedule_cron) isn't wired up in this pass — see
// docs/crm-expansion-design.md's scalability section. This endpoint is
// the fully-working part: re-run the saved filters on demand.
reportRoutes.post('/report-templates/:id/run', requireStaff, requireCapability('can_view_reports'), async (c) => {
  const user = c.get('user')
  const template = await c.env.DB.prepare('SELECT * FROM report_templates WHERE id = ? AND created_by = ?').bind(c.req.param('id'), user.id).first<any>()
  if (!template) return c.json({ error: 'not found' }, 404)
  const def = REPORTS_BY_KEY[template.report_key]
  if (!def) return c.json({ error: 'unknown report' }, 400)
  if (!canRunReport(user, def)) return c.json({ error: 'forbidden' }, 403)
  const filters = JSON.parse(template.filters_json || '{}')
  const { from, to } = dateRange({ req: { query: (k: string) => filters[k] } })
  const ctx: ReportCtx = { env: c.env, from, to, clientIds: await visibleClientIds(c.env, user) }
  const runId = uuid()
  try {
    const result = await def.run(ctx)
    await c.env.DB.prepare(
      "INSERT INTO scheduled_report_runs (id, template_id, status, run_at) VALUES (?, ?, 'succeeded', datetime('now'))",
    ).bind(runId, template.id).run()
    return c.json({ key: template.report_key, label: def.label, from, to, ...result })
  } catch (err) {
    await c.env.DB.prepare(
      "INSERT INTO scheduled_report_runs (id, template_id, status, error, run_at) VALUES (?, ?, 'failed', ?, datetime('now'))",
    ).bind(runId, template.id, err instanceof Error ? err.message : 'unknown error').run()
    return c.json({ error: 'this report failed to run' }, 500)
  }
})

reportRoutes.get('/report-templates/:id/runs', requireStaff, requireCapability('can_view_reports'), async (c) => {
  const res = await c.env.DB.prepare('SELECT * FROM scheduled_report_runs WHERE template_id = ? ORDER BY run_at DESC LIMIT 20').bind(c.req.param('id')).all()
  return c.json({ runs: res.results ?? [] })
})
