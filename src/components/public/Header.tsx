import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { Logo } from '../ui'
import { Icon } from '../kit/Icon'
import { btnOutline, btnPrimary } from './ui'
import { pmvMotion } from '../../lib/motionTheme'
import { ViewTransitionLink } from './ViewTransitionLink'
import { CLIENT_LOGIN, GET_HELP, pathwayLinks, pathways, whoWeHelp } from '../../data/publicSite'

const navItems = [
  { to: '/cleaning', label: 'Cleaning' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/about', label: 'About' },
  { to: '/resources', label: 'Resources' },
  { to: '/contact', label: 'Contact' },
]

type MobileView =
  | { name: 'root' }
  | { name: 'services' }
  | { name: 'category'; key: string }
  | { name: 'who' }

export function Header() {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<MobileView>({ name: 'root' })
  const [scrolled, setScrolled] = useState(false)
  const { scrollY } = useScroll()
  useMotionValueEvent(scrollY, 'change', (latest) => setScrolled(latest > 28))
  const linkCls = ({ isActive }: { isActive: boolean }) => `${isActive ? 'text-gold' : 'hover:text-gold'} font-semibold transition-colors duration-200`

  function closeMenu() {
    setOpen(false)
    setView({ name: 'root' })
  }

  function openView(next: MobileView) {
    setView(next)
  }

  return (
    <motion.header
      className="sticky top-0 z-30 border-b border-white/[.07] bg-navy-950/90 backdrop-blur-xl"
      animate={{ boxShadow: scrolled ? '0 12px 34px rgba(0,0,0,.2)' : '0 0 0 rgba(0,0,0,0)' }}
      transition={pmvMotion.snap}
    >
      <div className="container-pmv flex h-[68px] items-center justify-between gap-4">
        <ViewTransitionLink to="/" aria-label="Pinnacle Management Ventures home" className="block shrink-0 transition-opacity hover:opacity-90"><Logo tone="light" markSize={48} /></ViewTransitionLink>
        <nav className="hidden items-center gap-6 text-sm text-slate-300 lg:flex" aria-label="Primary navigation">
          <div className="group relative">
            <Link to="/services" className="inline-flex items-center gap-1.5 font-semibold transition-colors hover:text-gold">Services <Icon name="chevronDown" size={13} /></Link>
            <div className="invisible absolute left-1/2 top-full w-[min(660px,calc(100vw-2rem))] -translate-x-1/2 pt-5 opacity-0 transition duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <div className="rounded-xl border border-white/10 bg-navy-950 p-2 shadow-[0_24px_70px_rgba(0,0,0,.38)]">
                <div className="grid grid-cols-3">
                  {pathways.map((item) => (
                    <div key={item.to} className="border-r border-white/[.07] p-4 last:border-r-0">
                      <ViewTransitionLink to={item.to} className="group/item block rounded-lg hover:bg-white/[.03]">
                        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-gold">{item.label}</p>
                        <p className="mt-1.5 text-sm font-bold text-white group-hover/item:text-gold">{item.title}</p>
                      </ViewTransitionLink>
                      <ul className="mt-3 space-y-1.5 border-t border-white/[.06] pt-3">
                        {(pathwayLinks[item.key] ?? []).map((link) => (
                          <li key={link.to}>
                            <ViewTransitionLink to={link.to} className="block py-0.5 text-xs font-medium text-slate-300 transition-colors hover:text-gold">{link.label}</ViewTransitionLink>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <ViewTransitionLink to={GET_HELP} className="flex items-center justify-between border-t border-white/[.07] px-5 py-3 text-xs font-bold uppercase tracking-[.12em] text-slate-400 hover:text-gold">
                  <span>Doesn&apos;t fit neatly? Tell us what&apos;s going on.</span>
                  <span>→</span>
                </ViewTransitionLink>
              </div>
            </div>
          </div>

          <div className="group relative">
            <Link to="/services" className="inline-flex items-center gap-1.5 font-semibold transition-colors hover:text-gold" aria-haspopup="true">Who We Help <Icon name="chevronDown" size={13} /></Link>
            <div className="invisible absolute left-1/2 top-full w-[min(680px,calc(100vw-2rem))] -translate-x-1/2 pt-5 opacity-0 transition duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <div className="rounded-xl border border-white/10 bg-navy-950 p-2 shadow-[0_24px_70px_rgba(0,0,0,.38)]">
                <div className="grid grid-cols-2">
                  {whoWeHelp.map((item) => (
                    <ViewTransitionLink key={item.audience} to={item.to} className="group/item rounded-lg p-4 hover:bg-white/[.03]">
                      <p className="text-sm font-bold text-white group-hover/item:text-gold">{item.audience}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{item.body}</p>
                    </ViewTransitionLink>
                  ))}
                </div>
                <ViewTransitionLink to="/professionals" className="flex items-center justify-between border-t border-white/[.07] px-4 py-3 text-xs font-bold uppercase tracking-[.12em] text-slate-400 hover:text-gold">
                  <span>Professionals &amp; attorneys</span>
                  <span>→</span>
                </ViewTransitionLink>
              </div>
            </div>
          </div>

          {navItems.map((item) => <NavLink key={item.to} to={item.to} className={linkCls}>{item.label}</NavLink>)}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <a href={CLIENT_LOGIN} className={btnOutline}>Client Login</a>
          <ViewTransitionLink to={GET_HELP} className={btnPrimary}>Get Help</ViewTransitionLink>
        </div>
        <button onClick={() => { setOpen((o) => !o); setView({ name: 'root' }) }} className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 text-white transition hover:border-gold/50 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 lg:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
          <Icon name={open ? 'close' : 'menu'} size={18} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={pmvMotion.ui} className="max-h-[calc(100dvh-68px)] overflow-y-auto border-t border-white/[.07] bg-navy-950 px-5 py-5 lg:hidden">
            <nav className="flex flex-col text-sm text-slate-300" aria-label="Mobile navigation">
              {view.name === 'root' && (
                <>
                  <button type="button" onClick={() => openView({ name: 'services' })} className="flex items-center justify-between border-b border-white/[.07] py-3 text-left font-bold text-white">
                    <span>Services</span>
                    <Icon name="chevronRight" size={14} className="text-gold" />
                  </button>
                  <button type="button" onClick={() => openView({ name: 'who' })} className="flex items-center justify-between border-b border-white/[.07] py-3 text-left font-bold text-white">
                    <span>Who We Help</span>
                    <Icon name="chevronRight" size={14} className="text-gold" />
                  </button>
                  {navItems.map((item) => (
                    <NavLink key={item.to} to={item.to} className="border-b border-white/[.07] py-3 font-semibold hover:text-gold" onClick={closeMenu}>{item.label}</NavLink>
                  ))}
                </>
              )}

              {view.name === 'services' && (
                <div className="pb-2">
                  <button type="button" onClick={() => openView({ name: 'root' })} className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-gold">
                    <Icon name="chevronLeft" size={14} /> Back
                  </button>
                  <p className="py-2 font-display text-lg font-bold text-white">Choose a path</p>
                  {pathways.map((item) => (
                    <button key={item.key} type="button" onClick={() => openView({ name: 'category', key: item.key })} className="flex w-full items-start justify-between gap-3 border-b border-white/[.07] py-3.5 text-left">
                      <span>
                        <span className="block text-[10px] font-bold uppercase tracking-[.14em] text-gold">{item.label}</span>
                        <span className="mt-0.5 block font-bold text-white">{item.title}</span>
                      </span>
                      <Icon name="chevronRight" size={14} className="mt-1 shrink-0 text-gold" />
                    </button>
                  ))}
                  <ViewTransitionLink to={GET_HELP} onClick={closeMenu} className="block py-3 text-sm font-bold text-gold">Doesn&apos;t fit neatly? Tell us what&apos;s going on →</ViewTransitionLink>
                </div>
              )}

              {view.name === 'category' && (() => {
                const pathway = pathways.find((item) => item.key === view.key)
                if (!pathway) return null
                return (
                  <div className="pb-2">
                    <button type="button" onClick={() => openView({ name: 'services' })} className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-gold">
                      <Icon name="chevronLeft" size={14} /> Back to paths
                    </button>
                    <p className="py-2 font-display text-lg font-bold text-white">{pathway.label} services</p>
                    <ViewTransitionLink to={pathway.to} onClick={closeMenu} className="block border-b border-white/[.07] py-3 font-bold text-white hover:text-gold">Explore {pathway.label} services <span className="text-gold">→</span></ViewTransitionLink>
                    {(pathwayLinks[pathway.key] ?? []).map((link) => (
                      <ViewTransitionLink key={link.to} to={link.to} onClick={closeMenu} className="block border-b border-white/[.07] py-3 font-medium text-slate-300 hover:text-gold">{link.label}</ViewTransitionLink>
                    ))}
                  </div>
                )
              })()}

              {view.name === 'who' && (
                <div className="pb-2">
                  <button type="button" onClick={() => openView({ name: 'root' })} className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-gold">
                    <Icon name="chevronLeft" size={14} /> Back
                  </button>
                  <p className="py-2 font-display text-lg font-bold text-white">Who this is for</p>
                  {whoWeHelp.map((item) => (
                    <ViewTransitionLink key={item.audience} to={item.to} onClick={closeMenu} className="block border-b border-white/[.07] py-3.5">
                      <span className="block font-bold text-white">{item.audience}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-400">{item.body}</span>
                    </ViewTransitionLink>
                  ))}
                  <ViewTransitionLink to="/professionals" onClick={closeMenu} className="block py-3 text-sm font-bold text-gold">Professionals &amp; attorneys →</ViewTransitionLink>
                </div>
              )}

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <a href={CLIENT_LOGIN} className={btnOutline}>Client Login</a>
                <ViewTransitionLink to={GET_HELP} onClick={closeMenu} className={btnPrimary}>Get Help</ViewTransitionLink>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}