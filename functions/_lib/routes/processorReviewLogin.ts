import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { hasCapability } from '../capabilities'
import { logActivity } from '../activity'
import { processorReviewLoginStatus, stageProcessorReviewLogin } from '../processorReviewLogin'

export const processorReviewLoginRoutes = new Hono<AppEnv>()

processorReviewLoginRoutes.get('/processor-review-login', requireStaff, async (c) => {
  const user = c.get('user')
  if (!(await hasCapability(c.env, user, 'can_manage_users'))) return c.json({ error: 'forbidden' }, 403)
  return c.json(await processorReviewLoginStatus(c.env))
})

processorReviewLoginRoutes.post('/processor-review-login', requireStaff, async (c) => {
  const user = c.get('user')
  if (!(await hasCapability(c.env, user, 'can_manage_users'))) return c.json({ error: 'forbidden' }, 403)
  try {
    const result = await stageProcessorReviewLogin(c.env, user.id)
    await logActivity(c.env, {
      actorUserId: user.id,
      clientUserId: result.user_id,
      kind: 'user_created',
      detail: {
        email: result.email,
        role: 'client',
        processor_review_login: true,
        created: result.created,
        services: result.services,
      },
    })
    return c.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not stage the processor review login.'
    return c.json({ error: message }, 409)
  }
})
