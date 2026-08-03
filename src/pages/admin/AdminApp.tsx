import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '../../components/ProtectedRoute'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { adminNav } from '../../components/layout/nav'
import { useAuth } from '../../lib/auth'
import { useCapabilities } from '../../lib/capabilities'
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

const STAFF_VISIBLE = ['dashboard', 'pipelines', 'clients', 'inquiries', 'activity']

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
  const nav = user?.role === 'admin' ? adminNav : adminNav.filter((n) => visible.has(n.key))
  return <AdminLayout nav={nav} badge="Staff Console" />
}

export default function AdminApp() {
  return (
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
          <Route path="open-items/:type" element={<OpenItemsAdmin />} />
          {/* Old shape (?type=...) — OpenItemsAdmin falls back to the query param when there's no :type segment. */}
          <Route path="open-items" element={<OpenItemsAdmin />} />
          <Route path="users" element={<UsersAdmin />} />
          <Route path="assignments" element={<AssignmentsAdmin />} />
          <Route path="settings" element={<SettingsAdmin />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="" replace />} />
    </Routes>
  )
}
