import { Link } from 'react-router-dom'
import { Logo } from '../ui'
import { MobileConversionBar } from './MobileConversionBar'

export function Footer() {
  return <>
    <footer className="border-t border-white/[.07] bg-navy-950">
      <div className="container-pmv py-9">
        <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-[1.4fr_.7fr_.7fr_1fr]">
          <div>
            <Logo markSize={44} />
            <p className="mt-3 max-w-xs text-sm leading-6 text-slate-400">Business operations, admin support, documents, mobile notary and RON, property care, inspections, and coordinated field work. Nationwide, with direct field coverage in South Florida.</p>
          </div>
          <div>
            <p className="mb-2.5 text-xs font-bold uppercase tracking-[.14em] text-gold">Services</p>
            <ul className="space-y-2 text-sm font-medium text-slate-400">
              <li><Link to="/services/property-field" className="hover:text-gold">Property Care &amp; Field</Link></li>
              <li><Link to="/services/mobile-documents" className="hover:text-gold">Documents &amp; Mobile</Link></li>
              <li><Link to="/services/business-operations" className="hover:text-gold">Business &amp; Operations</Link></li>
              <li><Link to="/care-plans" className="hover:text-gold">Care Plans (Monthly)</Link></li>
              <li><Link to="/services" className="hover:text-gold">All Services</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-2.5 text-xs font-bold uppercase tracking-[.14em] text-gold">Company</p>
            <ul className="space-y-2 text-sm font-medium text-slate-400">
              <li><Link to="/about" className="hover:text-gold">About Pinnacle</Link></li>
              <li><Link to="/professionals" className="hover:text-gold">Professional Network</Link></li>
              <li><Link to="/service-area" className="hover:text-gold">Service Area</Link></li>
              <li><Link to="/contact" className="hover:text-gold">Contact</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-2.5 text-xs font-bold uppercase tracking-[.14em] text-gold">Contact</p>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><a href="mailto:support@pinnaclemanagementventures.com" className="break-all font-medium hover:text-gold">support@pinnaclemanagementventures.com</a></li>
              <li><a href="tel:+15613887879" className="font-medium hover:text-gold">(561) 388-7879</a></li>
              <li><Link to="/contact" className="font-bold text-gold hover:text-gold-300">Start a Conversation →</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-white/[.07] pt-5">
          <div className="flex flex-col gap-3 text-xs text-slate-500 lg:flex-row lg:items-center lg:justify-between">
            <span>&copy; {new Date().getFullYear()} Pinnacle Management Ventures. All rights reserved.</span>
            <nav className="flex flex-wrap gap-x-5 gap-y-2 font-semibold"><Link to="/terms" className="hover:text-gold">Terms</Link><Link to="/provider-agreement" className="hover:text-gold">Provider Agreement</Link><Link to="/privacy" className="hover:text-gold">Privacy</Link><Link to="/electronic-communications" className="hover:text-gold">Electronic Records</Link><Link to="/accessibility" className="hover:text-gold">Accessibility</Link></nav>
          </div>
          <p className="mt-4 max-w-5xl text-xs leading-6 text-slate-500"><span className="font-semibold text-slate-300">A quick note on how we work with you.</span> Pinnacle Management Ventures is a professional services and coordination company, and we are happy to be your single, accountable point of contact. We help get real work done, and when a job calls for specialized expertise we bring in the right qualified professionals for you. We coordinate the work, and we never claim to be something we are not: we do not automatically act as a law firm, lender, tax or accounting firm, real estate broker, contractor, engineer, or licensed property manager just because your project touches one of those areas. When something calls for a licensed or regulated professional, we tell you exactly who that qualified provider is and the scope they will handle before any work begins, so you always know who is responsible for what. And any notarial acts are performed only by a duly commissioned notary, acting strictly within the notary's authorized scope. The result is simple: clear accountability, the right people for the job, and the confidence to move forward.</p>
        </div>
      </div>
    </footer>
    <MobileConversionBar />
  </>
}
