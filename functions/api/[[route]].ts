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
import { reportExportRoutes } from '../_lib/routes/reportExports'
import { scheduledReportRoutes } from '../_lib/routes/scheduledReportRoutes'
import { managementInsightRoutes } from '../_lib/routes/managementInsights'
import { searchRoutes } from '../_lib/routes/search'
import { commsRoutes } from '../_lib/routes/comms'
import { crmRoutes } from '../_lib/routes/crm'
import { crmWriteRoutes } from '../_lib/routes/crmWrites'
import { serviceApplicationRoutes } from '../_lib/routes/serviceApplications'
import { serviceOfferingApplicationRoutes } from '../_lib/routes/serviceOfferingApplications'
import { intakeCatalogAdminRoutes } from '../_lib/routes/intakeCatalogAdmin'
import { intakeCopyRoutes } from '../_lib/routes/intakeCopy'
import { accountEmailsAdminRoutes } from '../_lib/routes/accountEmailsAdmin'
import { resendWebhookRoutes } from '../_lib/routes/resendWebhooks'
import { staffServiceAssignmentRoutes, clientApplicationSignatureRoutes } from '../_lib/routes/staffServiceAssignments'
import { staffServicePrefillRoutes } from '../_lib/routes/staffServicePrefill'
import { invoiceAdminRoutes } from '../_lib/routes/invoiceAdmin'
import { signaturePortalSyncRoutes, signatureAdminSyncRoutes } from '../_lib/routes/signaturePdfSync'
import { invitationPublicRoutes } from '../_lib/routes/invitationPublic'
import { trustedContactRoutes } from '../_lib/routes/trustedContacts'
import { invitationAdminRoutes, roleAdminRoutes } from '../_lib/routes/invitationAdmin'
import { bulkInvitationRoutes } from '../_lib/routes/bulkInvitations'
import { roleCapabilityRoutes } from '../_lib/routes/roleCapabilities'
import { inviteCompletionRoutes } from '../_lib/routes/inviteCompletion'
import { teamManagementRoutes } from '../_lib/routes/teamManagement'
import { vendorApplicationUploadRoutes } from '../_lib/routes/vendorApplicationUploads'
import { serviceOfferingPublicRoutes, serviceOfferingAdminRoutes } from '../_lib/routes/serviceOfferings'
import { relationshipAutomationRoutes, relationshipAutomationAdminRoutes } from '../_lib/routes/relationshipAutomation'
import { fieldWorkRoutes } from '../_lib/routes/fieldWork'
import { casesRoutes } from '../_lib/routes/cases'
import { communicationBrandingAdminRoutes, communicationBrandingPublicRoutes } from '../_lib/routes/communicationBranding'
import { presenceRoutes } from '../_lib/routes/presence'
import { documentVerificationRoutes } from '../_lib/routes/documentVerification'
import { documentLifecycleAdminRoutes, documentLifecyclePublicRoutes } from '../_lib/routes/documentLifecycle'
import { documentOperationsAdminRoutes } from '../_lib/routes/documentOperations'
import { documentPlatformV2AdminRoutes, documentPlatformV2AutomationRoutes, documentPlatformV2PublicRoutes } from '../_lib/routes/documentPlatformV2'
import { documentSignerSecurityRoutes } from '../_lib/routes/documentSignerSecurity'
import { documentSignerFileRoutes } from '../_lib/routes/documentSignerFiles'
import { internalDocumentAdminRoutes, internalDocumentPublicRoutes } from '../_lib/routes/internalDocuments'
import { documentWorkspaceExtraRoutes } from '../_lib/routes/documentWorkspaceExtras'
import { securitySessionRoutes } from '../_lib/routes/securitySessions'
import { scopeFunnelPublicRoutes, scopeFunnelAdminRoutes } from '../_lib/routes/scopeFunnel'
import { carePlanPublicRoutes } from '../_lib/routes/carePlans'
import { communicationsHubRoutes } from '../_lib/routes/communicationsHub'
import { managedTemplatePublicRoutes, managedTemplateAdminRoutes } from '../_lib/routes/managedTemplates'
import { clientRelationshipRoutes } from '../_lib/routes/clientRelationships'

