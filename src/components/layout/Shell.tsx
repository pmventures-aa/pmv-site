import { Suspense, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Menu, X, PanelLeftClose, PanelLeftOpen, ChevronDown, ChevronRight, LogOut, Bell, ShieldCheck, UserRound } from 'lucide-react'
import { Logo } from '../ui'
import { useAuth } from '../../lib/auth'
import { useAppPath } from '../../lib/basePath'
import { Avatar } from '../kit/Avatar'
import { MailBell } from '../kit/MailBell'
import { NotificationFeedPanel } from '../kit/NotificationFeedPanel'
import { LoginBanner } from '../kit/LoginBanner'
import { ImpersonationBanner } from '../kit/ImpersonationBanner'
import { portalMobilePrimary, type NavItem } from './nav'
import { pmvMotion, pmvPanel } from '../../lib/motionTheme'
import { AdminPageBoundary } from '../admin/AdminPageBoundary'

export function Shell({ nav, badge, mobilePrimary = [...portalMobilePrimary] }: { nav: NavItem[]; badge: string; mobilePrimary?: string[] }) {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem('pmv_sidebar_open') !== '0'
  })
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const parsed = JSON.parse(window.localStorage.getItem('pmv_portal_nav_collapsed') || '[]')
      return new Set(Array.isArray(parsed) ? parsed : [])
    } catch { return new Set() }
  })
  const p = useAppPath()
  const location = useLocation()

  function toggleSidebar() {
    setSidebarOpen((open) => {
      const next = !open
      window.localStorage.setItem('pmv_sidebar_open', next ? '1' : '0')
      return next
    })
  }

  function toggleSection(section: string) {
    setCollapsedSections((current) => {
      const next = new Set(current)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      window.localStorage.setItem('pmv_portal_nav_collapsed', JSON.stringify([...next]))
      return next
    })
  }

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium transition ${
      isActive ? 'bg-white/[.07] text-white ring-1 ring-white/[.08]' : 'text-slate-400 hover:bg-white/[.035] hover:text-white'
    }`

  const grouped: { section: string | null; items: NavItem[] }[] = []
  for (const item of nav) {
    const section = item.section ?? null
    const last = grouped[grouped.length - 1]
    if (last && last.section === section) last.items.push(item)
    else grouped.push({ section, items: [item] })
  }

  const profileLinks = [
    { to: p('business-profile'), label: 'Account', icon: UserRound },
    { to: p('security'), label: 'Security', icon: ShieldCheck },
    { to: p('notifications'), label: 'Notifications', icon: Bell },
  ]

  const sidebarContent = (
    <>
      <div className="shrink-0 px-1 pb-3">
        <Logo compact />
        <div className="mt-2 flex items-center gap-2 px-1">
          <span className="rounded-sm border border-gold/20 bg-gold/[.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[.12em] text-gold/80">Secure</span>
          <span className="text-[10px] font-medium uppercase tracking-[.12em] text-slate-600">{badge}</span>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
        <div className="space-y-1.5 pb-3">
          {grouped.map((group, index) => {
            const collapsed = !!group.section && collapsedSections.has(group.section)
            return (
              <div key={group.section ?? `__top-${index}`} className="space-y-1">
                {group.section && (
                  <button type="button" onClick={() => toggleSection(group.section!)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500 transition hover:bg-white/[.025] hover:text-slate-300" aria-expanded={!collapsed}>
                    <span>{group.section}</span>
                    {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  </button>
                )}
                {!collapsed && group.items.map((item) => (
                  <NavLink key={item.key} to={p(item.to)} end={item.to === ''} className={linkCls} onClick={() => setMobileOpen(false)}>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-sm bg-white/[.02] text-slate-500 transition group-hover:text-gold"><item.icon size={15} strokeWidth={1.8} /></span>
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )
          })}
        </div>
      </nav>

      <div className="relative shrink-0 border-t border-white/[.08] pt-3">
        <button type="button" onClick={() => setProfileOpen((v) => !v)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition hover:bg-white/[.035]">
          {user && <Avatar userId={user.id} name={user.full_name} size={30} editable uploadPath="/me/avatar" />}
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{user?.full_name || user?.email}</p><p className="truncate text-xs text-slate-500">{user?.email}</p></div>
          <ChevronDown size={14} className={`shrink-0 text-slate-600 transition ${profileOpen ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence initial={false}>{profileOpen && (
          <motion.div initial={{opacity:0,y:6,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:5,scale:.985}} transition={pmvMotion.ui} className="absolute bottom-full left-0 right-0 mb-1.5 overflow-hidden rounded-md border border-white/[.08] bg-navy-900 shadow-xl">
            {profileLinks.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={() => { setProfileOpen(false); setMobileOpen(false) }} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[.04] hover:text-white">
                <item.icon size={14} /> {item.label}
              </NavLink>
            ))}
            <button onClick={() => logout()} className="flex w-full items-center gap-2 border-t border-white/[.08] px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[.04] hover:text-white"><LogOut size={14}/>Sign out</button>
          </motion.div>
        )}</AnimatePresence>
      </div>
    </>
  )

  const mobileItems = nav.filter((item) => mobilePrimary.includes(item.key))

  return (
    <div className="portal-app min-h-screen bg-navy-radial lg:flex">
      <ImpersonationBanner />
      <LoginBanner />
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-white/[.07] bg-navy-950/75 backdrop-blur-xl transition-[width,padding] duration-200 lg:flex ${sidebarOpen ? 'w-56 border-r p-3' : 'w-0 p-0'}`}>
        <div className="flex h-full w-56 min-h-0 shrink-0 flex-col">{sidebarContent}</div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[.07] bg-navy-950/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Logo compact />
        <div className="flex items-center gap-2"><NotificationFeedPanel surface="portal"/><MailBell /><button onClick={() => setMobileOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg border border-white/[.08] text-white" aria-label="Open menu"><Menu size={18} /></button></div>
      </header>

      <AnimatePresence initial={false}>
      {mobileOpen && (
        <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={pmvMotion.snap}>
          <motion.div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <motion.aside initial={{x:'-100%'}} animate={{x:0}} exit={{x:'-100%'}} transition={pmvMotion.ui} className="absolute inset-y-0 left-0 flex w-[86vw] max-w-[320px] min-h-0 flex-col border-r border-white/[.08] bg-navy-950 p-4 shadow-2xl" role="dialog" aria-modal="true" aria-label="Client navigation">
            <div className="flex shrink-0 justify-end pb-2"><button onClick={() => setMobileOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-white/[.04] hover:text-white" aria-label="Close menu"><X size={16} /></button></div>
            <div className="flex min-h-0 flex-1 flex-col">{sidebarContent}</div>
          </motion.aside>
        </motion.div>
      )}
      </AnimatePresence>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <div className="hidden h-12 items-center justify-between gap-3 border-b border-white/[.07] bg-navy-950/45 px-4 backdrop-blur lg:flex">
          <button onClick={toggleSidebar} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[.04] hover:text-white" aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'} title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>{sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}</button>
          <div className="flex items-center gap-3"><NotificationFeedPanel surface="portal"/><MailBell /><span className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-600">{badge}</span></div>
        </div>
        <AnimatePresence mode="sync" initial={false}>
          <motion.main key={location.pathname} variants={pmvPanel} initial="hidden" animate="show" exit="exit" className="flex-1 px-4 py-4 pb-20 sm:px-5 lg:px-6 lg:py-5 lg:pb-5"><AdminPageBoundary><Suspense fallback={<p className="text-sm text-slate-400">Loading…</p>}><Outlet /></Suspense></AdminPageBoundary></motion.main>
        </AnimatePresence>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[.08] bg-navy-950/95 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden" aria-label="Primary client destinations">
        <div className="grid grid-cols-5 gap-1">
          {mobileItems.map((item) => (
            <NavLink
              key={item.key}
              to={p(item.to)}
              end={item.to === ''}
              className={({ isActive }) => `flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] font-semibold ${isActive ? 'text-gold' : 'text-slate-500'}`}
            >
              <item.icon size={18} strokeWidth={1.8} />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
          <button type="button" onClick={() => setMobileOpen(true)} className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] font-semibold text-slate-500">
            <Menu size={18} strokeWidth={1.8} />
            More
          </button>
        </div>
      </nav>
    </div>
  )
}
