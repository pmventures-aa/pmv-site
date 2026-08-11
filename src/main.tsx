import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import './enterprise-polish.css'
import './mobile-enterprise.css'
import Home from './pages/Home'
import ServicesOverview from './pages/public/ServicesOverview'
import ServiceDetail from './pages/public/ServiceDetail'
import { BusinessOperationsHub, PropertyFieldHub, MobileDocumentHub } from './pages/public/ServiceHubs'
import ProjectGuidePage from './pages/public/ProjectGuides'
import About from './pages/public/About'
import ServiceArea from './pages/public/ServiceArea'
import Contact from './pages/public/Contact'
import Professionals from './pages/public/Professionals'
import Terms from './pages/public/Terms'
import Privacy from './pages/public/Privacy'
import ElectronicCommunications from './pages/public/ElectronicCommunications'
import Accessibility from './pages/public/Accessibility'
import VerifyDocument from './pages/public/VerifyDocument'
import SignerExperience from './pages/public/SignerExperience'
import SharedDocument from './pages/public/SharedDocument'
import { AuthProvider } from './lib/auth'
import { ThemeProvider } from './lib/theme'
import { installAudioUnlock } from './lib/sound'
import { AppToaster } from './components/kit/Toaster'
import { LoadingScreen } from './components/LoadingScreen'

const PortalApp = lazy(() => import('./pages/portal/PortalApp'))
const AdminApp = lazy(() => import('./pages/admin/AdminApp'))

function SurfaceFallback() { return <LoadingScreen /> }

const host = window.location.hostname
const isSecureHost = host.startsWith('secure.')
const surface: 'admin' | 'portal' | 'public' = (() => {
  if (isSecureHost) return window.location.pathname.startsWith('/hq') ? 'admin' : 'portal'
  if (host.startsWith('hq.')) return 'admin'
  if (host.startsWith('client.')) return 'portal'
  return 'public'
})()
const secureBase = isSecureHost ? (surface === 'admin' ? '/hq' : '') : ''

document.documentElement.dataset.pmvSurface = surface
installAudioUnlock()

function App() {
  if (surface === 'admin') {
    return <Suspense fallback={<SurfaceFallback />}><Routes><Route path={`${secureBase}/*`} element={<AdminApp basePath={secureBase} />} /></Routes></Suspense>
  }
  if (surface === 'portal') {
    return <Suspense fallback={<SurfaceFallback />}><Routes><Route path="/*" element={<PortalApp basePath="" />} /></Routes></Suspense>
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
      <Route path="/about" element={<About />} />
      <Route path="/service-area" element={<ServiceArea />} />
      <Route path="/professionals" element={<Professionals />} />
      <Route path="/work-with-pinnacle" element={<Navigate to="/professionals" replace />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/electronic-communications" element={<ElectronicCommunications />} />
      <Route path="/accessibility" element={<Accessibility />} />
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
          <App />
          <AppToaster />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
