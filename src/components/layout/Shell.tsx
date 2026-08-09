import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from '../ui'
import { useAuth } from '../../lib/auth'
import { useAppPath } from '../../lib/basePath'
import { Avatar } from '../kit/Avatar'
import { MailBell } from '../kit/MailBell'
import { Icon } from '../kit/Icon'
import { ThemeToggle } from '../ThemeToggle'
import type { NavItem } from './nav'

export function Shell({ nav, badge }: { nav: NavItem[]; badge: string }) {
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
    `group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
      isActive ? 'border-gold/15 bg-gold/12 text-gold shadow-[inset_0_0_18px_rgba(212,175,55,.03)]' : 'text-slate-300 hover:translate-x-0.5 hover:border-white/5 hover:bg-white/5 hover:text-white'
    }`

  function SidebarContent({ mobile = false }: { mobile?: boolean }) {
    return (
      <>
        <div className="mb-6 px-1"><Logo showText={sidebarOpen || mobile} /></div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((item) => (
            <NavLink key={item.key} to={p(item.to)} end={item.to === ''} className={linkCls} onClick={() => mobile && setMobileOpen(false)} title={!sidebarOpen && !mobile ? item.label : undefined}>
              <span className="grid h-6 w-6 shrink-0 place-items-center text-gold transition-transform duration-200 group-hover:scale-105"><Icon name={item.icon} size={18} /></span>
              {(sidebarOpen || mobile) && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        {(sidebarOpen || mobile) ? (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-white/15 hover:bg-white/[0.04]">
            <div className="flex items-center gap-3">
              {user && <Avatar userId={user.id} name={user.full_name} size={36} editable uploadPath="/me/avatar" />}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{user?.full_name || user?.email}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
              </div>
            </div>
            <div className="mt-3"><ThemeToggle /></div>
            <button onClick={() => logout()} className="btn-outline mt-3 w-full !py-1.5 text-xs">Sign out</button>
          </div>
        ) : (
          <div className="mt-6 flex justify-center border-t border-white/10 pt-4">
            <button type="button" onClick={toggleSidebar} className="rounded-full ring-2 ring-transparent transition hover:ring-gold/30" title="Expand sidebar">
              {user && <Avatar userId={user.id} name={user.full_name} size={36} editable={false} />}
            </button>
          </div>
        )}
      </>
    )
  }

  const iconButton = 'grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-300 transition-all duration-200 hover:-translate-y-px hover:border-gold/40 hover:bg-gold/5 hover:text-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60'

  return (
    <div className="min-h-screen bg-navy-radial lg:flex">
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-visible border-r border-white/5 bg-navy-950/60 p-4 backdrop-blur transition-[width,padding] duration-200 lg:flex ${sidebarOpen ? 'w-64' : 'w-[76px] !px-3'}`}>
        <SidebarContent />
      </aside>

      <header className="flex items-center justify-between border-b border-white/5 bg-navy-950/80 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-400 sm:inline">{badge}</span>
          <ThemeToggle compact />
          <MailBell />
          <button onClick={() => setMobileOpen(true)} className={iconButton} aria-label="Open menu"><Icon name="menu" size={19} /></button>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col bg-navy-950 p-4 shadow-2xl">
            <button onClick={() => setMobileOpen(false)} className={`${iconButton} mb-4 self-end`} aria-label="Close menu"><Icon name="close" size={18} /></button>
            <SidebarContent mobile />
          </div>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <div className="hidden items-center justify-between gap-4 border-b border-white/5 bg-navy-950/40 px-8 py-3 lg:flex">
          <button onClick={toggleSidebar} className={iconButton} aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'} title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
            <Icon name={sidebarOpen ? 'chevronLeft' : 'chevronRight'} size={17} />
          </button>
          <div className="flex items-center gap-3"><ThemeToggle compact /><MailBell /><span className="text-xs uppercase tracking-wide text-slate-500">{badge}</span></div>
        </div>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8"><Outlet /></main>
      </div>
    </div>
  )
}
