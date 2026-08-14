import { Suspense, lazy, type ReactNode } from 'react'
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { ProtectedRoute } from '../../components/ProtectedRoute'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { adminNav, vendorNavForWorld, vendorMobilePrimary } from '../../components/layout/nav'
import { useAuth } from '../../lib/auth'
import { useCapabilities } from '../../lib/capabilities'
import { hqWorkspaceCopy } from '../../lib/workspace'
import { BasePathProvider, useAppPath } from '../../lib/basePath'
import { isCampaignAudienceQuery } from '../../lib/engagements'
import { LoadingScreen } from '../../components/LoadingScreen'
import Login from '../auth/Login'
import ForgotPassword from '../auth/ForgotPassword'
import ResetPassword from '../auth/ResetPassword'
import SetPassword from '../auth/SetPassword'
import VendorSignup from '../auth/VendorSignup'
import StaffInvite from '../auth/StaffInvite'

const AdminDashboard = lazy(() => import('./AdminDashboard'))
const ClientsList = lazy(() => import('./ClientsList'))
const ClientDetail = lazy(() => import('./ClientDetail'))
const ClientDetailModern = lazy(() => import('./ClientDetailModern'))
const UsersAdmin = lazy(() => import('./UsersAdmin'))
const AssignmentsAdmin = lazy(() => import('./AssignmentsAdmin'))
const SettingsAdmin = lazy(() => import('./SettingsAdmin'))
const CRMRecordsAdmin = lazy(() => import('./CRMRecordsAdmin'))
const LeadCreate = lazy(() => import('./LeadCreate'))
const LeadDetail = lazy(() => import('./LeadDetail'))
const MessagesAdmin = lazy(() => import('./MessagesAdmin'))
const ActivityAdmin = lazy(() => import('./ActivityAdmin'))
const OpenItemsAdmin = lazy(() => import('./OpenItemsAdmin'))
const PipelinesAdmin = lazy(() => import('./PipelinesAdmin'))
const AuditLogAdmin = lazy(() => import('./AuditLogAdmin'))
const ProviderNetworkAdmin = lazy(() => import('./ProviderNetworkAdmin'))
const ProviderProfile = lazy(() => import('./ProviderProfile'))
const ReportingCenter = lazy(() => import('./ReportingCenter'))
const ManagementCenter = lazy(() => import('./ManagementCenter'))
const CommunicationsCRMAdmin = lazy(() => import('./CommunicationsCRMAdmin'))
const ClientBannersAdmin = lazy(() => import('./ClientBannersAdmin'))
const AutomationCenter = lazy(() => import('./AutomationCenter'))
const SecurityCenter = lazy(() => import('./SecurityCenter'))
const InvoicesAdmin = lazy(() => import('./InvoicesAdmin'))
const ServiceAssignmentsAdmin = lazy(() => import('./ServiceAssignmentsAdmin'))
const InvitationsAdmin = lazy(() => import('./InvitationsAdmin'))
const RolesPermissionsAdmin = lazy(() => import('./RolesPermissionsAdmin'))
const DocumentOperationsDashboard = lazy(() => import('./DocumentOperationsDashboard'))
const CommunityDocuments = lazy(() => import('./CommunityDocuments'))
const EnvelopeWorkspaceEnterprise = lazy(() => import('./EnvelopeWorkspaceEnterprise'))
const ESignPlatformAdmin = lazy(() => import('./ESignPlatformAdmin'))
const FieldWorkAdmin = lazy(() => import('./FieldWorkAdmin'))
const FieldWorkList = lazy(() => import('./FieldWorkVendor').then((m) => ({ default: m.FieldWorkList })))
const FieldWorkDetail = lazy(() => import('./FieldWorkVendor'))
const CasesAdmin = lazy(() => import('./CasesAdmin'))
const PublicFunnelAdmin = lazy(() => import('./PublicFunnelAdmin'))
const QuotesAdmin = lazy(() => import('./QuotesAdmin'))

const STAFF_VISIBLE = ['dashboard','pipelines','clients','inquiries','quotes','messages','cases','activity','invoices','field-work','service-assignments','security-center']

function PageFallback() {
  return <LoadingScreen variant="orb" label="Loading…" />
}

function AdminShell(){
  const{user,workspace}=useAuth();const caps=useCapabilities();const visible=new Set(STAFF_VISIBLE)
  if(caps.can_manage_users){visible.add('users');visible.add('assignments')}
  if(caps.can_manage_settings)visible.add('settings')
  if(caps.can_view_audit_log)visible.add('audit-log')
  if(caps.can_view_reports){visible.add('reports');visible.add('management')}
  if(caps.can_manage_invitations)visible.add('invitations')
  if(caps.can_manage_documents){visible.add('document-center');visible.add('community-documents');visible.add('envelopes');visible.add('esign-platform')}
  if(caps.can_manage_team)visible.add('network')
  if(caps.is_owner){visible.add('roles');visible.add('automation-center');visible.add('public-funnel')}
  const isVendor = workspace.party_type === 'vendor'
  const copy = hqWorkspaceCopy(workspace.party_type, workspace.vendor_category, workspace.role_name)
  const nav = isVendor
    ? vendorNavForWorld(workspace.world)
    : user?.role==='admin'?adminNav.filter(item=>(item.key!=='roles'&&item.key!=='automation-center'&&item.key!=='public-funnel')||caps.is_owner):adminNav.filter(item=>visible.has(item.key))
  return <AdminLayout nav={nav} badge={copy.badge} mobilePrimary={isVendor ? vendorMobilePrimary : undefined}/>
}
function AdminIndex(){
  const {workspace}=useAuth(); const p=useAppPath()
  if(workspace.party_type==='vendor') return <Navigate to={p('field-work/mine')} replace />
  return <Suspense fallback={<PageFallback />}><AdminDashboard/></Suspense>
}
function CatchAll(){const p=useAppPath();return <Navigate to={p()} replace/>}

