import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from '../ui'
import { useAuth } from '../../lib/auth'
import { useAppPath } from '../../lib/basePath'
import type { NavItem } from '../layout/nav'
import { NotificationBell } from './NotificationBell'
import { btnOutline } from './ui'

// Self-contained staff-console shell (sidebar + topbar). Deliberately not the
// shared ../layout/Shell used by the client portal — same interactive
// behavior (nav highlighting, mobile drawer) but a flat, sharp-edged look
// instead of the glass/blur/gradient treatment, so this can evolve
// independently of the portal.
export function AdminLayout({ nav, badge }: { nav: NavItem[]; badge: string }) {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const p = useAppPath()

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-md border-l-2 px-3 py-2.5 text-sm font-medium transition ${
      isActive ? 'border-gold bg-gold/10 text-gold' : 'border-transparent text-slate-300 hover:bg-white/5 hover:text-white'
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
      <div className="mt-6 rounded-md border border-white/10 bg-white/[0.02] p-3">
        <p className="truncate text-sm font-medium text-white">{user?.full_name || user?.email}</p>
        <p className="truncate text-xs text-slate-500">{user?.email}</p>
        <button onClick={() => logout()} className={`${btnOutline} mt-3 w-full !py-1.5 text-xs`}>
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-navy-950 lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-navy-900 p-4 lg:flex">
        {sidebarContent}
      </aside>

      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-white/10 bg-navy-900 px-4 py-3 lg:hidden">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-slate-400 sm:inline">{badge}</span>
          <NotificationBell />
          <button
            onClick={() => setMobileOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-white"
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
              className="mb-4 self-end grid h-8 w-8 place-items-center rounded-md border border-white/10 text-white"
              aria-label="Close menu"
            >
              ✕
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col">
        <div className="hidden items-center justify-end gap-4 border-b border-white/10 bg-navy-900/60 px-8 py-3 lg:flex">
          <NotificationBell />
          <span className="text-xs uppercase tracking-wide text-slate-500">{badge}</span>
        </div>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
