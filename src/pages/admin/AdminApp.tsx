import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '../../components/ProtectedRoute'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { adminNav } from '../../components/layout/nav'
import { useAuth } from '../../lib/auth'
import { useCapabilities } from '../../lib/capabilities'
import { BasePathProvider, useAppPath } from '../../lib/basePath'
import Login from '../auth/Login'
import SetPassword from '../auth/SetPassword'
import VendorSignup from '../auth/VendorSignup'
import AdminDashboard from './AdminDashboard'
import ClientsList from './ClientsList'
import ClientDetail from './ClientDetail'
import ClientDetailModern from './ClientDetailModern'
import UsersAdmin from './UsersAdmin'
import AssignmentsAdmin from './AssignmentsAdmin'
import SettingsAdmin from './SettingsAdmin'
import CRMRecordsAdmin from './CRMRecordsAdmin'
import LeadDetail from './LeadDetail'
import MessagesAdmin from './MessagesAdmin'
import ActivityAdmin from './ActivityAdmin'
import OpenItemsAdmin from './OpenItemsAdmin'
import PipelinesAdmin from './PipelinesAdmin'
import AuditLogAdmin from './AuditLogAdmin'
import EmployeesAdmin from './EmployeesAdmin'
import ReportingCenter from './ReportingCenter'
import CommunicationsCRMAdmin from './CommunicationsCRMAdmin'
import InvoicesAdmin from './InvoicesAdmin'
import ServiceAssignmentsAdmin from './ServiceAssignmentsAdmin'
import InvitationsAdmin from './InvitationsAdmin'
import RolesPermissionsAdmin from './RolesPermissionsAdmin'
import DocumentCenter from './DocumentCenter'

const STAFF_VISIBLE = ['dashboard', 'pipelines', 'clients', 'inquiries', 'messages', 'activity', 'service-assignments', 'invoices', 'document-center']
const OWNER_ONLY_NAV = new Set(['invitations', 'roles'])

function AdminShell() {
  const { user } = useAuth()
  const caps = useCapabilities()
  const visible = new Set(STAFF_VISIBLE)
  if (caps.can_manage_users) { visible.add('users'); visible.add('assignments') }
  if (caps.can_manage_settings) visible.add('settings')
  if (caps.can_view_audit_log) visible.add('audit-log')
  if (caps.can_view_reports) visible.add('reports')
  if (caps.can_manage_communications) visible.add('communications')
  const nav = user?.role === 'admin'
    ? adminNav.filter((n) => !OWNER_ONLY_NAV.has(n.key) || caps.is_owner)
    : adminNav.filter((n) => visible.has(n.key))
  return <AdminLayout nav={nav} badge="Staff Console" />
}

function CatchAll() {
  const p = useAppPath()
  return <Navigate to={p()} replace />
}

export default function AdminApp({ basePath }: { basePath: string }) {
  return (
    <BasePathProvider base={basePath}>
      <Routes>
        <Route path="login" element={<Login surface="staff" />} />
        <Route path="set-password" element={<SetPassword surface="staff" />} />
        <Route path="vendor-signup" element={<VendorSignup />} />

        <Route element={<ProtectedRoute allow={['staff', 'admin']} />}>
          <Route element={<AdminShell />}>
            <Route index element={<AdminDashboard />} />
            <Route path="pipelines" element={<PipelinesAdmin />} />
            <Route path="clients" element={<ClientsList />} />
            <Route path="clients/:id" element={<ClientDetailModern />} />
            <Route path="clients/:id/manage" element={<ClientDetail />} />
            <Route path="inquiries" element={<CRMRecordsAdmin />} />
            <Route path="leads/:id" element={<LeadDetail />} />
            <Route path="messages" element={<MessagesAdmin />} />
            <Route path="activity" element={<ActivityAdmin />} />
            <Route path="service-assignments" element={<ServiceAssignmentsAdmin />} />
            <Route path="invoices" element={<InvoicesAdmin />} />
            <Route path="document-center" element={<DocumentCenter />} />
            <Route path="audit-log" element={<AuditLogAdmin />} />
            <Route path="reports" element={<ReportingCenter />} />
            <Route path="communications" element={<CommunicationsCRMAdmin />} />
            <Route path="employees" element={<ProtectedRoute allow={['admin']} />}><Route index element={<EmployeesAdmin />} /></Route>
            <Route path="open-items/:type" element={<OpenItemsAdmin />} />
            <Route path="open-items" element={<OpenItemsAdmin />} />
            <Route path="invitations" element={<InvitationsAdmin />} />
            <Route path="roles" element={<RolesPermissionsAdmin />} />
            <Route path="users" element={<UsersAdmin />} />
            <Route path="assignments" element={<AssignmentsAdmin />} />
            <Route path="settings" element={<SettingsAdmin />} />
          </Route>
        </Route>
        <Route path="*" element={<CatchAll />} />
      </Routes>
    </BasePathProvider>
  )
}
