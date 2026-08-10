import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Menu, X, Search, RotateCw, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Logo } from '../ui'
import { useAuth } from '../../lib/auth'
import { useAppPath } from '../../lib/basePath'
import type { NavItem } from '../layout/nav'
import { NotificationBell } from './NotificationBell'
import { GlobalSearch } from './GlobalSearch'
import { MailBell } from '../kit/MailBell'
import { Avatar } from '../kit/Avatar'
import { btnOutline } from './ui'

export function AdminLayout({ nav, badge }: { nav: NavItem[]; badge: string }) {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem('pmv_hq_sidebar_open') !== '0'
  })
  const p = useAppPath()

  function toggleSidebar() {
    setSidebarOpen((open) => {
      const next = !open
      window.localStorage.setItem('pmv_hq_sidebar_open', next ? '1' : '0')
      return next
    })
  }

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-md border-l-2 px-3 py-2.5 text-sm font-medium transition ${
      isActive ? 'border-gold bg-gold/10 text-gold' : 'border-transparent text-slate-300 hover:bg-white/5 hover:text-white'
    }`

  function refreshPage() {
    window.location.reload()
  }

  const sidebarContent = (
    <>
      <div className="mb-6 px-1">
        <Logo />
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {nav.map((item) => (
          <NavLink key={item.key} to={p(item.to)} end={item.to === ''} className={linkCls} onClick={() => setMobileOpen(false)}>
            <span className="grid h-6 w-6 shrink-0 place-items-center text-gold"><item.icon size={18} strokeWidth={1.75} /></span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-6 rounded-md border border-white/10 bg-white/[0.02] p-3">
        <div className="flex items-center gap-3">
          {user && <Avatar userId={user.id} name={user.full_name} size={36} editable uploadPath="/me/avatar" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{user?.full_name || user?.email}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
        </div>
        <button onClick={() => logout()} className={`${btnOutline} mt-3 w-full !py-1.5 text-xs`}>
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-navy-950 lg:flex">
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-white/10 bg-navy-900 transition-[width,padding] duration-200 lg:flex print:hidden ${
          sidebarOpen ? 'w-64 border-r p-4' : 'w-0 p-0'
        }`}
      >
        <div className="flex w-64 shrink-0 flex-1 flex-col">{sidebarContent}</div>
      </aside>

      <header className="border-b border-white/10 bg-navy-900 lg:hidden print:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo />
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-slate-400 sm:inline">{badge}</span>
            <button
              onClick={refreshPage}
              className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-slate-300 transition hover:border-gold/40 hover:text-gold"
              aria-label="Refresh this HQ page"
              title="Refresh page"
            >
              <RotateCw size={16} />
            </button>
            <button
              onClick={() => setMobileSearchOpen((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-slate-300"
              aria-label="Search"
            >
              <Search size={16} />
            </button>
            <MailBell />
            <NotificationBell />
            <button
              onClick={() => setMobileOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-white"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
          </div>
        </div>
        {mobileSearchOpen && (
          <div className="border-t border-white/10 px-4 py-3">
            <GlobalSearch />
          </div>
        )}
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col bg-navy-950 p-4 shadow-2xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="mb-4 self-end grid h-8 w-8 place-items-center rounded-md border border-white/10 text-white"
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col">
        <div className="hidden items-center justify-between gap-4 border-b border-white/10 bg-navy-900/60 px-8 py-3 lg:flex print:hidden">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 text-slate-300 transition hover:border-gold/40 hover:text-gold"
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
            <GlobalSearch className="w-full max-w-sm" />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              onClick={refreshPage}
              className={`${btnOutline} !px-3 !py-1.5 text-xs`}
              title="Reload the current HQ page and its latest data"
            >
              <RotateCw size={13} /> Refresh
            </button>
            <MailBell />
            <NotificationBell />
            <span className="text-xs uppercase tracking-wide text-slate-500">{badge}</span>
          </div>
        </div>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
