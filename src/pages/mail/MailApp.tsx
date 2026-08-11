import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { ArrowLeft, Mail, Palette, PenLine } from 'lucide-react'
import { ProtectedRoute } from '../../components/ProtectedRoute'
import { Logo } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import Login from '../auth/Login'
import ForgotPassword from '../auth/ForgotPassword'
import ResetPassword from '../auth/ResetPassword'
import CommunicationsCRMAdmin from '../admin/CommunicationsCRMAdmin'
import EnvelopeWorkspace from '../admin/EnvelopeWorkspace'
import BrandingStudio from './BrandingStudio'
import SignerExperience from '../public/SignerExperience'

const DASHBOARD_URL = 'https://secure.pinnaclemanagementventures.com/hq/'

function WorkspaceShell() {
  const { user, logout } = useAuth()
  const tabs = [
    { to: '/email', label: 'Email', icon: Mail },
    { to: '/signing', label: 'Signing', icon: PenLine },
    { to: '/branding', label: 'Brand Studio', icon: Palette },
  ]
  return (
    <div className="min-h-screen bg-navy-950 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy-950/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-5">
            <a href={DASHBOARD_URL} className="shrink-0"><Logo /></a>
            <div className="hidden h-8 w-px bg-white/10 sm:block" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-gold">Pinnacle Mail</p>
              <p className="truncate font-display text-lg font-semibold text-white">Communications & Signing</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={DASHBOARD_URL} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/[.025] px-3.5 text-sm font-bold text-slate-200 transition hover:border-gold/45 hover:text-gold"><ArrowLeft size={15} /> Back to Dashboard</a>
            <button type="button" onClick={() => logout()} className="hidden min-h-10 rounded-xl px-3 text-sm font-semibold text-slate-500 transition hover:text-white sm:inline-flex sm:items-center">Sign Out</button>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1680px] gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
          {tabs.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({isActive})=>`inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-bold transition ${isActive?'border-gold text-white':'border-transparent text-slate-500 hover:text-slate-200'}`}><Icon size={16}/>{label}</NavLink>)}
        </div>
      </header>
      <main className="mx-auto max-w-[1680px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10"><Outlet /></main>
      <footer className="mx-auto flex max-w-[1680px] flex-col gap-2 border-t border-white/8 px-4 py-6 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <span>Pinnacle Management Ventures · Secure Communications Workspace</span>
        <span>{user?.email}</span>
      </footer>
    </div>
  )
}

export default function MailApp() {
  return (
    <Routes>
      <Route path="/sign/:token" element={<SignerExperience />} />
      <Route path="/login" element={<Login surface="staff" />} />
      <Route path="/forgot-password" element={<ForgotPassword surface="staff" />} />
      <Route path="/reset-password" element={<ResetPassword surface="staff" />} />
      <Route element={<ProtectedRoute allow={['staff','admin']} />}>
        <Route element={<WorkspaceShell />}>
          <Route index element={<Navigate to="/email" replace />} />
          <Route path="/email" element={<CommunicationsCRMAdmin />} />
          <Route path="/signing" element={<EnvelopeWorkspace />} />
          <Route path="/branding" element={<BrandingStudio />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/email" replace />} />
    </Routes>
  )
}
