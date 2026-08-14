import { Suspense, lazy, type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '../../components/ProtectedRoute'
import { Shell } from '../../components/layout/Shell'
import { clientPortalNav } from '../../components/layout/nav'
import { BasePathProvider, useAppPath } from '../../lib/basePath'
import { useAuth } from '../../lib/auth'
import { clientWorkspace } from '../../lib/workspace'
import { LoadingScreen } from '../../components/LoadingScreen'
import { callsConfig, tasksConfig, fundingConfig, taxConfig } from './moduleConfigs'

const Login = lazy(() => import('../auth/Login'))
const Signup = lazy(() => import('../auth/Signup'))
const ForgotPassword = lazy(() => import('../auth/ForgotPassword'))
const ResetPassword = lazy(() => import('../auth/ResetPassword'))
const SetPassword = lazy(() => import('../auth/SetPassword'))
const TrustedInvite = lazy(() => import('../auth/TrustedInvite'))
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

function PageFallback() {
  return <LoadingScreen variant="brand" label="Loading…" />
}

function Lazy({ children }: { children: ReactNode }) {
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
        <Route path="login" element={<Lazy><Login surface="client" /></Lazy>} />
        <Route path="signup" element={<Lazy><Signup /></Lazy>} />
        <Route path="forgot-password" element={<Lazy><ForgotPassword surface="client" /></Lazy>} />
        <Route path="reset-password" element={<Lazy><ResetPassword surface="client" /></Lazy>} />
        <Route path="set-password" element={<Lazy><SetPassword surface="client" /></Lazy>} />
        <Route path="trusted-invite/:token" element={<Lazy><TrustedInvite /></Lazy>} />
        <Route path="demo" element={<Lazy><ClientPortalDemo /></Lazy>} />

        <Route element={<ProtectedRoute allow={['trusted_contact']} />}>
          <Route path="trusted" element={<Lazy><TrustedPortal /></Lazy>} />
        </Route>

        <Route element={<ProtectedRoute allow={['client']} />}>
          <Route path="onboarding" element={<Lazy><OnboardingWizard /></Lazy>} />
          <Route element={<ClientShell />}>
            <Route index element={<Lazy><Dashboard /></Lazy>} />
            <Route path="planned-calls" element={<Lazy><ModulePage config={callsConfig} /></Lazy>} />
            <Route path="services" element={<Lazy><Services /></Lazy>} />
            <Route path="services/:key/apply" element={<Lazy><ServiceApplication /></Lazy>} />
            <Route path="matters" element={<Lazy><Matters /></Lazy>} />
            <Route path="matters/:id" element={<Lazy><MatterDetail /></Lazy>} />
            <Route path="tasks" element={<Lazy><ModulePage config={tasksConfig} /></Lazy>} />
            <Route path="documents" element={<Lazy><Documents /></Lazy>} />
            <Route path="messages" element={<Lazy><Messages /></Lazy>} />
            <Route path="calendar" element={<Lazy><CalendarPage /></Lazy>} />
            <Route path="billing" element={<Lazy><Billing /></Lazy>} />
            <Route path="funding" element={<Lazy><ModulePage config={fundingConfig} /></Lazy>} />
            <Route path="property-management" element={<Lazy><Properties /></Lazy>} />
            <Route path="property-management/:id" element={<Lazy><PropertyProfile /></Lazy>} />
            <Route path="tax-filings" element={<Lazy><ModulePage config={taxConfig} /></Lazy>} />
            <Route path="support" element={<Lazy><Support /></Lazy>} />
            <Route path="business-profile" element={<Lazy><BusinessProfile /></Lazy>} />
            <Route path="my-team" element={<Lazy><MyTeam /></Lazy>} />
            <Route path="trusted-contacts" element={<Lazy><TrustedContacts /></Lazy>} />
            <Route path="notifications" element={<Lazy><Notifications /></Lazy>} />
            <Route path="security" element={<Lazy><Security /></Lazy>} />
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
