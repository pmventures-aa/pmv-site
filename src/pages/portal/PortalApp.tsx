import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '../../components/ProtectedRoute'
import { OnboardingGate } from '../../components/OnboardingGate'
import { Shell } from '../../components/layout/Shell'
import { portalNav } from '../../components/layout/nav'
import Login from '../auth/Login'
import Signup from '../auth/Signup'
import SetPassword from '../auth/SetPassword'
import OnboardingWizard from './OnboardingWizard'
import Dashboard from './Dashboard'
import Services from './Services'
import Documents from './Documents'
import Messages from './Messages'
import Support from './Support'
import Billing from './Billing'
import { ModulePage } from './ModulePage'
import { callsConfig, mattersConfig, tasksConfig, calendarConfig, fundingConfig, propertyConfig, taxConfig } from './moduleConfigs'

export default function PortalApp() {
  return (
    <Routes>
      <Route path="login" element={<Login surface="client" />} />
      <Route path="signup" element={<Signup />} />
      <Route path="set-password" element={<SetPassword surface="client" />} />

      <Route element={<ProtectedRoute allow={['client']} />}>
        <Route path="onboarding" element={<OnboardingWizard />} />

        <Route element={<OnboardingGate />}>
          <Route element={<Shell nav={portalNav} badge="Client Portal" />}>
            <Route index element={<Dashboard />} />
            <Route path="calls" element={<ModulePage config={callsConfig} />} />
            <Route path="services" element={<Services />} />
            <Route path="matters" element={<ModulePage config={mattersConfig} />} />
            <Route path="tasks" element={<ModulePage config={tasksConfig} />} />
            <Route path="documents" element={<Documents />} />
            <Route path="messages" element={<Messages />} />
            <Route path="calendar" element={<ModulePage config={calendarConfig} />} />
            <Route path="billing" element={<Billing />} />
            <Route path="funding" element={<ModulePage config={fundingConfig} />} />
            <Route path="property" element={<ModulePage config={propertyConfig} />} />
            <Route path="tax" element={<ModulePage config={taxConfig} />} />
            <Route path="support" element={<Support />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="" replace />} />
    </Routes>
  )
}
