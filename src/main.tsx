import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import './index.css'
import './enterprise-polish.css'
import './auth-light-fix.css'
import './mobile-enterprise.css'
import Home from './pages/Home'
import { AuthProvider } from './lib/auth'
import { ThemeProvider } from './lib/theme'
import { installAudioUnlock } from './lib/sound'
import { AppToaster } from './components/kit/Toaster'
import { LoadingScreen } from './components/LoadingScreen'
import { ScrollToTop } from './components/ScrollToTop'

const PortalApp = lazy(() => import('./pages/portal/PortalApp'))
const AdminApp = lazy(() => import('./pages/admin/AdminApp'))
const MailApp = lazy(() => import('./pages/mail/MailApp'))
const ServicesOverview = lazy(() => import('./pages/public/ServicesOverview'))
const ServiceDetail = lazy(() => import('./pages/public/ServiceDetail'))
const BusinessOperationsHub = lazy(() => import('./pages/public/ServiceHubs').then((m) => ({ default: m.BusinessOperationsHub })))
const PropertyFieldHub = lazy(() => import('./pages/public/ServiceHubs').then((m) => ({ default: m.PropertyFieldHub })))
const MobileDocumentHub = lazy(() => import('./pages/public/ServiceHubs').then((m) => ({ default: m.MobileDocumentHub })))
const ProjectGuidePage = lazy(() => import('./pages/public/ProjectGuides'))
const About = lazy(() => import('./pages/public/About'))
const HowItWorks = lazy(() => import('./pages/public/HowItWorks'))
const Resources = lazy(() => import('./pages/public/Resources'))
const ServiceArea = lazy(() => import('./pages/public/ServiceArea'))
const Contact = lazy(() => import('./pages/public/Contact'))
const Professionals = lazy(() => import('./pages/public/Professionals'))
const Terms = lazy(() => import('./pages/public/Terms'))
const Privacy = lazy(() => import('./pages/public/Privacy'))
const ElectronicCommunications = lazy(() => import('./pages/public/ElectronicCommunications'))
const Accessibility = lazy(() => import('./pages/public/Accessibility'))
const ProviderAgreement = lazy(() => import('./pages/public/ProviderAgreement'))
const VerifyDocument = lazy(() => import('./pages/public/VerifyDocument'))
const SignerExperience = lazy(() => import('./pages/public/SignerExperience'))
const SharedDocument = lazy(() => import('./pages/public/SharedDocument'))
const ScopeRequest = lazy(() => import('./pages/public/ScopeRequest'))
const ScopeConfirmation = lazy(() => import('./pages/public/ScopeConfirmation'))
const InstantQuote = lazy(() => import('./pages/public/InstantQuote'))
const QuoteView = lazy(() => import('./pages/public/QuoteView'))
const CarePlans = lazy(() => import('./pages/public/CarePlans'))
const CarePlansConfirmation = lazy(() => import('./pages/public/CarePlans').then((m) => ({ default: m.CarePlansConfirmation })))

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

if (surface === 'public') {
  void import('./public-motion.css')
  void import('./brand-motion.css')
} else {
  void import('./mail-workspace.css')
}

const manifestHref = surface === 'admin' ? '/manifest-hq.json' : surface === 'portal' ? '/manifest-portal.json' : null
if (manifestHref) {
  const link = document.createElement('link')
  link.rel = 'manifest'
  link.href = manifestHref
  document.head.appendChild(link)
}
if ((surface === 'admin' || surface === 'portal') && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

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
    <Suspense fallback={<SurfaceFallback />}>
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
    </Suspense>
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
          </MotionConfig>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
