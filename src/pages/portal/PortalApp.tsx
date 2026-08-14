import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '../../components/ProtectedRoute'
import { Shell } from '../../components/layout/Shell'
import { clientPortalNav } from '../../components/layout/nav'
import { BasePathProvider, useAppPath } from '../../lib/basePath'
import { useAuth } from '../../lib/auth'
import { clientWorkspace } from '../../lib/workspace'
import { LoadingScreen } from '../../components/LoadingScreen'
import Login from '../auth/Login'
import Signup from '../auth/Signup'
import ForgotPassword from '../auth/ForgotPassword'
import ResetPassword from '../auth/ResetPassword'
import SetPassword from '../auth/SetPassword'
import TrustedInvite from '../auth/TrustedInvite'
import { callsConfig, tasksConfig, fundingConfig, taxConfig } from './moduleConfigs'

const OnboardingWizard = lazy(() => import('./OnboardingWizard'))
const Dashboard = lazy(() => import('./Dashboard'))
const Services = lazy(() => import('./Services'))
const ServiceApplication = lazy(() => import('./ServiceApplication'))
const Documents = lazy(() => import('./Documents'))
const Messages = lazy(() => import('./Messages'))
const Support = lazy(() => import('./Support'))
const Billing = lazy(() => import('./Billing'))
const BusinessProfile = lazy(() => import('./BusinessProfile'))
const MyTeam = lazy(() => import('./MyTeam'))
const TrustedContacts = lazy(() => import('./TrustedContacts'))
const TrustedPortal = lazy(() => import('./TrustedPortal'))
const Notifications = lazy(() => import('./Notifications'))
const Security = lazy(() => import('./Security'))
const ClientPortalDemo = lazy(() => import('./ClientPortalDemo'))
const ModulePage = lazy(() => import('./ModulePage').then((m) => ({ default: m.ModulePage })))
const CalendarPage = lazy(() => import('./CalendarPage'))
const Properties = lazy(() => import('./Properties'))
const PropertyProfile = lazy(() => import('./PropertyProfile'))
const Matters = lazy(() => import('./Matters'))
const MatterDetail = lazy(() => import('./MatterDetail'))

function ClientShell() {
  const { workspace } = useAuth()
  const keys = workspace.service_keys
  const copy = clientWorkspace(keys)
  return <Shell nav={clientPortalNav(keys)} badge={copy.badge} mobilePrimary={copy.mobilePrimary} />
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

function RouteFallback() {
  return <LoadingScreen variant="orb" label="Loading your portal…" />
}

export default function PortalApp({ basePath }: { basePath: string }) {
  return (
    <BasePathProvider base={basePath}>
      <Suspense fallback={<RouteFallback />}>
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
              <Route path="matters" element={<Matters />} />
              <Route path="matters/:id" element={<MatterDetail />} />
              <Route path="tasks" element={<ModulePage config={tasksConfig} />} />
              <Route path="documents" element={<Documents />} />
              <Route path="messages" element={<Messages />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="billing" element={<Billing />} />
              <Route path="funding" element={<ModulePage config={fundingConfig} />} />
              <Route path="property-management" element={<Properties />} />
              <Route path="property-management/:id" element={<PropertyProfile />} />
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
      </Suspense>
    </BasePathProvider>
  )
}
