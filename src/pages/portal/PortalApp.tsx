import { Suspense, lazy, type ReactNode } from 'react'
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
import { ModulePage } from './ModulePage'
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
const CalendarPage = lazy(() => import('./CalendarPage'))
const Properties = lazy(() => import('./Properties'))
const PropertyProfile = lazy(() => import('./PropertyProfile'))
const Matters = lazy(() => import('./Matters'))
const MatterDetail = lazy(() => import('./MatterDetail'))

function PageFallback() {
  return <LoadingScreen variant="orb" label="Loading…" />
}

function L({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>
}

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
        <Route path="demo" element={<L><ClientPortalDemo /></L>} />

        <Route element={<ProtectedRoute allow={['trusted_contact']} />}>
          <Route path="trusted" element={<L><TrustedPortal /></L>} />
        </Route>

        <Route element={<ProtectedRoute allow={['client']} />}>
          <Route path="onboarding" element={<L><OnboardingWizard /></L>} />
          <Route element={<ClientShell />}>
            <Route index element={<L><Dashboard /></L>} />
            <Route path="planned-calls" element={<ModulePage config={callsConfig} />} />
            <Route path="services" element={<L><Services /></L>} />
            <Route path="services/:key/apply" element={<L><ServiceApplication /></L>} />
            <Route path="matters" element={<L><Matters /></L>} />
            <Route path="matters/:id" element={<L><MatterDetail /></L>} />
            <Route path="tasks" element={<ModulePage config={tasksConfig} />} />
            <Route path="documents" element={<L><Documents /></L>} />
            <Route path="messages" element={<L><Messages /></L>} />
            <Route path="calendar" element={<L><CalendarPage /></L>} />
            <Route path="billing" element={<L><Billing /></L>} />
            <Route path="funding" element={<ModulePage config={fundingConfig} />} />
            <Route path="property-management" element={<L><Properties /></L>} />
            <Route path="property-management/:id" element={<L><PropertyProfile /></L>} />
            <Route path="tax-filings" element={<ModulePage config={taxConfig} />} />
            <Route path="support" element={<L><Support /></L>} />
            <Route path="business-profile" element={<L><BusinessProfile /></L>} />
            <Route path="my-team" element={<L><MyTeam /></L>} />
            <Route path="trusted-contacts" element={<L><TrustedContacts /></L>} />
            <Route path="notifications" element={<L><Notifications /></L>} />
            <Route path="security" element={<L><Security /></L>} />
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
