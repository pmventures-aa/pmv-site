import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Home from './pages/Home'
import PortalPlaceholder from './pages/PortalPlaceholder'
import AdminPlaceholder from './pages/AdminPlaceholder'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/portal/*" element={<PortalPlaceholder />} />
        <Route path="/admin/*" element={<AdminPlaceholder />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
