import { Link } from 'react-router-dom'
import { Logo } from '../ui'
import { MobileConversionBar } from './MobileConversionBar'

export function Footer() {
  return <>
    <footer className="border-t border-white/[.07] bg-navy-950">
      <div className="container-pmv py-12">
        <div className="grid gap-10 lg:grid-cols-[1.25fr_.75fr_.8fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">Business operations, administrative support, documents, mobile notary and RON, property cleaning, inspections, eviction and REO support, and coordinated field services.</p>
            <p className="mt-4 text-xs leading-5 text-slate-500">Nationwide professional support with direct field coverage in South Florida and qualified provider coordination in other service areas.</p>
          </div>
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[.14em] text-gold">Services</p>
            <ul className="space-y-2.5 text-sm font-medium text-slate-400">
              <li><Link to="/services/property-field" className="hover:text-gold">Property Care &amp; Field</Link></li>
              <li><Link to="/services/mobile-documents" className="hover:text-gold">Documents &amp; Mobile</Link></li>
              <li><Link to="/services/business-operations" className="hover:text-gold">Business &amp; Operations</Link></li>
              <li><Link to="/services" className="hover:text-gold">All Services</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[.14em] text-gold">Company</p>
            <ul className="space-y-2.5 text-sm font-medium text-slate-400">
              <li><Link to="/about" className="hover:text-gold">About Pinnacle</Link></li>
              <li><Link to="/professionals" className="hover:text-gold">Professional Network</Link></li>
              <li><Link to="/service-area" className="hover:text-gold">Service Area</Link></li>
              <li><Link to="/contact" className="hover:text-gold">Contact</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[.14em] text-gold">Contact</p>
            <ul className="space-y-2.5 text-sm text-slate-400">
              <li><a href="mailto:support@pinnaclemanagementventures.com" className="break-all font-medium hover:text-gold">support@pinnaclemanagementventures.com</a></li>
              <li><a href="tel:+15613887879" className="font-medium hover:text-gold">(561) 388-7879</a></li>
              <li><Link to="/contact" className="font-bold text-gold hover:text-gold-300">Start a Conversation →</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-white/[.07] pt-6">
          <div className="flex flex-col gap-4 text-xs text-slate-500 lg:flex-row lg:items-center lg:justify-between">
            <span>&copy; {new Date().getFullYear()} Pinnacle Management Ventures. All rights reserved.</span>
            <nav className="flex flex-wrap gap-x-5 gap-y-2 font-semibold"><Link to="/terms" className="hover:text-gold">Terms</Link><Link to="/privacy" className="hover:text-gold">Privacy</Link><Link to="/electronic-communications" className="hover:text-gold">Electronic Records</Link><Link to="/accessibility" className="hover:text-gold">Accessibility</Link></nav>
          </div>
          <p className="mt-4 max-w-5xl text-xs leading-6 text-slate-500">Pinnacle Management Ventures is a professional services and coordination company. We are not automatically acting as a law firm, lender, tax or accounting firm, real estate broker, contractor, engineer, or licensed property manager because an engagement touches one of those areas. Regulated or licensed work is performed only when the applicable qualified provider and scope are specifically identified. Notarial acts are performed only by a duly commissioned notary acting within the notary’s authorized scope.</p>
        </div>
      </div>
    </footer>
    <MobileConversionBar />
  </>
}
