import { Link } from 'react-router-dom'
import { Logo } from '../ui'

export function Footer() {
  return (
    <footer className="border-t border-white/[.07] bg-navy-950">
      <div className="container-pmv py-12">
        <div className="grid gap-10 lg:grid-cols-[1.35fr_.8fr_.9fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">Professional support for business operations, property work, projects, transitions, and defined mobile services.</p>
            <p className="mt-4 text-xs text-slate-500">South Florida based. Remote and project support available nationwide where appropriate.</p>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[.14em] text-gold">Services</p>
            <ul className="space-y-2.5 text-sm text-slate-400">
              <li><Link to="/services/business-operations" className="hover:text-gold">Business & Operations</Link></li>
              <li><Link to="/services/property-field" className="hover:text-gold">Property & Field</Link></li>
              <li><Link to="/services/mobile-documents" className="hover:text-gold">Documents & Mobile</Link></li>
              <li><Link to="/services" className="hover:text-gold">All Services</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[.14em] text-gold">Company</p>
            <ul className="space-y-2.5 text-sm text-slate-400">
              <li><Link to="/about" className="hover:text-gold">About</Link></li>
              <li><Link to="/professionals" className="hover:text-gold">Professional Network</Link></li>
              <li><Link to="/service-area" className="hover:text-gold">Service Area</Link></li>
              <li><Link to="/contact" className="hover:text-gold">Contact</Link></li>
              <li><Link to="/terms" className="hover:text-gold">Terms of Service</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[.14em] text-gold">Contact</p>
            <ul className="space-y-2.5 text-sm text-slate-400">
              <li><a href="mailto:support@pinnaclemanagementventures.com" className="break-all hover:text-gold">support@pinnaclemanagementventures.com</a></li>
              <li><a href="tel:+15613887879" className="hover:text-gold">(561) 388-7879</a></li>
              <li><Link to="/contact" className="font-medium text-gold hover:underline">Start a conversation →</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-white/[.07] pt-6">
          <div className="flex flex-col items-start justify-between gap-3 text-xs text-slate-500 md:flex-row md:items-center"><span>&copy; {new Date().getFullYear()} Pinnacle Management Ventures. All rights reserved.</span></div>
          <p className="mt-4 max-w-4xl text-xs leading-relaxed text-slate-500">Notarial acts are performed only by a commissioned Florida notary. Pinnacle Management Ventures is not a law firm and does not provide legal advice, legal document preparation, licensed real estate brokerage, or contracting services unless the applicable credentials are specifically confirmed.</p>
        </div>
      </div>
    </footer>
  )
}
