import { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
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
  const location = useLocation()
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

  const groupedNav = useMemo(() => {
    const groups: { section: string; items: NavItem[] }[] = []
    for (const item of nav) {
      const section = item.section || 'Workspace'
      const current = groups[groups.length - 1]
      if (!current || current.section !== section) groups.push({ section, items: [item] })
      else current.items.push(item)
    }
    return groups
  }, [nav])

  const activeLabel = useMemo(() => {
    const cleanPath = location.pathname.replace(/^\/admin\/?/, '').replace(/^\//, '')
    const match = nav
      .filter((item) => item.to)
      .sort((a, b) => b.to.length - a.to.length)
      .find((item) => cleanPath === item.to || cleanPath.startsWith(`${item.to}/`))
    return match?.label || nav.find((item) => item.to === '')?.label || 'Dashboard'
  }, [location.pathname, nav])

  const linkCls = (compact: boolean) => ({ isActive }: { isActive: boolean }) =>
    `group relative flex items-center rounded-md border-l-2 py-2.5 text-sm font-medium transition ${
      compact ? 'justify-center px-2' : 'gap-3 px-3'
    } ${
      isActive
        ? 'border-gold bg-gold/10 text-gold'
        : 'border-transparent text-slate-300 hover:bg-white/5 hover:text-white'
    }`

  function refreshPage() {
    window.location.reload()
  }

  function SidebarContent({ compact = false, mobile = false }: { compact?: boolean; mobile?: boolean }) {
    const displayName = user?.full_name || user?.email || 'Pinnacle user'
    return (
      <>
        <div className={`mb-5 flex min-h-12 items-center ${compact ? 'justify-center px-0' : 'px-1'}`}>
          <Logo showText={!compact} />
        </div>

        <nav className="flex flex-1 flex-col overflow-y-auto pr-0.5">
          {groupedNav.map((group, groupIndex) => (
            <div key={group.section} className={groupIndex === 0 ? '' : 'mt-5'}>
              {!compact && (
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  {group.section}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.key}
                    to={p(item.to)}
                    end={item.to === ''}
                    className={linkCls(compact)}
                    onClick={() => mobile && setMobileOpen(false)}
                    title={compact ? item.label : undefined}
                    aria-label={compact ? item.label : undefined}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center text-[15px] leading-none text-gold/90">
                      {item.icon}
                    </span>
                    {!compact && <span className="min-w-0 truncate">{item.label}</span>}
                    {compact && (
                      <span className="pointer-events-none absolute left-[calc(100%+10px)] z-50 hidden whitespace-nowrap rounded-md border border-white/10 bg-navy-900 px-2.5 py-1.5 text-xs text-white shadow-xl group-hover:block">
                        {item.label}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {compact ? (
          <div className="mt-5 flex justify-center border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={toggleSidebar}
              className="rounded-full ring-2 ring-transparent transition hover:ring-gold/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              title={`${displayName} — expand sidebar`}
              aria-label={`${displayName} — expand sidebar`}
            >
              {user && <Avatar userId={user.id} name={user.full_name} size={38} editable={false} />}
            </button>
          </div>
        ) : (
          <div className="mt-5 rounded-md border border-white/10 bg-white/[0.025] p-3">
            <div className="flex items-center gap-3">
              {user && <Avatar userId={user.id} name={user.full_name} size={36} editable uploadPath="/me/avatar" />}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{displayName}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
              </div>
            </div>
            <button onClick={() => logout()} className={`${btnOutline} mt-3 w-full !py-1.5 text-xs`}>
              Sign out
            </button>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="min-h-screen bg-navy-950 lg:flex">
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-visible border-r border-white/10 bg-navy-900 transition-[width,padding] duration-200 lg:flex print:hidden ${
          sidebarOpen ? 'w-64 p-4' : 'w-[76px] p-3'
        }`}
      >
        <SidebarContent compact={!sidebarOpen} />
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
              ↻
            </button>
            <button
              onClick={() => setMobileSearchOpen((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-slate-300"
              aria-label="Search"
            >
              ⌕
            </button>
            <MailBell />
            <NotificationBell />
            <button
              onClick={() => setMobileOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-white"
              aria-label="Open menu"
            >
              ☰
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
              ✕
            </button>
            <SidebarContent mobile />
          </div>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <div className="hidden items-center justify-between gap-4 border-b border-white/10 bg-navy-900/70 px-6 py-3 lg:flex xl:px-8 print:hidden">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 text-slate-300 transition hover:border-gold/40 hover:text-gold"
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? '⟨' : '⟩'}
            </button>
            <div className="hidden min-w-28 xl:block">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{badge}</p>
              <p className="mt-0.5 truncate text-sm font-medium text-slate-200">{activeLabel}</p>
            </div>
            <GlobalSearch className="w-full max-w-sm" />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              onClick={refreshPage}
              className={`${btnOutline} !px-3 !py-1.5 text-xs`}
              title="Reload the current HQ page and its latest data"
            >
              ↻ Refresh
            </button>
            <MailBell />
            <NotificationBell />
          </div>
        </div>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 xl:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
