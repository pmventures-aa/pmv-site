import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import Home from './pages/Home'
import ServicesOverview from './pages/public/ServicesOverview'
import ServiceDetail from './pages/public/ServiceDetail'
import About from './pages/public/About'
import ServiceArea from './pages/public/ServiceArea'
import Contact from './pages/public/Contact'
import Terms from './pages/public/Terms'
import { AuthProvider } from './lib/auth'
import { AppToaster } from './components/kit/Toaster'

// Portal and admin are full, separate SPAs bundled with their own dependencies
// (Radix Dialog/AlertDialog, sonner) — code-split so a public-site visitor
// never downloads either, and vice versa.
const PortalApp = lazy(() => import('./pages/portal/PortalApp'))
const AdminApp = lazy(() => import('./pages/admin/AdminApp'))

function SurfaceFallback() {
  return <div className="min-h-screen bg-navy-950" />
}

// Serve different apps from one deployment based on hostname:
//   hq.*      -> staff console
//   client.*  -> client portal
//   (apex)    -> public marketing site (portal/admin also reachable by path for preview)
const host = window.location.hostname
const surface: 'admin' | 'portal' | 'public' =
  host.startsWith('hq.') ? 'admin' : host.startsWith('client.') ? 'portal' : 'public'

function App() {
  if (surface === 'admin') {
    return (
      <Suspense fallback={<SurfaceFallback />}>
        <Routes>
          <Route path="/*" element={<AdminApp basePath="" />} />
        </Routes>
      </Suspense>
    )
  }
  if (surface === 'portal') {
    return (
      <Suspense fallback={<SurfaceFallback />}>
        <Routes>
          <Route path="/*" element={<PortalApp basePath="" />} />
        </Routes>
      </Suspense>
    )
  }
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/services" element={<ServicesOverview />} />
      <Route path="/services/:slug" element={<ServiceDetail />} />
      <Route path="/about" element={<About />} />
      <Route path="/service-area" element={<ServiceArea />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/terms" element={<Terms />} />
      <Route
        path="/portal/*"
        element={
          <Suspense fallback={<SurfaceFallback />}>
            <PortalApp basePath="/portal" />
          </Suspense>
        }
      />
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<SurfaceFallback />}>
            <AdminApp basePath="/admin" />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <AppToaster />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
