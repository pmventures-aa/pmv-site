import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { Logo } from '../ui'
import { Icon } from '../kit/Icon'
import { btnOutline, btnPrimary } from './ui'
import { pmvMotion } from '../../lib/motionTheme'
import { CLIENT_LOGIN, GET_HELP, pathways } from '../../data/publicSite'

const navItems = [
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/about', label: 'About' },
  { to: '/resources', label: 'Resources' },
  { to: '/contact', label: 'Contact' },
]

export function Header() {
  const [open, setOpen] = useState(false)
  const [servicesOpen, setServicesOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { scrollY } = useScroll()
  useMotionValueEvent(scrollY, 'change', (latest) => setScrolled(latest > 28))
  const linkCls = ({ isActive }: { isActive: boolean }) => `${isActive ? 'text-gold' : 'hover:text-gold'} font-semibold transition-colors duration-200`

  return (
    <motion.header
      className="sticky top-0 z-30 border-b border-white/[.07] bg-navy-950/90 backdrop-blur-xl"
      animate={{ boxShadow: scrolled ? '0 12px 34px rgba(0,0,0,.2)' : '0 0 0 rgba(0,0,0,0)' }}
      transition={pmvMotion.snap}
    >
      <div className="container-pmv flex h-[68px] items-center justify-between gap-4">
        <Link to="/" aria-label="Pinnacle Management Ventures home" className="block shrink-0 transition-opacity hover:opacity-90"><Logo tone="light" markSize={48} /></Link>
        <nav className="hidden items-center gap-6 text-sm text-slate-300 lg:flex" aria-label="Primary navigation">
          <div className="group relative">
            <Link to="/services" className="inline-flex items-center gap-1.5 font-semibold transition-colors hover:text-gold">Services <Icon name="chevronDown" size={13} /></Link>
            <div className="invisible absolute left-1/2 top-full w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 pt-5 opacity-0 transition duration-150 group-hover:visible group-hover:opacity-100">
              <div className="rounded-xl border border-white/10 bg-navy-950 p-2 shadow-[0_24px_70px_rgba(0,0,0,.38)]">
                <div className="grid grid-cols-3">
                  {pathways.map((item) => (
                    <Link key={item.to} to={item.to} className="group/item rounded-lg border-r border-white/[.07] p-5 last:border-r-0 hover:bg-white/[.03]">
                      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-gold">{item.label}</p>
                      <p className="mt-2 text-sm font-bold text-white group-hover/item:text-gold">{item.title}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-400">{item.body}</p>
                    </Link>
                  ))}
                </div>
                <Link to={GET_HELP} className="flex items-center justify-between border-t border-white/[.07] px-5 py-3 text-xs font-bold uppercase tracking-[.12em] text-slate-400 hover:text-gold">
                  <span>Doesn&apos;t fit neatly? Tell us what&apos;s going on.</span>
                  <span>→</span>
                </Link>
              </div>
            </div>
          </div>
          {navItems.map((item) => <NavLink key={item.to} to={item.to} className={linkCls}>{item.label}</NavLink>)}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <a href={CLIENT_LOGIN} className={btnOutline}>Client Login</a>
          <Link to={GET_HELP} className={btnPrimary}>Get Help</Link>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 text-white transition hover:border-gold/50 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 lg:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
          <Icon name={open ? 'close' : 'menu'} size={18} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={pmvMotion.ui} className="border-t border-white/[.07] bg-navy-950 px-5 py-5 lg:hidden">
            <nav className="flex flex-col text-sm text-slate-300" aria-label="Mobile navigation">
              <button type="button" onClick={() => setServicesOpen((v) => !v)} className="flex items-center justify-between border-b border-white/[.07] py-3 text-left font-bold text-white">
                <span>Services</span>
                <Icon name="chevronDown" size={14} className={servicesOpen ? 'rotate-180 transition' : 'transition'} />
              </button>
              <AnimatePresence initial={false}>
                {servicesOpen && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={pmvMotion.ui} className="border-b border-white/[.07] py-2">
                    {pathways.map((item) => (
                      <Link key={item.to} to={item.to} onClick={() => setOpen(false)} className="block rounded-lg py-3">
                        <span className="text-[10px] font-bold uppercase tracking-[.14em] text-gold">{item.label}</span>
                        <span className="mt-1 block font-bold text-white">{item.title}</span>
                      </Link>
                    ))}
                    <Link to={GET_HELP} onClick={() => setOpen(false)} className="block py-3 text-sm font-bold text-gold">Tell us what&apos;s going on →</Link>
                  </motion.div>
                )}
              </AnimatePresence>
              {navItems.map((item) => (
                <NavLink key={item.to} to={item.to} className="border-b border-white/[.07] py-3 font-semibold hover:text-gold" onClick={() => setOpen(false)}>{item.label}</NavLink>
              ))}
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <a href={CLIENT_LOGIN} className={btnOutline}>Client Login</a>
                <Link to={GET_HELP} className={btnPrimary}>Get Help</Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
