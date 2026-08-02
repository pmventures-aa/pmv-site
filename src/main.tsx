import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import Home from './pages/Home'
import PortalPlaceholder from './pages/PortalPlaceholder'
import AdminPlaceholder from './pages/AdminPlaceholder'

// Serve different apps from one deployment based on hostname:
//   hq.*      -> staff console
//   client.*  -> client portal
//   (apex)    -> public marketing site (portal/admin still reachable by path for preview)
const host = window.location.hostname
const surface: 'admin' | 'portal' | 'public' =
  host.startsWith('hq.') ? 'admin' : host.startsWith('client.') ? 'portal' : 'public'

function App() {
  if (surface === 'admin') {
    return (
      <Routes>
        <Route path="/*" element={<AdminPlaceholder />} />
      </Routes>
    )
  }
  if (surface === 'portal') {
    return (
      <Routes>
        <Route path="/*" element={<PortalPlaceholder />} />
      </Routes>
    )
  }
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/portal/*" element={<PortalPlaceholder />} />
      <Route path="/admin/*" element={<AdminPlaceholder />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
