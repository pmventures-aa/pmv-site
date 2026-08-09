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
import { unsubscribeRoutes } from '../_lib/routes/unsubscribe'
import { deletionRoutes } from '../_lib/routes/deletion'
import { conversionRoutes } from '../_lib/routes/conversion'
import { auditRoutes } from '../_lib/routes/auditRoutes'
import { employeeRoutes } from '../_lib/routes/employees'
import { reportRoutes } from '../_lib/routes/reports'
import { searchRoutes } from '../_lib/routes/search'
import { commsRoutes } from '../_lib/routes/comms'
import { crmRoutes } from '../_lib/routes/crm'
import { crmWriteRoutes } from '../_lib/routes/crmWrites'
import { serviceApplicationRoutes } from '../_lib/routes/serviceApplications'
import { intakeCatalogAdminRoutes } from '../_lib/routes/intakeCatalogAdmin'
import { intakeCopyRoutes } from '../_lib/routes/intakeCopy'
import { accountEmailsAdminRoutes } from '../_lib/routes/accountEmailsAdmin'
import { resendWebhookRoutes } from '../_lib/routes/resendWebhooks'
import { staffServiceAssignmentRoutes, clientApplicationSignatureRoutes } from '../_lib/routes/staffServiceAssignments'
import { staffServicePrefillRoutes } from '../_lib/routes/staffServicePrefill'
import { invoiceAdminRoutes } from '../_lib/routes/invoiceAdmin'
import { signaturePortalSyncRoutes, signatureAdminSyncRoutes } from '../_lib/routes/signaturePdfSync'

const app = new Hono<AppEnv>().basePath('/api')

app.route('/auth', authRoutes)
app.route('/', publicRoutes)
app.route('/', uploadRoutes)
app.route('/', unsubscribeRoutes)
app.route('/', resendWebhookRoutes)

app.get('/me', requireUser, (c) => c.json({ user: c.get('user') }))

app.route('/portal', intakeCopyRoutes)
// Signature sync wraps signing/edit calls; signature enforcement wraps submit.
app.route('/portal', signaturePortalSyncRoutes)
app.route('/portal', clientApplicationSignatureRoutes)
app.route('/portal', serviceApplicationRoutes)
app.route('/portal', selfRoutes)
app.route('/portal', portalRoutes)
app.route('/portal', messageRoutes)

app.route('/admin', intakeCatalogAdminRoutes)
app.route('/admin', accountEmailsAdminRoutes)
app.route('/admin', signatureAdminSyncRoutes)
app.route('/admin', staffServiceAssignmentRoutes)
app.route('/admin', staffServicePrefillRoutes)
app.route('/admin', invoiceAdminRoutes)
app.route('/admin', adminRoutes)
app.route('/admin', deletionRoutes)
app.route('/admin', conversionRoutes)
app.route('/admin', auditRoutes)
app.route('/admin', employeeRoutes)
app.route('/admin', reportRoutes)
app.route('/admin', searchRoutes)
app.route('/admin', commsRoutes)
app.route('/admin', crmWriteRoutes)
app.route('/admin', crmRoutes)

app.get('/health', (c) => c.json({ ok: true, service: 'pmv-api', time: new Date().toISOString() }))

app.notFound((c) => c.json({ error: 'not found' }, 404))

app.onError((err, c) => {
  console.error('unhandled API error', err)
  return c.json({ error: 'internal error' }, 500)
})

export const onRequest = handle(app)

void getUser