function RedirectToMessages({ tab }: { tab?: string }) {
  const p = useAppPath()
  const [params] = useSearchParams()
  if (isCampaignAudienceQuery(params)) {
    return <Navigate to={`${p('communications/email')}?${params.toString()}`} replace />
  }
  const next = new URLSearchParams(params)
  if (tab && !next.get('tab')) next.set('tab', tab)
  if (next.get('tab') === 'threads') next.set('tab', 'staff')
  const qs = next.toString()
  return <Navigate to={qs ? `${p('messages')}?${qs}` : p('messages')} replace />
}

function L({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>
}

export default function AdminApp({basePath}:{basePath:string}){
  return <BasePathProvider base={basePath}><Routes>
    <Route path="login" element={<Login surface="staff"/>}/>
    <Route path="forgot-password" element={<ForgotPassword surface="staff"/>}/>
    <Route path="reset-password" element={<ResetPassword surface="staff"/>}/>
    <Route path="set-password" element={<SetPassword surface="staff"/>}/>
    <Route path="vendor-signup" element={<VendorSignup/>}/>
    <Route path="invite/:token" element={<StaffInvite/>}/>
    <Route element={<ProtectedRoute allow={['staff','admin']}/>}><Route element={<AdminShell/>}>
      <Route index element={<AdminIndex/>}/>
      <Route path="pipelines" element={<L><PipelinesAdmin/></L>}/>
      <Route path="clients" element={<L><ClientsList/></L>}/>
      <Route path="clients/:id" element={<L><ClientDetailModern/></L>}/>
      <Route path="clients/:id/:section" element={<L><ClientDetailModern/></L>}/>
      <Route path="clients/:id/manage" element={<L><ClientDetail/></L>}/>
      <Route path="inquiries" element={<L><CRMRecordsAdmin/></L>}/>
      <Route path="leads/new" element={<L><LeadCreate/></L>}/>
      <Route path="leads/:id" element={<L><LeadDetail/></L>}/>
      <Route path="leads/:id/:section" element={<L><LeadDetail/></L>}/>
      <Route path="messages" element={<L><MessagesAdmin/></L>}/>
      <Route path="cases" element={<L><CasesAdmin/></L>}/>
      <Route path="activity" element={<L><ActivityAdmin/></L>}/>
      <Route path="service-assignments" element={<L><ServiceAssignmentsAdmin/></L>}/>
      <Route path="field-work" element={<L><FieldWorkAdmin/></L>}/>
      <Route path="field-work/mine" element={<L><FieldWorkList/></L>}/>
      <Route path="field-work/:id" element={<L><FieldWorkDetail/></L>}/>
      <Route path="invoices" element={<L><InvoicesAdmin/></L>}/>
      <Route path="quotes" element={<L><QuotesAdmin/></L>}/>
      <Route path="document-center" element={<L><DocumentOperationsDashboard/></L>}/>
      <Route path="esign-platform" element={<L><ESignPlatformAdmin/></L>}/>
      <Route path="community-documents" element={<L><CommunityDocuments/></L>}/>
      <Route path="envelopes" element={<L><EnvelopeWorkspaceEnterprise/></L>}/>
      <Route path="audit-log" element={<L><AuditLogAdmin/></L>}/>
      <Route path="management" element={<L><ManagementCenter/></L>}/>
      <Route path="reports" element={<L><ReportingCenter/></L>}/>
      <Route path="communications" element={<RedirectToMessages tab="email"/>}/>
      <Route path="communications/email" element={<L><CommunicationsCRMAdmin/></L>}/>
      <Route path="client-banners" element={<L><ClientBannersAdmin/></L>}/>
      <Route path="automation-center" element={<L><AutomationCenter/></L>}/>
      <Route path="public-funnel" element={<L><PublicFunnelAdmin/></L>}/>
      <Route path="security-center" element={<L><SecurityCenter/></L>}/>
      <Route path="network" element={<L><ProviderNetworkAdmin/></L>}/>
      <Route path="network/:id/:section" element={<L><ProviderProfile/></L>}/>
      <Route path="employees" element={<Navigate to="../network" replace/>}/>
      <Route path="open-items/:type" element={<L><OpenItemsAdmin/></L>}/>
      <Route path="open-items" element={<L><OpenItemsAdmin/></L>}/>
      <Route path="invitations" element={<L><InvitationsAdmin/></L>}/>
      <Route path="roles" element={<L><RolesPermissionsAdmin/></L>}/>
      <Route path="users" element={<L><UsersAdmin/></L>}/>
      <Route path="assignments" element={<L><AssignmentsAdmin/></L>}/>
      <Route path="settings" element={<L><SettingsAdmin/></L>}/>
    </Route></Route><Route path="*" element={<CatchAll/>}/>
  </Routes></BasePathProvider>
}
