import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import Home from './pages/Home'
import ServicesOverview from './pages/public/ServicesOverview'
import ServiceDetail from './pages/public/ServiceDetail'
import About from './pages/public/About'
import ServiceArea from './pages/public/ServiceArea'
import Contact from './pages/public/Contact'
import PortalApp from './pages/portal/PortalApp'
import AdminApp from './pages/admin/AdminApp'
import { AuthProvider } from './lib/auth'

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
      <Routes>
        <Route path="/*" element={<AdminApp />} />
      </Routes>
    )
  }
  if (surface === 'portal') {
    return (
      <Routes>
        <Route path="/*" element={<PortalApp />} />
      </Routes>
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
      <Route path="/portal/*" element={<PortalApp />} />
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
