import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import type { AppEnv } from '../_lib/types'
import { getUser } from '../_lib/session'
import { requireUser } from '../_lib/mid'
import { authRoutes } from '../_lib/routes/auth'
import { selfRoutes } from '../_lib/routes/self'
import { portalRoutes } from '../_lib/routes/portal'
import { messageRoutes } from '../_lib/routes/messages'
import { adminRoutes } from '../_lib/routes/admin'
import { publicRoutes } from '../_lib/routes/public'
import { uploadRoutes } from '../_lib/routes/uploads'
import { deletionRoutes } from '../_lib/routes/deletion'
import { conversionRoutes } from '../_lib/routes/conversion'
import { auditRoutes } from '../_lib/routes/auditRoutes'
import { employeeRoutes } from '../_lib/routes/employees'
import { reportRoutes } from '../_lib/routes/reports'
import { searchRoutes } from '../_lib/routes/search'
import { serviceApplicationRoutes } from '../_lib/routes/serviceApplications'
import { intakeAdminRoutes } from '../_lib/routes/intakeAdmin'
import { intakeCopyRoutes } from '../_lib/routes/intakeCopy'

const app = new Hono<AppEnv>().basePath('/api')

app.route('/auth', authRoutes)
app.route('/', publicRoutes)
app.route('/', uploadRoutes)

app.get('/me', requireUser, (c) => c.json({ user: c.get('user') }))

app.route('/portal', intakeCopyRoutes)
app.route('/portal', serviceApplicationRoutes)
app.route('/portal', selfRoutes)
app.route('/portal', portalRoutes)
app.route('/portal', messageRoutes)

app.route('/admin', intakeAdminRoutes)
app.route('/admin', adminRoutes)
app.route('/admin', deletionRoutes)
app.route('/admin', conversionRoutes)
app.route('/admin', auditRoutes)
app.route('/admin', employeeRoutes)
app.route('/admin', reportRoutes)
app.route('/admin', searchRoutes)

app.get('/health', (c) => c.json({ ok: true, service: 'pmv-api', time: new Date().toISOString() }))

app.notFound((c) => c.json({ error: 'not found' }, 404))

app.onError((err, c) => {
  console.error('unhandled API error', err)
  return c.json({ error: 'internal error' }, 500)
})

export const onRequest = handle(app)

void getUser
