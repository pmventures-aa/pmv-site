import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { Logo } from '../ui'

const navItems = [
  { to: '/services', label: 'Services' },
  { to: '/about', label: 'About' },
  { to: '/service-area', label: 'Service Area' },
  { to: '/contact', label: 'Contact' },
]

export function Header() {
  const [open, setOpen] = useState(false)
  const linkCls = ({ isActive }: { isActive: boolean }) => (isActive ? 'text-gold' : 'hover:text-gold')

  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-navy-950/70 backdrop-blur">
      <div className="container-pmv flex h-16 items-center justify-between">
        <Link to="/">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkCls}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-3 sm:flex">
          <a href="https://client.pinnaclemanagementventures.com/login" className="btn-outline">
            Client Login
          </a>
          <Link to="/contact" className="btn-gold">
            Request Service
          </Link>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white sm:hidden"
          aria-label="Open menu"
        >
          ☰
        </button>
      </div>
      {open && (
        <div className="border-t border-white/5 bg-navy-950/95 px-6 py-4 sm:hidden">
          <nav className="flex flex-col gap-3 text-sm text-slate-300">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={linkCls} onClick={() => setOpen(false)}>
                {item.label}
              </NavLink>
            ))}
            <a href="https://client.pinnaclemanagementventures.com/login" className="btn-outline mt-2 justify-center">
              Client Login
            </a>
            <Link to="/contact" className="btn-gold justify-center" onClick={() => setOpen(false)}>
              Request Service
            </Link>
          </nav>
        </div>
      )}
    </header>
  )
}
