import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '../../components/ProtectedRoute'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { adminNav } from '../../components/layout/nav'
import { useAuth } from '../../lib/auth'
import { useCapabilities } from '../../lib/capabilities'
import { BasePathProvider, useAppPath } from '../../lib/basePath'
import Login from '../auth/Login'
import ForgotPassword from '../auth/ForgotPassword'
import ResetPassword from '../auth/ResetPassword'
import SetPassword from '../auth/SetPassword'
import VendorSignup from '../auth/VendorSignup'
import StaffInvite from '../auth/StaffInvite'
import AdminDashboard from './AdminDashboard'
import ClientsList from './ClientsList'
import ClientDetail from './ClientDetail'
import ClientDetailModern from './ClientDetailModern'
import UsersAdmin from './UsersAdmin'
import AssignmentsAdmin from './AssignmentsAdmin'
import SettingsAdmin from './SettingsAdmin'
import CRMRecordsAdmin from './CRMRecordsAdmin'
import LeadCreate from './LeadCreate'
import LeadDetail from './LeadDetail'
import MessagesAdmin from './MessagesAdmin'
import ActivityAdmin from './ActivityAdmin'
import OpenItemsAdmin from './OpenItemsAdmin'
import PipelinesAdmin from './PipelinesAdmin'
import AuditLogAdmin from './AuditLogAdmin'
import ProviderNetworkAdmin from './ProviderNetworkAdmin'
import ProviderProfile from './ProviderProfile'
import ReportingCenter from './ReportingCenter'
import ManagementCenter from './ManagementCenter'
import CommunicationsCRMAdmin from './CommunicationsCRMAdmin'
import CommunicationsHub from './CommunicationsHub'
import AutomationCenter from './AutomationCenter'
import SecurityCenter from './SecurityCenter'
import InvoicesAdmin from './InvoicesAdmin'
import ServiceAssignmentsAdmin from './ServiceAssignmentsAdmin'
import InvitationsAdmin from './InvitationsAdmin'
import RolesPermissionsAdmin from './RolesPermissionsAdmin'
import DocumentOperationsDashboard from './DocumentOperationsDashboard'
import CommunityDocuments from './CommunityDocuments'
import EnvelopeWorkspaceEnterprise from './EnvelopeWorkspaceEnterprise'
import ESignPlatformAdmin from './ESignPlatformAdmin'
import FieldWorkAdmin from './FieldWorkAdmin'
import FieldWorkDetail, { FieldWorkList } from './FieldWorkVendor'
import CasesAdmin from './CasesAdmin'
import PublicFunnelAdmin from './PublicFunnelAdmin'

const STAFF_VISIBLE = ['dashboard','pipelines','clients','inquiries','messages','cases','activity','service-assignments','invoices','field-work','security-center']

function AdminShell(){
  const{user}=useAuth();const caps=useCapabilities();const visible=new Set(STAFF_VISIBLE)
  if(caps.can_manage_users){visible.add('users');visible.add('assignments')}
  if(caps.can_manage_settings)visible.add('settings')
  if(caps.can_view_audit_log)visible.add('audit-log')
  if(caps.can_view_reports){visible.add('reports');visible.add('management')}
  if(caps.can_manage_communications)visible.add('communications')
  if(caps.can_manage_invitations)visible.add('invitations')
  if(caps.can_manage_documents){visible.add('document-center');visible.add('community-documents');visible.add('envelopes');visible.add('esign-platform')}
  if(caps.can_manage_team)visible.add('network')
  if(caps.is_owner){visible.add('roles');visible.add('automation-center');visible.add('public-funnel')}
  const nav=user?.role==='admin'?adminNav.filter(item=>(item.key!=='roles'&&item.key!=='automation-center'&&item.key!=='public-funnel')||caps.is_owner):adminNav.filter(item=>visible.has(item.key))
  return <AdminLayout nav={nav} badge="Staff Console"/>
}
function CatchAll(){const p=useAppPath();return <Navigate to={p()} replace/>}

export default function AdminApp({basePath}:{basePath:string}){
  return <BasePathProvider base={basePath}><Routes>
    <Route path="login" element={<Login surface="staff"/>}/>
    <Route path="forgot-password" element={<ForgotPassword surface="staff"/>}/>
    <Route path="reset-password" element={<ResetPassword surface="staff"/>}/>
    <Route path="set-password" element={<SetPassword surface="staff"/>}/>
    <Route path="vendor-signup" element={<VendorSignup/>}/>
    <Route path="invite/:token" element={<StaffInvite/>}/>
    <Route element={<ProtectedRoute allow={['staff','admin']}/>}><Route element={<AdminShell/>}>
      <Route index element={<AdminDashboard/>}/><Route path="pipelines" element={<PipelinesAdmin/>}/><Route path="clients" element={<ClientsList/>}/><Route path="clients/:id" element={<ClientDetailModern/>}/><Route path="clients/:id/:section" element={<ClientDetailModern/>}/><Route path="clients/:id/manage" element={<ClientDetail/>}/><Route path="inquiries" element={<CRMRecordsAdmin/>}/><Route path="leads/new" element={<LeadCreate/>}/><Route path="leads/:id" element={<LeadDetail/>}/><Route path="leads/:id/:section" element={<LeadDetail/>}/><Route path="messages" element={<MessagesAdmin/>}/><Route path="cases" element={<CasesAdmin/>}/><Route path="activity" element={<ActivityAdmin/>}/><Route path="service-assignments" element={<ServiceAssignmentsAdmin/>}/><Route path="field-work" element={<FieldWorkAdmin/>}/><Route path="field-work/mine" element={<FieldWorkList/>}/><Route path="field-work/:id" element={<FieldWorkDetail/>}/><Route path="invoices" element={<InvoicesAdmin/>}/><Route path="document-center" element={<DocumentOperationsDashboard/>}/><Route path="esign-platform" element={<ESignPlatformAdmin/>}/><Route path="community-documents" element={<CommunityDocuments/>}/><Route path="envelopes" element={<EnvelopeWorkspaceEnterprise/>}/><Route path="audit-log" element={<AuditLogAdmin/>}/><Route path="management" element={<ManagementCenter/>}/><Route path="reports" element={<ReportingCenter/>}/><Route path="communications" element={<CommunicationsHub/>}/><Route path="communications/email" element={<CommunicationsCRMAdmin/>}/><Route path="automation-center" element={<AutomationCenter/>}/><Route path="public-funnel" element={<PublicFunnelAdmin/>}/><Route path="security-center" element={<SecurityCenter/>}/><Route path="network" element={<ProviderNetworkAdmin/>}/><Route path="network/:id/:section" element={<ProviderProfile/>}/><Route path="employees" element={<Navigate to="../network" replace/>}/><Route path="open-items/:type" element={<OpenItemsAdmin/>}/><Route path="open-items" element={<OpenItemsAdmin/>}/><Route path="invitations" element={<InvitationsAdmin/>}/><Route path="roles" element={<RolesPermissionsAdmin/>}/><Route path="users" element={<UsersAdmin/>}/><Route path="assignments" element={<AssignmentsAdmin/>}/><Route path="settings" element={<SettingsAdmin/>}/>
    </Route></Route><Route path="*" element={<CatchAll/>}/>
  </Routes></BasePathProvider>
}
