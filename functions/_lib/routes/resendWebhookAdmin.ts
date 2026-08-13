import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { requireCapability } from '../capabilities'
import { logActivity } from '../activity'
import { ensureResendWebhook, readResendWebhookStatus } from '../resendWebhookSetup'

export const resendWebhookAdminRoutes = new Hono<AppEnv>()

resendWebhookAdminRoutes.get('/resend-webhook', requireStaff, async (c) => {
  try {
    return c.json(await readResendWebhookStatus(c.env))
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Could not read Resend webhooks.' }, 502)
  }
})

resendWebhookAdminRoutes.post('/resend-webhook', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  try {
    const result = await ensureResendWebhook(c.env)
    await logActivity(c.env, {
      actorUserId: c.get('user').id,
      kind: 'resend_webhook_setup',
      detail: {
        action: result.action,
        webhook_id: result.status.webhook?.id || null,
        ready: result.status.ready,
      },
    })
    return c.json(result)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Could not create the Resend webhook.' }, 502)
  }
})
