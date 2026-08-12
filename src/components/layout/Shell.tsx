import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Menu, X, PanelLeftClose, PanelLeftOpen, ChevronDown, LogOut } from 'lucide-react'
import { Logo } from '../ui'
import { useAuth } from '../../lib/auth'
import { useAppPath } from '../../lib/basePath'
import { Avatar } from '../kit/Avatar'
import { MailBell } from '../kit/MailBell'
import type { NavItem } from './nav'
import { pmvMotion, pmvPanel } from '../../lib/motionTheme'
import { AdminPageBoundary } from '../admin/AdminPageBoundary'

export function Shell({ nav, badge }: { nav: NavItem[]; badge: string }) {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  // Portal sidebar defaults CLOSED on first visit - the Command Center
  // dashboard is the client's real navigation, so the sidebar is a
  // secondary control they can pin open if they prefer. Once they toggle
  // it, we remember their choice via localStorage on both directions.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    const stored = window.localStorage.getItem('pmv_sidebar_open')
    return stored === '1'
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

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
      isActive ? 'bg-white/[.07] text-white ring-1 ring-white/[.08]' : 'text-slate-400 hover:bg-white/[.035] hover:text-white'
    }`

  const sidebarContent = (
    <>
      <div className="shrink-0 px-1 pb-5">
        <Logo />
        <div className="mt-3 flex items-center gap-2 px-2">
          <span className="rounded-full border border-gold/20 bg-gold/[.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.12em] text-gold/80">Secure</span>
          <span className="text-[11px] font-medium uppercase tracking-[.12em] text-slate-600">{badge}</span>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
        <div className="space-y-1 pb-5">
          {nav.map((item) => (
            <NavLink key={item.key} to={p(item.to)} end={item.to === ''} className={linkCls} onClick={() => setMobileOpen(false)}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/[.02] text-slate-500 transition group-hover:text-gold"><item.icon size={17} strokeWidth={1.8} /></span>
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="relative shrink-0 border-t border-white/[.08] pt-3">
        <button type="button" onClick={() => setProfileOpen((v) => !v)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/[.035]">
          {user && <Avatar userId={user.id} name={user.full_name} size={36} editable uploadPath="/me/avatar" />}
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{user?.full_name || user?.email}</p><p className="truncate text-xs text-slate-500">{user?.email}</p></div>
          <ChevronDown size={14} className={`shrink-0 text-slate-600 transition ${profileOpen ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence initial={false}>{profileOpen && <motion.div initial={{opacity:0,y:6,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:5,scale:.985}} transition={pmvMotion.ui} className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-white/[.08] bg-navy-900 shadow-2xl"><button onClick={() => logout()} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/[.04] hover:text-white"><LogOut size={15}/>Sign out</button></motion.div>}</AnimatePresence>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-navy-radial lg:flex">
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-white/[.07] bg-navy-950/75 backdrop-blur-xl transition-[width,padding] duration-200 lg:flex ${sidebarOpen ? 'w-64 border-r p-4' : 'w-0 p-0'}`}>
        <div className="flex h-full w-64 min-h-0 shrink-0 flex-col">{sidebarContent}</div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[.07] bg-navy-950/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Logo />
        <div className="flex items-center gap-2"><MailBell /><button onClick={() => setMobileOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg border border-white/[.08] text-white" aria-label="Open menu"><Menu size={18} /></button></div>
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
        <div className="hidden h-14 items-center justify-between gap-4 border-b border-white/[.07] bg-navy-950/45 px-6 backdrop-blur lg:flex">
          <button onClick={toggleSidebar} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[.04] hover:text-white" aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'} title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>{sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}</button>
          <div className="flex items-center gap-3"><MailBell /><span className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-600">{badge}</span></div>
        </div>
        <AnimatePresence mode="sync" initial={false}>
          <motion.main key={location.pathname} variants={pmvPanel} initial="hidden" animate="show" exit="exit" className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7"><AdminPageBoundary><Outlet /></AdminPageBoundary></motion.main>
        </AnimatePresence>
      </div>
    </div>
  )
}
