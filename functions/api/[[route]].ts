import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import type { AppEnv } from '../_lib/types'
import { getUser } from '../_lib/session'
import { requireUser } from '../_lib/mid'
import { authRoutes } from '../_lib/routes/auth'
import { selfRoutes } from '../_lib/routes/self'
import { portalRoutes } from '../_lib/routes/portal'
import { adminRoutes } from '../_lib/routes/admin'

const app = new Hono<AppEnv>().basePath('/api')

app.route('/auth', authRoutes)

app.get('/me', requireUser, (c) => c.json({ user: c.get('user') }))

// self-service (profile, onboarding, service catalog) — client accounts only
app.route('/portal', selfRoutes)
// shared data modules — client (self) + staff/admin (scoped via assignments)
app.route('/portal', portalRoutes)
// staff/admin console — cross-client views, user + settings management
app.route('/admin', adminRoutes)

app.get('/health', (c) => c.json({ ok: true, service: 'pmv-api', time: new Date().toISOString() }))

app.notFound((c) => c.json({ error: 'not found' }, 404))

export const onRequest = handle(app)

// keep getUser import used (re-exported nowhere else currently referenced directly)
void getUser
