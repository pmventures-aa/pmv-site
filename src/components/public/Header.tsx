import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { Logo } from '../ui'
import { btnOutline, btnPrimary } from './ui'

const navItems = [
  { to: '/services', label: 'Services' },
  { to: '/about', label: 'About' },
  { to: '/service-area', label: 'Service Area' },
  { to: '/contact', label: 'Contact' },
]

const CLIENT_LOGIN = 'https://client.pinnaclemanagementventures.com/login'
const CLIENT_SIGNUP = 'https://client.pinnaclemanagementventures.com/signup'

export function Header() {
  const [open, setOpen] = useState(false)
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `${isActive ? 'text-gold' : 'hover:text-gold'} transition-colors duration-200`

  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-navy-950/70 backdrop-blur">
      <div className="container-pmv flex h-16 items-center justify-between">
        <Link to="/" className="transition-transform duration-200 hover:scale-[1.015]">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkCls}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <a href={CLIENT_LOGIN} className={btnOutline}>
            Client Login
          </a>
          <a href={CLIENT_SIGNUP} className={btnPrimary}>
            Get Started
          </a>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white transition hover:border-gold/60 hover:text-gold md:hidden"
          aria-label="Open menu"
          aria-expanded={open}
        >
          ☰
        </button>
      </div>
      {open && (
        <div className="border-t border-white/5 bg-navy-950/95 px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-3 text-sm text-slate-300">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={linkCls} onClick={() => setOpen(false)}>
                {item.label}
              </NavLink>
            ))}
            <a href={CLIENT_LOGIN} className={`${btnOutline} mt-2`}>
              Client Login
            </a>
            <a href={CLIENT_SIGNUP} className={btnPrimary}>
              Get Started
            </a>
          </nav>
        </div>
      )}
    </header>
  )
}
