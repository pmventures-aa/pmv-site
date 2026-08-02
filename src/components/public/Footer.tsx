import { Link } from 'react-router-dom'
import { Logo } from '../ui'
import { services } from '../../data/services'

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-navy-950/60">
      <div className="container-pmv py-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-slate-400">
              Professional support for businesses and property owners nationwide. Consulting, funding, property
              management, mobile notary, inspections, courier, and administrative services — wherever business
              takes you.
            </p>
            <p className="mt-4 text-xs text-slate-500">Nationwide · South Florida (on-site)</p>
          </div>

          <div>
            <p className="eyebrow mb-3">Navigation</p>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><Link to="/services" className="hover:text-gold">Services</Link></li>
              <li><Link to="/about" className="hover:text-gold">About</Link></li>
              <li><Link to="/service-area" className="hover:text-gold">Service Area</Link></li>
              <li><Link to="/contact" className="hover:text-gold">Contact</Link></li>
              <li><Link to="/terms" className="hover:text-gold">Terms of Service</Link></li>
            </ul>
          </div>

          <div>
            <p className="eyebrow mb-3">Services</p>
            <ul className="space-y-2 text-sm text-slate-400">
              {services.map((s) => (
                <li key={s.slug}>
                  <Link to={`/services/${s.slug}`} className="hover:text-gold">
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="eyebrow mb-3">Contact</p>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>
                <a href="mailto:support@pinnaclemanagementventures.com" className="hover:text-gold">
                  support@pinnaclemanagementventures.com
                </a>
              </li>
              <li>
                <a href="tel:+15613887879" className="hover:text-gold">
                  (561) 388-7879
                </a>
              </li>
              <li>
                <a href="https://client.pinnaclemanagementventures.com/login" className="hover:text-gold">
                  Client Login
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-white/5 pt-6">
          <div className="flex flex-col items-start justify-between gap-3 text-xs text-slate-500 md:flex-row md:items-center">
            <span>&copy; {new Date().getFullYear()} Pinnacle Management Ventures. All rights reserved.</span>
          </div>
          <p className="mt-4 max-w-4xl text-xs leading-relaxed text-slate-500">
            Notarial acts are performed only by a commissioned Florida notary. Pinnacle Management Ventures is not
            a law firm and does not provide legal advice, legal document preparation, licensed real-estate
            brokerage, or contracting services unless those credentials are specifically confirmed.
          </p>
        </div>
      </div>
    </footer>
  )
}
