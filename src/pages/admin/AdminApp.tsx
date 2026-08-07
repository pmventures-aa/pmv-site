import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '../../components/ProtectedRoute'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { adminNav } from '../../components/layout/nav'
import { useAuth } from '../../lib/auth'
import { useCapabilities } from '../../lib/capabilities'
import { BasePathProvider, useAppPath } from '../../lib/basePath'
import Login from '../auth/Login'
import SetPassword from '../auth/SetPassword'
import AdminDashboard from './AdminDashboard'
import ClientsList from './ClientsList'
import ClientDetail from './ClientDetail'
import UsersAdmin from './UsersAdmin'
import AssignmentsAdmin from './AssignmentsAdmin'
import SettingsAdmin from './SettingsAdmin'
import InquiriesAdmin from './InquiriesAdmin'
import ActivityAdmin from './ActivityAdmin'
import OpenItemsAdmin from './OpenItemsAdmin'
import PipelinesAdmin from './PipelinesAdmin'
import AuditLogAdmin from './AuditLogAdmin'
import EmployeesAdmin from './EmployeesAdmin'

// 'reports' is added to adminNav ahead of its route existing (Phase 6,
// this same session) — filtered out of the visible set entirely until
// it's wired in, so a staff/admin account never sees a nav item with
// nothing behind it in the meantime.
const STAFF_VISIBLE = ['dashboard', 'pipelines', 'clients', 'inquiries', 'activity']
const NOT_YET_WIRED = new Set(['reports'])

function AdminShell() {
  const { user } = useAuth()
  const caps = useCapabilities()
  const visible = new Set(STAFF_VISIBLE)
  if (caps.can_manage_users) {
    visible.add('users')
    visible.add('assignments')
    visible.add('settings') // Staff & Permissions tab lives inside Settings
  }
  if (caps.can_manage_settings) visible.add('settings')
  if (caps.can_view_audit_log) visible.add('audit-log')
  const nav = (user?.role === 'admin' ? adminNav : adminNav.filter((n) => visible.has(n.key))).filter((n) => !NOT_YET_WIRED.has(n.key))
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

        <Route element={<ProtectedRoute allow={['staff', 'admin']} />}>
          <Route element={<AdminShell />}>
            <Route index element={<AdminDashboard />} />
            <Route path="pipelines" element={<PipelinesAdmin />} />
            <Route path="clients" element={<ClientsList />} />
            <Route path="clients/:id" element={<ClientDetail />} />
            <Route path="inquiries" element={<InquiriesAdmin />} />
            <Route path="activity" element={<ActivityAdmin />} />
            <Route path="audit-log" element={<AuditLogAdmin />} />
            <Route path="employees" element={<ProtectedRoute allow={['admin']} />}>
              <Route index element={<EmployeesAdmin />} />
            </Route>
            <Route path="open-items/:type" element={<OpenItemsAdmin />} />
            {/* Old shape (?type=...) — OpenItemsAdmin falls back to the query param when there's no :type segment. */}
            <Route path="open-items" element={<OpenItemsAdmin />} />
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
