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
import { uploadRoutes } from '../_lib/routes/uploads'
import { deletionRoutes } from '../_lib/routes/deletion'
import { conversionRoutes } from '../_lib/routes/conversion'
import { auditRoutes } from '../_lib/routes/auditRoutes'
import { employeeRoutes } from '../_lib/routes/employees'
import { reportRoutes } from '../_lib/routes/reports'

const app = new Hono<AppEnv>().basePath('/api')

app.route('/auth', authRoutes)
app.route('/', publicRoutes)
app.route('/', uploadRoutes)

app.get('/me', requireUser, (c) => c.json({ user: c.get('user') }))

// self-service (profile, onboarding, service catalog) — client accounts only
app.route('/portal', selfRoutes)
// shared data modules — client (self) + staff/admin (scoped via assignments)
app.route('/portal', portalRoutes)
// staff/admin console — cross-client views, user + settings management
app.route('/admin', adminRoutes)
app.route('/admin', deletionRoutes)
app.route('/admin', conversionRoutes)
app.route('/admin', auditRoutes)
app.route('/admin', employeeRoutes)
app.route('/admin', reportRoutes)

app.get('/health', (c) => c.json({ ok: true, service: 'pmv-api', time: new Date().toISOString() }))

app.notFound((c) => c.json({ error: 'not found' }, 404))

// Global error handler — surfaces unhandled exceptions as JSON instead of
// Cloudflare's opaque plain-text 500 page. Logs the full error (incl.
// stack and message) server-side via console.error, but only returns a
// generic message in the response body — the real message may contain
// internal details (query text, file paths) that shouldn't reach callers.
app.onError((err, c) => {
  console.error('unhandled API error', err)
  return c.json({ error: 'internal error' }, 500)
})

export const onRequest = handle(app)

// keep getUser import used (re-exported nowhere else currently referenced directly)
void getUser
