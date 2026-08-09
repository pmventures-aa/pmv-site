import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireClient } from '../mid'

export const intakeCopyRoutes = new Hono<AppEnv>()

intakeCopyRoutes.get('/application-copy', requireClient, async (c) => {
  const keys = ['service_application_disclaimer', 'eviction_scope_disclaimer', 'service_application_contact_line']
  const ph = keys.map(() => '?').join(',')
  const res = await c.env.DB.prepare(`SELECT key, value FROM app_settings WHERE key IN (${ph})`).bind(...keys).all<{ key: string; value: string }>()
  const settings: Record<string, string> = {}
  for (const row of res.results ?? []) settings[row.key] = row.value
  return c.json({
    service_application_disclaimer: settings.service_application_disclaimer || 'Pinnacle Management Ventures provides professional support subject to review and a final written service agreement.',
    eviction_scope_disclaimer: settings.eviction_scope_disclaimer || 'Eviction-related work is subject to legal and scope review and may require attorney coordination.',
    service_application_contact_line: settings.service_application_contact_line || 'Pinnacle Management Ventures | pinnaclemanagementventures.com',
  })
})
