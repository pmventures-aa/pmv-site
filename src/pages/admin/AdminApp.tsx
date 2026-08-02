import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '../../components/ProtectedRoute'
import { Shell } from '../../components/layout/Shell'
import { adminNav } from '../../components/layout/nav'
import { useAuth } from '../../lib/auth'
import Login from '../auth/Login'
import AdminDashboard from './AdminDashboard'
import ClientsList from './ClientsList'
import ClientDetail from './ClientDetail'
import UsersAdmin from './UsersAdmin'
import AssignmentsAdmin from './AssignmentsAdmin'
import SettingsAdmin from './SettingsAdmin'

function AdminShell() {
  const { user } = useAuth()
  const nav = user?.role === 'admin' ? adminNav : adminNav.filter((n) => ['dashboard', 'clients'].includes(n.key))
  return <Shell nav={nav} badge="Staff Console" />
}

export default function AdminApp() {
  return (
    <Routes>
      <Route path="login" element={<Login surface="staff" />} />

      <Route element={<ProtectedRoute allow={['staff', 'admin']} />}>
        <Route element={<AdminShell />}>
          <Route index element={<AdminDashboard />} />
          <Route path="clients" element={<ClientsList />} />
          <Route path="clients/:id" element={<ClientDetail />} />
          <Route path="users" element={<UsersAdmin />} />
          <Route path="assignments" element={<AssignmentsAdmin />} />
          <Route path="settings" element={<SettingsAdmin />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="" replace />} />
    </Routes>
  )
}
