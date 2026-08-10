import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Menu, X, Search, RotateCw, PanelLeftClose, PanelLeftOpen, Settings, LogOut, ChevronDown } from 'lucide-react'
import { Logo } from '../ui'
import { useAuth } from '../../lib/auth'
import { useAppPath } from '../../lib/basePath'
import type { NavItem } from '../layout/nav'
import { NotificationBell } from './NotificationBell'
import { GlobalSearch } from './GlobalSearch'
import { MailBell } from '../kit/MailBell'
import { Avatar } from '../kit/Avatar'

export function AdminLayout({ nav, badge }: { nav: NavItem[]; badge: string }) {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
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
    `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
      isActive ? 'bg-white/[.08] text-white shadow-sm ring-1 ring-white/10' : 'text-slate-400 hover:bg-white/[.04] hover:text-white'
    }`

  function refreshPage() {
    window.location.reload()
  }

  const grouped: { section: string | null; items: NavItem[] }[] = []
  for (const item of nav) {
    const section = item.section ?? null
    const last = grouped[grouped.length - 1]
    if (last && last.section === section) last.items.push(item)
    else grouped.push({ section, items: [item] })
  }

  const sidebarContent = (
    <>
      <div className="shrink-0 px-1 pb-5">
        <Logo />
        <div className="mt-3 flex items-center gap-2 px-2">
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.12em] text-emerald-300">Live</span>
          <span className="text-[11px] font-medium uppercase tracking-[.12em] text-slate-500">{badge}</span>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
        <div className="space-y-5 pb-5">
          {grouped.map((group, index) => (
            <div key={group.section ?? `__top-${index}`} className="space-y-1">
              {group.section && (
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-600">
                  {group.section}
                </div>
              )}
              {group.items.map((item) => (
                <NavLink key={item.key} to={p(item.to)} end={item.to === ''} className={linkCls} onClick={() => setMobileOpen(false)}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/[.025] text-slate-400 transition group-hover:text-gold">
                    <item.icon size={17} strokeWidth={1.8} />
                  </span>
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </div>
      </nav>

      <div className="relative shrink-0 border-t border-white/10 pt-3">
        <button
          type="button"
          onClick={() => setProfileOpen((v) => !v)}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/[.04]"
        >
          {user && <Avatar userId={user.id} name={user.full_name} size={36} editable uploadPath="/me/avatar" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user?.full_name || user?.email}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
          <ChevronDown size={14} className={`shrink-0 text-slate-500 transition ${profileOpen ? 'rotate-180' : ''}`} />
        </button>
        {profileOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-lg border border-white/10 bg-navy-900 shadow-2xl">
            <NavLink
              to={p('settings')}
              onClick={() => { setProfileOpen(false); setMobileOpen(false) }}
              className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <Settings size={15} /> Settings
            </NavLink>
            <button
              onClick={() => logout()}
              className="flex w-full items-center gap-2 border-t border-white/10 px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        )}
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-navy-950 lg:flex">
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-white/10 bg-navy-900/95 backdrop-blur transition-[width,padding] duration-200 lg:flex print:hidden ${
          sidebarOpen ? 'w-64 border-r p-4' : 'w-0 p-0'
        }`}
      >
        <div className="flex h-full w-64 min-h-0 shrink-0 flex-col">{sidebarContent}</div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-white/10 bg-navy-900/95 backdrop-blur lg:hidden print:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-1.5">
            <button onClick={() => setMobileSearchOpen((v) => !v)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 hover:bg-white/5" aria-label="Search"><Search size={17} /></button>
            <MailBell />
            <NotificationBell />
            <button onClick={() => setMobileOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white" aria-label="Open navigation"><Menu size={18} /></button>
          </div>
        </div>
        {mobileSearchOpen && <div className="border-t border-white/10 px-4 py-3"><GlobalSearch /></div>}
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[86vw] max-w-[320px] min-h-0 flex-col border-r border-white/10 bg-navy-950 p-4 shadow-2xl">
            <div className="flex shrink-0 justify-end pb-2">
              <button onClick={() => setMobileOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-white/5 hover:text-white" aria-label="Close navigation"><X size={17} /></button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">{sidebarContent}</div>
          </aside>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <div className="hidden h-14 items-center justify-between gap-4 border-b border-white/10 bg-navy-900/70 px-6 backdrop-blur lg:flex print:hidden">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button onClick={toggleSidebar} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white" aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'} title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
              {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
            <GlobalSearch className="w-full max-w-md" />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={refreshPage} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-gold" title="Reload page" aria-label="Reload this HQ page"><RotateCw size={14} /></button>
            <MailBell />
            <NotificationBell />
          </div>
        </div>
        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
