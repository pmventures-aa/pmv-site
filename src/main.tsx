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
import { AuthProvider } from './lib/auth'
import { ThemeProvider } from './lib/theme'
import { installAudioUnlock } from './lib/sound'
import { AppToaster } from './components/kit/Toaster'
import { LoadingScreen } from './components/LoadingScreen'
import { ScrollToTop } from './components/ScrollToTop'

const PortalApp = lazy(() => import('./pages/portal/PortalApp'))
const AdminApp = lazy(() => import('./pages/admin/AdminApp'))
const MailApp = lazy(() => import('./pages/mail/MailApp'))

const Home = lazy(() => import('./pages/Home'))
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

function SurfaceFallback({ variant = 'brand', label = 'Loading…' }: { variant?: 'brand' | 'orb'; label?: string }) {
  return <LoadingScreen variant={variant} label={label} />
}

function PublicPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<SurfaceFallback label="Loading…" />}>{children}</Suspense>
}

const host = window.location.hostname
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

// Vendor / HQ PWA shell on secure./hq — same hostname, no m. subdomain.
if (surface === 'admin' && typeof document !== 'undefined') {
  const existing = document.querySelector('link[rel="manifest"]')
  if (!existing) {
    const link = document.createElement('link')
    link.rel = 'manifest'
    link.href = '/manifest-hq.json'
    document.head.appendChild(link)
  }
  const metaApple = document.createElement('meta')
  metaApple.name = 'apple-mobile-web-app-capable'
  metaApple.content = 'yes'
  if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) document.head.appendChild(metaApple)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw-hq.js').catch(() => {})
    })
  }
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
    <Routes>
      <Route path="/" element={<PublicPage><Home /></PublicPage>} />
      <Route path="/services" element={<PublicPage><ServicesOverview /></PublicPage>} />
      <Route path="/services/business-operations" element={<PublicPage><BusinessOperationsHub /></PublicPage>} />
      <Route path="/services/property-field" element={<PublicPage><PropertyFieldHub /></PublicPage>} />
      <Route path="/services/mobile-documents" element={<PublicPage><MobileDocumentHub /></PublicPage>} />
      <Route path="/services/:slug" element={<PublicPage><ServiceDetail /></PublicPage>} />
      <Route path="/projects/:slug" element={<PublicPage><ProjectGuidePage /></PublicPage>} />
      <Route path="/scope-request" element={<PublicPage><ScopeRequest /></PublicPage>} />
      <Route path="/scope-request/confirmation" element={<PublicPage><ScopeConfirmation /></PublicPage>} />
      <Route path="/start" element={<Navigate to="/scope-request" replace />} />
      <Route path="/start-a-request" element={<Navigate to="/scope-request" replace />} />
      <Route path="/request-assistance" element={<Navigate to="/scope-request" replace />} />
      <Route path="/how-it-works" element={<PublicPage><HowItWorks /></PublicPage>} />
      <Route path="/resources" element={<PublicPage><Resources /></PublicPage>} />
      <Route path="/instant-quote" element={<PublicPage><InstantQuote /></PublicPage>} />
      <Route path="/quote/:token" element={<PublicPage><QuoteView /></PublicPage>} />
      <Route path="/care-plans" element={<PublicPage><CarePlans /></PublicPage>} />
      <Route path="/care-plans/confirmation" element={<PublicPage><CarePlansConfirmation /></PublicPage>} />
      <Route path="/about" element={<PublicPage><About /></PublicPage>} />
      <Route path="/service-area" element={<PublicPage><ServiceArea /></PublicPage>} />
      <Route path="/professionals" element={<PublicPage><Professionals /></PublicPage>} />
      <Route path="/work-with-pinnacle" element={<Navigate to="/professionals" replace />} />
      <Route path="/contact" element={<PublicPage><Contact /></PublicPage>} />
      <Route path="/terms" element={<PublicPage><Terms /></PublicPage>} />
      <Route path="/privacy" element={<PublicPage><Privacy /></PublicPage>} />
      <Route path="/electronic-communications" element={<PublicPage><ElectronicCommunications /></PublicPage>} />
      <Route path="/accessibility" element={<PublicPage><Accessibility /></PublicPage>} />
      <Route path="/provider-agreement" element={<PublicPage><ProviderAgreement /></PublicPage>} />
      <Route path="/verify" element={<PublicPage><VerifyDocument /></PublicPage>} />
      <Route path="/sign/:token" element={<PublicPage><SignerExperience /></PublicPage>} />
      <Route path="/shared/:token" element={<PublicPage><SharedDocument /></PublicPage>} />
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
          </MotionConfig>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