const app = new Hono<AppEnv>().basePath('/api')

app.route('/auth', authRoutes)
app.route('/', publicRoutes)
app.route('/', serviceOfferingPublicRoutes)
app.route('/', uploadRoutes)
app.route('/', unsubscribeRoutes)
app.route('/', resendWebhookRoutes)
app.route('/', invitationPublicRoutes)
app.route('/', inviteCompletionRoutes)
app.route('/', vendorApplicationUploadRoutes)
app.route('/', relationshipAutomationRoutes)
app.route('/', documentPlatformV2AutomationRoutes)
app.route('/', documentVerificationRoutes)
app.route('/', documentSignerFileRoutes)
app.route('/', documentSignerSecurityRoutes)
app.route('/', documentPlatformV2PublicRoutes)
app.route('/', documentLifecyclePublicRoutes)
app.route('/', internalDocumentPublicRoutes)
app.route('/', scopeFunnelPublicRoutes)
app.route('/', carePlanPublicRoutes)
app.route('/', managedTemplatePublicRoutes)

app.get('/me', requireUser, (c) => c.json({ user: c.get('user') }))

app.route('/portal', intakeCopyRoutes)
app.route('/portal', signaturePortalSyncRoutes)
app.route('/portal', clientApplicationSignatureRoutes)
app.route('/portal', serviceOfferingApplicationRoutes)
app.route('/portal', serviceApplicationRoutes)
app.route('/portal', trustedContactRoutes)
app.route('/portal', selfRoutes)
app.route('/portal', portalRoutes)
app.route('/portal', messageRoutes)
app.route('/portal', presenceRoutes)

app.route('/admin', relationshipAutomationAdminRoutes)
app.route('/admin', communicationsHubRoutes)
app.route('/admin', securitySessionRoutes)
app.route('/admin', serviceOfferingAdminRoutes)
app.route('/admin', intakeCatalogAdminRoutes)
app.route('/admin', accountEmailsAdminRoutes)
app.route('/admin', signatureAdminSyncRoutes)
app.route('/admin', staffServiceAssignmentRoutes)
app.route('/admin', staffServicePrefillRoutes)
app.route('/admin', invoiceAdminRoutes)
app.route('/admin', roleCapabilityRoutes)
app.route('/admin', invitationAdminRoutes)
app.route('/admin', bulkInvitationRoutes)
app.route('/admin', roleAdminRoutes)
app.route('/admin', teamManagementRoutes)
app.route('/admin', reportExportRoutes)
app.route('/admin', scheduledReportRoutes)
app.route('/admin', managementInsightRoutes)
app.route('/admin', documentWorkspaceExtraRoutes)
app.route('/admin', documentPlatformV2AdminRoutes)
app.route('/admin', documentOperationsAdminRoutes)
app.route('/admin', documentLifecycleAdminRoutes)
app.route('/admin', internalDocumentAdminRoutes)
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
app.route('/admin', fieldWorkRoutes)
app.route('/admin', casesRoutes)
app.route('/admin', communicationBrandingAdminRoutes)
app.route('/admin', presenceRoutes)
app.route('/admin', scopeFunnelAdminRoutes)
app.route('/admin', managedTemplateAdminRoutes)
app.route('/admin', clientRelationshipRoutes)
// Public endpoint serves branded font files by id for the mail workspace
// preview + rendered signer experience; no auth required so <link rel="preload">
// and @font-face fetches work in an unauthenticated recipient's browser.
app.route('/', communicationBrandingPublicRoutes)

app.get('/health', (c) => c.json({ ok: true, service: 'pmv-api', time: new Date().toISOString() }))

app.notFound((c) => c.json({ error: 'not found' }, 404))
app.onError((err, c) => { console.error('unhandled API error', err); return c.json({ error: 'internal error' }, 500) })
export const onRequest = handle(app)
void getUser
