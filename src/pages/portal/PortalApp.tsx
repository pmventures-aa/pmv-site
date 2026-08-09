import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '../../components/ProtectedRoute'
import { Shell } from '../../components/layout/Shell'
import { portalNav } from '../../components/layout/nav'
import { BasePathProvider, useAppPath } from '../../lib/basePath'
import Login from '../auth/Login'
import Signup from '../auth/Signup'
import SetPassword from '../auth/SetPassword'
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
import Notifications from './Notifications'
import Security from './Security'
import { ModulePage } from './ModulePage'
import { callsConfig, mattersConfig, tasksConfig, calendarConfig, fundingConfig, propertyConfig, taxConfig } from './moduleConfigs'

function CatchAll() {
  const p = useAppPath()
  return <Navigate to={p()} replace />
}

export default function PortalApp({ basePath }: { basePath: string }) {
  return (
    <BasePathProvider base={basePath}>
      <Routes>
        <Route path="login" element={<Login surface="client" />} />
        <Route path="signup" element={<Signup />} />
        <Route path="set-password" element={<SetPassword surface="client" />} />

        <Route element={<ProtectedRoute allow={['client']} />}>
          <Route path="onboarding" element={<OnboardingWizard />} />

          <Route element={<Shell nav={portalNav} badge="Client Portal" />}>
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
            <Route path="notifications" element={<Notifications />} />
            <Route path="security" element={<Security />} />

            {/* Old slugs — redirect so existing bookmarks/links keep working. */}
            <Route path="calls" element={<Navigate to="../planned-calls" replace />} />
            <Route path="property" element={<Navigate to="../property-management" replace />} />
            <Route path="tax" element={<Navigate to="../tax-filings" replace />} />
            <Route path="profile" element={<Navigate to="../business-profile" replace />} />
            <Route path="team" element={<Navigate to="../my-team" replace />} />
          </Route>
        </Route>

        <Route path="*" element={<CatchAll />} />
      </Routes>
    </BasePathProvider>
  )
}
