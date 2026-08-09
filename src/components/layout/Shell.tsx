import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from '../ui'
import { useAuth } from '../../lib/auth'
import { useAppPath } from '../../lib/basePath'
import { Avatar } from '../kit/Avatar'
import { MailBell } from '../kit/MailBell'
import type { NavItem } from './nav'

export function Shell({
  nav,
  badge,
}: {
  nav: NavItem[]
  badge: string
}) {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem('pmv_sidebar_open') !== '0'
  })
  const p = useAppPath()

  function toggleSidebar() {
    setSidebarOpen((open) => {
      const next = !open
      window.localStorage.setItem('pmv_sidebar_open', next ? '1' : '0')
      return next
    })
  }

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
      isActive ? 'bg-gold/15 text-gold' : 'text-slate-300 hover:bg-white/5 hover:text-white'
    }`

  const sidebarContent = (
    <>
      <div className="mb-6 px-1">
        <Logo />
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {nav.map((item) => (
          <NavLink key={item.key} to={p(item.to)} end={item.to === ''} className={linkCls} onClick={() => setMobileOpen(false)}>
            <span className="grid h-6 w-6 place-items-center text-base leading-none text-gold">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center gap-3">
          {user && <Avatar userId={user.id} name={user.full_name} size={36} editable uploadPath="/me/avatar" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{user?.full_name || user?.email}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
        </div>
        <button onClick={() => logout()} className="btn-outline mt-3 w-full !py-1.5 text-xs">
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-navy-radial lg:flex">
      {/* Desktop sidebar */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-white/5 bg-navy-950/60 backdrop-blur transition-[width,padding] duration-200 lg:flex ${
          sidebarOpen ? 'w-64 border-r p-4' : 'w-0 p-0'
        }`}
      >
        <div className="flex w-64 shrink-0 flex-1 flex-col">{sidebarContent}</div>
      </aside>

      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-white/5 bg-navy-950/80 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-slate-400 sm:inline">{badge}</span>
          <MailBell />
          <button
            onClick={() => setMobileOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white"
            aria-label="Open menu"
          >
            ☰
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col bg-navy-950 p-4 shadow-2xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="mb-4 self-end grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white"
              aria-label="Close menu"
            >
              ✕
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col">
        <div className="hidden items-center justify-between gap-4 border-b border-white/5 bg-navy-950/40 px-8 py-3 lg:flex">
          <button
            onClick={toggleSidebar}
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-300 transition hover:bg-white/5 hover:text-white"
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? '⟨' : '⟩'}
          </button>
          <div className="flex items-center gap-4">
            <MailBell />
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
