import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import './index.css'
import './enterprise-polish.css'
import './auth-light-fix.css'
import './mobile-enterprise.css'
import './public-motion.css'
import './brand-motion.css'
import './mail-workspace.css'
import Home from './pages/Home'
import ServicesOverview from './pages/public/ServicesOverview'
import ServiceDetail from './pages/public/ServiceDetail'
import { BusinessOperationsHub, PropertyFieldHub, MobileDocumentHub } from './pages/public/ServiceHubs'
import ProjectGuidePage from './pages/public/ProjectGuides'
import About from './pages/public/About'
import HowItWorks from './pages/public/HowItWorks'
import Resources from './pages/public/Resources'
import ServiceArea from './pages/public/ServiceArea'
import Contact from './pages/public/Contact'
import Professionals from './pages/public/Professionals'
import Terms from './pages/public/Terms'
import Privacy from './pages/public/Privacy'
import ElectronicCommunications from './pages/public/ElectronicCommunications'
import Accessibility from './pages/public/Accessibility'
import ProviderAgreement from './pages/public/ProviderAgreement'
import VerifyDocument from './pages/public/VerifyDocument'
import SignerExperience from './pages/public/SignerExperience'
import SharedDocument from './pages/public/SharedDocument'
import ScopeRequest from './pages/public/ScopeRequest'
import ScopeConfirmation from './pages/public/ScopeConfirmation'
import InstantQuote from './pages/public/InstantQuote'
import QuoteView from './pages/public/QuoteView'
import CarePlans, { CarePlansConfirmation } from './pages/public/CarePlans'
import StrTurnover from './pages/public/StrTurnover'
import StrQuote from './pages/public/StrQuote'
import { AuthProvider } from './lib/auth'
import { ThemeProvider } from './lib/theme'
import { installAudioUnlock } from './lib/sound'
import { AppToaster } from './components/kit/Toaster'
import { LoadingScreen } from './components/LoadingScreen'
import { ScrollToTop } from './components/ScrollToTop'
import { NewVersionBanner } from './components/kit/NewVersionBanner'

const PortalApp = lazy(() => import('./pages/portal/PortalApp'))
const AdminApp = lazy(() => import('./pages/admin/AdminApp'))
const MailApp = lazy(() => import('./pages/mail/MailApp'))

// `orb` remains as a compatibility name for existing lazy-route calls, but
// authenticated surfaces now use the quiet PMV crest rather than an orb.
function SurfaceFallback({ variant = 'brand', label = 'Loading…' }: { variant?: 'brand' | 'orb'; label?: string }) {
  return <LoadingScreen variant={variant} label={label} />
}

const host = window.location.hostname
// mail. is a self-contained Pinnacle communications + signing workspace
// that shares this SPA bundle but presents a completely different shell.
// Detected FIRST so it wins over any other subdomain routing.
const isMailHost = host.startsWith('mail.')
const isSecureHost = host.startsWith('secure.')
const surface: 'admin' | 'portal' | 'public' | 'mail' = (() => {
  if (isMailHost) return 'mail'
  if (isSecureHost) return window.location.pathname.startsWith('/hq') ? 'admin' : 'portal'
  if (host.startsWith('hq.')) return 'admin'
  if (host.startsWith('client.')) return 'portal'
  return 'public'
})()
const secureBase = isSecureHost ? (surface === 'admin' ? '/hq' : '') : ''

document.documentElement.dataset.pmvSurface = surface
installAudioUnlock()

function App() {
  if (surface === 'mail') {
    return <Suspense fallback={<SurfaceFallback variant="orb" label="Loading Mail Workspace…" />}><MailApp /></Suspense>
  }
  if (surface === 'admin') {
    return <Suspense fallback={<SurfaceFallback variant="orb" label="Loading HQ…" />}><Routes><Route path={`${secureBase}/*`} element={<AdminApp basePath={secureBase} />} /></Routes></Suspense>
  }
  if (surface === 'portal') {
    return <Suspense fallback={<SurfaceFallback variant="orb" label="Loading your portal…" />}><Routes><Route path="/*" element={<PortalApp basePath="" />} /></Routes></Suspense>
  }
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/services" element={<ServicesOverview />} />
      <Route path="/services/business-operations" element={<BusinessOperationsHub />} />
      <Route path="/services/property-field" element={<PropertyFieldHub />} />
      <Route path="/services/mobile-documents" element={<MobileDocumentHub />} />
      <Route path="/services/:slug" element={<ServiceDetail />} />
      <Route path="/projects/:slug" element={<ProjectGuidePage />} />
      <Route path="/scope-request" element={<ScopeRequest />} />
      <Route path="/scope-request/confirmation" element={<ScopeConfirmation />} />
      <Route path="/start" element={<Navigate to="/scope-request" replace />} />
      <Route path="/start-a-request" element={<Navigate to="/scope-request" replace />} />
      <Route path="/request-assistance" element={<Navigate to="/scope-request" replace />} />
      <Route path="/how-it-works" element={<HowItWorks />} />
      <Route path="/resources" element={<Resources />} />
      <Route path="/instant-quote" element={<InstantQuote />} />
      <Route path="/quote/:token" element={<QuoteView />} />
      <Route path="/care-plans" element={<CarePlans />} />
      <Route path="/care-plans/confirmation" element={<CarePlansConfirmation />} />
      <Route path="/short-term-rental-support" element={<StrTurnover />} />
      <Route path="/str-quote" element={<StrQuote />} />
      <Route path="/about" element={<About />} />
      <Route path="/service-area" element={<ServiceArea />} />
      <Route path="/professionals" element={<Professionals />} />
      <Route path="/work-with-pinnacle" element={<Navigate to="/professionals" replace />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/electronic-communications" element={<ElectronicCommunications />} />
      <Route path="/accessibility" element={<Accessibility />} />
      <Route path="/provider-agreement" element={<ProviderAgreement />} />
      <Route path="/verify" element={<VerifyDocument />} />
      <Route path="/sign/:token" element={<SignerExperience />} />
      <Route path="/shared/:token" element={<SharedDocument />} />
      <Route path="/portal/*" element={<Suspense fallback={<SurfaceFallback />}><PortalApp basePath="/portal" /></Suspense>} />
      <Route path="/admin/*" element={<Suspense fallback={<SurfaceFallback />}><AdminApp basePath="/admin" /></Suspense>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <MotionConfig reducedMotion="user">
            <ScrollToTop />
            <App />
            <AppToaster />
            <NewVersionBanner />
          </MotionConfig>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
