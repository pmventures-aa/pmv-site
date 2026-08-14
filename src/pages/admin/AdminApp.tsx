import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { ProtectedRoute } from '../../components/ProtectedRoute'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { adminNav, vendorMobilePrimary, vendorNavForWorld } from '../../components/layout/nav'
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
const FieldWorkDetail = lazy(() => import('./FieldWorkVendor'))
const FieldWorkList = lazy(() => import('./FieldWorkVendor').then((m) => ({ default: m.FieldWorkList })))
const CasesAdmin = lazy(() => import('./CasesAdmin'))
const PublicFunnelAdmin = lazy(() => import('./PublicFunnelAdmin'))
const QuotesAdmin = lazy(() => import('./QuotesAdmin'))

const STAFF_VISIBLE = ['dashboard','pipelines','clients','inquiries','quotes','messages','cases','activity','invoices','field-work','service-assignments','security-center']

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
  useEffect(() => {
    if (!isVendor) return
    void import('./FieldWorkVendor')
    void import('./MessagesAdmin')
    void import('./SecurityCenter')
  }, [isVendor])
  return <AdminLayout nav={nav} badge={copy.badge} mobilePrimary={isVendor ? [...vendorMobilePrimary] : []}/>
}
function AdminIndex(){
  const {workspace}=useAuth(); const p=useAppPath()
  if(workspace.party_type==='vendor') return <Navigate to={p('field-work/mine')} replace />
  return <AdminDashboard/>
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

export default function AdminApp({basePath}:{basePath:string}){
  return <BasePathProvider base={basePath}><Suspense fallback={<LoadingScreen variant="orb" label="Loading HQ…" />}><Routes>
    <Route path="login" element={<Login surface="staff"/>}/>
    <Route path="forgot-password" element={<ForgotPassword surface="staff"/>}/>
    <Route path="reset-password" element={<ResetPassword surface="staff"/>}/>
    <Route path="set-password" element={<SetPassword surface="staff"/>}/>
    <Route path="vendor-signup" element={<VendorSignup/>}/>
    <Route path="invite/:token" element={<StaffInvite/>}/>
    <Route element={<ProtectedRoute allow={['staff','admin']}/>}><Route element={<AdminShell/>}>
      <Route index element={<AdminIndex/>}/><Route path="pipelines" element={<PipelinesAdmin/>}/><Route path="clients" element={<ClientsList/>}/><Route path="clients/:id" element={<ClientDetailModern/>}/><Route path="clients/:id/:section" element={<ClientDetailModern/>}/><Route path="clients/:id/manage" element={<ClientDetail/>}/><Route path="inquiries" element={<CRMRecordsAdmin/>}/><Route path="leads/new" element={<LeadCreate/>}/><Route path="leads/:id" element={<LeadDetail/>}/><Route path="leads/:id/:section" element={<LeadDetail/>}/><Route path="messages" element={<MessagesAdmin/>}/><Route path="cases" element={<CasesAdmin/>}/><Route path="activity" element={<ActivityAdmin/>}/><Route path="service-assignments" element={<ServiceAssignmentsAdmin/>}/><Route path="field-work" element={<FieldWorkAdmin/>}/><Route path="field-work/mine" element={<FieldWorkList/>}/><Route path="field-work/:id" element={<FieldWorkDetail/>}/><Route path="invoices" element={<InvoicesAdmin/>}/><Route path="quotes" element={<QuotesAdmin/>}/><Route path="document-center" element={<DocumentOperationsDashboard/>}/><Route path="esign-platform" element={<ESignPlatformAdmin/>}/><Route path="community-documents" element={<CommunityDocuments/>}/><Route path="envelopes" element={<EnvelopeWorkspaceEnterprise/>}/><Route path="audit-log" element={<AuditLogAdmin/>}/><Route path="management" element={<ManagementCenter/>}/><Route path="reports" element={<ReportingCenter/>}/><Route path="communications" element={<RedirectToMessages tab="email"/>}/><Route path="communications/email" element={<CommunicationsCRMAdmin/>}/><Route path="client-banners" element={<ClientBannersAdmin/>}/><Route path="automation-center" element={<AutomationCenter/>}/><Route path="public-funnel" element={<PublicFunnelAdmin/>}/><Route path="security-center" element={<SecurityCenter/>}/><Route path="network" element={<ProviderNetworkAdmin/>}/><Route path="network/:id/:section" element={<ProviderProfile/>}/><Route path="employees" element={<Navigate to="../network" replace/>}/><Route path="open-items/:type" element={<OpenItemsAdmin/>}/><Route path="open-items" element={<OpenItemsAdmin/>}/><Route path="invitations" element={<InvitationsAdmin/>}/><Route path="roles" element={<RolesPermissionsAdmin/>}/><Route path="users" element={<UsersAdmin/>}/><Route path="assignments" element={<AssignmentsAdmin/>}/><Route path="settings" element={<SettingsAdmin/>}/>
    </Route></Route><Route path="*" element={<CatchAll/>}/>
  </Routes></Suspense></BasePathProvider>
}
