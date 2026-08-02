import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import type { AppEnv } from '../_lib/types'
import { getUser } from '../_lib/session'
import { requireUser } from '../_lib/mid'
import { authRoutes } from '../_lib/routes/auth'
import { selfRoutes } from '../_lib/routes/self'
import { portalRoutes } from '../_lib/routes/portal'
import { adminRoutes } from '../_lib/routes/admin'
import { publicRoutes } from '../_lib/routes/public'

const app = new Hono<AppEnv>().basePath('/api')

app.route('/auth', authRoutes)
app.route('/', publicRoutes)

app.get('/me', requireUser, (c) => c.json({ user: c.get('user') }))

// self-service (profile, onboarding, service catalog) — client accounts only
app.route('/portal', selfRoutes)
// shared data modules — client (self) + staff/admin (scoped via assignments)
app.route('/portal', portalRoutes)
// staff/admin console — cross-client views, user + settings management
app.route('/admin', adminRoutes)

app.get('/health', (c) => c.json({ ok: true, service: 'pmv-api', time: new Date().toISOString() }))

app.notFound((c) => c.json({ error: 'not found' }, 404))

// global error handler — surfaces the real exception as JSON instead of
// Cloudflare's opaque plain-text 500 page. TEMPORARY: includes err.stack
// for diagnosis; tighten before long-term retention if stack traces are
// considered sensitive.
app.onError((err, c) => {
  console.error('unhandled API error', err)
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack : undefined
  return c.json({ error: message, stack }, 500)
})

export const onRequest = handle(app)

// keep getUser import used (re-exported nowhere else currently referenced directly)
void getUser
