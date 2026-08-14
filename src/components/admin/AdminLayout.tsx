import { Suspense, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Menu, X, Search, RotateCw, PanelLeftClose, PanelLeftOpen, ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react'
import { Logo } from '../ui'
import { useAppPath } from '../../lib/basePath'
import { vendorMobilePrimary, vendorMobileTabLabel, type NavItem } from '../layout/nav'
import { NotificationBell } from './NotificationBell'
import { NotificationFeedPanel } from '../kit/NotificationFeedPanel'
import { ImpersonationBanner } from '../kit/ImpersonationBanner'
import { GlobalSearch } from './GlobalSearch'
import { MailBell } from '../kit/MailBell'
import { SlaAlertChip } from './SlaAlertChip'
import { AdminPageBoundary } from './AdminPageBoundary'
import { WhoMenu } from './WhoMenu'
import { pmvMotion, pmvPanel } from '../../lib/motionTheme'
import { useEmailUnreadCount } from '../../lib/useEmailUnread'

function PageFallback() {
  return <p className="px-1 py-8 text-sm text-slate-400">Loading…</p>
}

// `badge` prop kept for callers that still pass it but no longer rendered
// anywhere in the layout - it was showing as "STAFF CONSOLE" chrome the
// user asked to remove.
export function AdminLayout({ nav, badge: _badge, vendorMobile = false }: { nav: NavItem[]; badge?: string; vendorMobile?: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem('pmv_hq_sidebar_open') !== '0'
  })
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    const firstVisitDefault = new Set(['Intelligence'])
    if (typeof window === 'undefined') return firstVisitDefault
    try {
      const raw = window.localStorage.getItem('pmv_hq_nav_collapsed')
      if (raw == null) return firstVisitDefault
      const parsed = JSON.parse(raw)
      return new Set(Array.isArray(parsed) ? parsed : ['Intelligence'])
    } catch { return firstVisitDefault }
  })
  const p = useAppPath()
  const location = useLocation()
  const canOpenSettings = nav.some((item) => item.key === 'settings')
  const { count: emailUnread } = useEmailUnreadCount()
  const hideHqNav = /(^|\/)(messages|communications)(\/|$)/.test(location.pathname)
  const mailWorkspace = /(^|\/)messages(\/|$)/.test(location.pathname)
  const vendorTabs = nav.filter((item) => (vendorMobilePrimary as readonly string[]).includes(item.key))
  const vendorHome = 'field-work/mine'
  const vendorShellPad = vendorMobile ? 'pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0' : ''

  function toggleSidebar() {
    setSidebarOpen((open) => {
      const next = !open
      window.localStorage.setItem('pmv_hq_sidebar_open', next ? '1' : '0')
      return next
    })
  }

  function toggleSection(section: string) {
    setCollapsedSections((current) => {
      const next = new Set(current)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      window.localStorage.setItem('pmv_hq_nav_collapsed', JSON.stringify([...next]))
      return next
    })
  }

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition ${
      isActive ? 'bg-white/[.08] text-white ring-1 ring-white/10' : 'text-slate-400 hover:bg-white/[.04] hover:text-white'
    }`

  function refreshPage() {
    window.dispatchEvent(new CustomEvent('pmv:refresh', { detail: { source: 'manual', silent: false } }))
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
        <Logo compact />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
        <div className="space-y-2 pb-5">
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
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/[.025] text-slate-400 transition group-hover:text-gold"><item.icon size={15} strokeWidth={1.8} /></span>
                    <span className="truncate">{item.label}</span>
                    {item.key === 'messages' && emailUnread > 0 && (
                      <span className="ml-auto grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{emailUnread > 99 ? '99+' : emailUnread}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </div>
      </nav>

      <div className="relative shrink-0 border-t border-white/10 pt-3">
        <WhoMenu placement="up" canOpenSettings={canOpenSettings} />
      </div>
    </>
  )

  return (
    <div className={`${hideHqNav ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-navy-950 lg:flex`}>
      <ImpersonationBanner />
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-white/10 bg-navy-900/95 backdrop-blur transition-[width,padding] duration-200 lg:flex print:hidden ${!hideHqNav && sidebarOpen ? 'w-56 border-r p-3' : 'w-0 p-0'}`}>
        <div className="flex h-full w-56 min-h-0 shrink-0 flex-col">{sidebarContent}</div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-white/10 bg-navy-900/95 backdrop-blur lg:hidden print:hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          {hideHqNav ? (
            <NavLink to={p(vendorMobile ? vendorHome : '')} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-gold/40 hover:text-gold">
              <ArrowLeft size={14} />{vendorMobile ? 'Assignments' : 'Back to HQ'}
            </NavLink>
          ) : <Logo compact />}
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="hidden sm:inline-flex"><SlaAlertChip /></span>
            <button onClick={() => setMobileSearchOpen((v) => !v)} className="hidden h-9 w-9 place-items-center rounded-lg text-slate-300 hover:bg-white/5 sm:grid" aria-label="Search"><Search size={17} /></button>
            <button onClick={refreshPage} className="hidden h-9 w-9 place-items-center rounded-lg text-slate-300 hover:bg-white/5 hover:text-gold sm:grid" aria-label="Refresh page"><RotateCw size={15} /></button>
            {!hideHqNav && <MailBell />}
            <NotificationBell />
            <NotificationFeedPanel surface="admin" />
            {hideHqNav && <WhoMenu placement="down" compact canOpenSettings={canOpenSettings} />}
            {!hideHqNav && <button onClick={() => setMobileOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg border border-white/15 bg-white/[.04] text-white transition hover:bg-white/[.08]" aria-label="Open navigation"><Menu size={20} /></button>}
          </div>
        </div>
        <AnimatePresence initial={false}>{mobileSearchOpen && <motion.div initial={{opacity:0,y:-5}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-5}} transition={pmvMotion.ui} className="border-t border-white/10 px-4 py-3"><GlobalSearch /></motion.div>}</AnimatePresence>
      </header>

      <AnimatePresence initial={false}>
      {mobileOpen && (
        <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={pmvMotion.snap}>
          <motion.div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <motion.aside initial={{x:'-100%'}} animate={{x:0}} exit={{x:'-100%'}} transition={pmvMotion.ui} className="absolute inset-y-0 left-0 flex w-[86vw] max-w-[320px] min-h-0 flex-col border-r border-white/10 bg-navy-950 p-4 shadow-2xl" role="dialog" aria-modal="true" aria-label="HQ navigation">
            <div className="flex shrink-0 justify-end pb-2"><button onClick={() => setMobileOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-white/5 hover:text-white" aria-label="Close navigation"><X size={17} /></button></div>
            <div className="flex min-h-0 flex-1 flex-col">{sidebarContent}</div>
          </motion.aside>
        </motion.div>
      )}
      </AnimatePresence>

      <div className={`flex min-w-0 flex-1 flex-col ${hideHqNav ? 'h-full min-h-0 overflow-hidden' : 'min-h-screen'}`}>
        <div className="hidden h-14 items-center justify-between gap-4 border-b border-white/10 bg-navy-900/70 px-6 backdrop-blur lg:flex print:hidden">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {hideHqNav ? (
              <NavLink to={p(vendorMobile ? vendorHome : '')} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[.03] px-3 py-1.5 text-sm font-semibold text-white transition hover:border-gold/40 hover:text-gold">
                <ArrowLeft size={15} />{vendorMobile ? 'Assignments' : 'Back to HQ'}
              </NavLink>
            ) : (
              <button onClick={toggleSidebar} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white" aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'} title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>{sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}</button>
            )}
            {hideHqNav ? <p className="truncate text-sm font-semibold text-white">Communications</p> : <GlobalSearch className="w-full max-w-md" />}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SlaAlertChip />
            <button onClick={refreshPage} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-gold" title="Refresh this page" aria-label="Refresh this HQ page"><RotateCw size={14} /></button>
            {!hideHqNav && <MailBell />}
            <NotificationBell />
            <NotificationFeedPanel surface="admin" />
            {hideHqNav && <WhoMenu placement="down" compact canOpenSettings={canOpenSettings} />}
          </div>
        </div>
        <AnimatePresence mode="sync" initial={false}>
          <motion.main key={location.pathname} variants={pmvPanel} initial="hidden" animate="show" exit="exit" className={mailWorkspace ? `flex min-h-0 flex-1 flex-col overflow-hidden p-0 ${vendorShellPad}` : hideHqNav ? `flex-1 overflow-y-auto px-3 py-3 sm:px-5 lg:px-6 lg:py-4 ${vendorShellPad}` : `flex-1 px-3 py-3 sm:px-5 lg:px-6 lg:py-4 ${vendorShellPad}`}><AdminPageBoundary><Suspense fallback={<PageFallback />}><Outlet /></Suspense></AdminPageBoundary></motion.main>
        </AnimatePresence>
      </div>

      {vendorMobile && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-navy-950/95 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden print:hidden" aria-label="Primary field destinations">
          <div className="grid grid-cols-3 gap-1">
            {vendorTabs.map((item) => (
              <NavLink
                key={item.key}
                to={p(item.to)}
                className={({ isActive }) => {
                  const onAssignments = item.key === 'assignments' && /(^|\/)field-work(\/|$)/.test(location.pathname)
                  const active = isActive || onAssignments
                  return `relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] font-semibold ${active ? 'text-gold' : 'text-slate-500'}`
                }}
              >
                <item.icon size={18} strokeWidth={1.8} />
                <span className="truncate">{vendorMobileTabLabel(item)}</span>
                {item.key === 'messages' && emailUnread > 0 && (
                  <span className="absolute right-3 top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{emailUnread > 99 ? '99+' : emailUnread}</span>
                )}
              </NavLink>
            ))}
            <button type="button" onClick={() => setMobileOpen(true)} className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] font-semibold text-slate-500">
              <Menu size={18} strokeWidth={1.8} />
              More
            </button>
          </div>
        </nav>
      )}
    </div>
  )
}
