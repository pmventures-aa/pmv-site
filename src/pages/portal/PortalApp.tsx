import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '../../components/ProtectedRoute'
import { Shell } from '../../components/layout/Shell'
import { useEffect, useState } from 'react'
import { clientPortalNav } from '../../components/layout/nav'
import { api } from '../../lib/api'
import { BasePathProvider, useAppPath } from '../../lib/basePath'
import { useAuth } from '../../lib/auth'
import Login from '../auth/Login'
import Signup from '../auth/Signup'
import ForgotPassword from '../auth/ForgotPassword'
import ResetPassword from '../auth/ResetPassword'
import SetPassword from '../auth/SetPassword'
import TrustedInvite from '../auth/TrustedInvite'
import OnboardingWizard from './OnboardingWizard'
import Dashboard from './Dashboard'
import Services from './Services'
import ServiceApplication from './ServiceApplication'
import Documents from './Documents'
import Messages from './Messages'
import Support from './Support'
import Billing from './Billing'
import BusinessProfile from './BusinessProfile'
import MyTeam from './MyTeam'
import TrustedContacts from './TrustedContacts'
import TrustedPortal from './TrustedPortal'
import Notifications from './Notifications'
import Security from './Security'
import ClientPortalDemo from './ClientPortalDemo'
import { ModulePage } from './ModulePage'
import { callsConfig, mattersConfig, tasksConfig, calendarConfig, fundingConfig, propertyConfig, taxConfig } from './moduleConfigs'

function ClientShell() {
  const [keys, setKeys] = useState<string[]>([])
  useEffect(() => {
    api.get<{ services: { service_key: string }[] }>('/portal/services')
      .then((result) => setKeys(result.services.map((service) => service.service_key)))
      .catch(() => setKeys([]))
  }, [])
  return <Shell nav={clientPortalNav(keys)} badge="Client Portal" />
}

function PortalRoot() {
  const { user, loading } = useAuth()
  const p = useAppPath()
  if (loading) return null
  if (user?.role === 'trusted_contact') return <Navigate to={p('trusted')} replace />
  return <Navigate to={p()} replace />
}

function CatchAll() {
  const { user } = useAuth()
  const p = useAppPath()
  return <Navigate to={user?.role === 'trusted_contact' ? p('trusted') : p()} replace />
}

export default function PortalApp({ basePath }: { basePath: string }) {
  return (
    <BasePathProvider base={basePath}>
      <Routes>
        <Route path="login" element={<Login surface="client" />} />
        <Route path="signup" element={<Signup />} />
        <Route path="forgot-password" element={<ForgotPassword surface="client" />} />
        <Route path="reset-password" element={<ResetPassword surface="client" />} />
        <Route path="set-password" element={<SetPassword surface="client" />} />
        <Route path="trusted-invite/:token" element={<TrustedInvite />} />
        <Route path="demo" element={<ClientPortalDemo />} />

        <Route element={<ProtectedRoute allow={['trusted_contact']} />}>
          <Route path="trusted" element={<TrustedPortal />} />
        </Route>

        <Route element={<ProtectedRoute allow={['client']} />}>
          <Route path="onboarding" element={<OnboardingWizard />} />
          <Route element={<ClientShell />}>
            <Route index element={<Dashboard />} />
            <Route path="planned-calls" element={<ModulePage config={callsConfig} />} />
            <Route path="services" element={<Services />} />
            <Route path="services/:key/apply" element={<ServiceApplication />} />
            <Route path="matters" element={<ModulePage config={mattersConfig} />} />
            <Route path="tasks" element={<ModulePage config={tasksConfig} />} />
            <Route path="documents" element={<Documents />} />
            <Route path="messages" element={<Messages />} />
            <Route path="calendar" element={<ModulePage config={calendarConfig} />} />
            <Route path="billing" element={<Billing />} />
            <Route path="funding" element={<ModulePage config={fundingConfig} />} />
            <Route path="property-management" element={<ModulePage config={propertyConfig} />} />
            <Route path="tax-filings" element={<ModulePage config={taxConfig} />} />
            <Route path="support" element={<Support />} />
            <Route path="business-profile" element={<BusinessProfile />} />
            <Route path="my-team" element={<MyTeam />} />
            <Route path="trusted-contacts" element={<TrustedContacts />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="security" element={<Security />} />
            <Route path="calls" element={<Navigate to="../planned-calls" replace />} />
            <Route path="property" element={<Navigate to="../property-management" replace />} />
            <Route path="tax" element={<Navigate to="../tax-filings" replace />} />
            <Route path="profile" element={<Navigate to="../business-profile" replace />} />
            <Route path="team" element={<Navigate to="../my-team" replace />} />
          </Route>
        </Route>

        <Route path="_root" element={<PortalRoot />} />
        <Route path="*" element={<CatchAll />} />
      </Routes>
    </BasePathProvider>
  )
}
