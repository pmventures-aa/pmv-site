import { Link } from 'react-router-dom'
import { Logo } from '../ui'
import { MobileConversionBar } from './MobileConversionBar'
import { CLIENT_LOGIN, GET_HELP } from '../../data/publicSite'

export function Footer() {
  return (
    <>
      <footer className="border-t border-white/[.07] bg-navy-950">
        <div className="container-pmv py-10">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-6">
            <div className="sm:col-span-2 lg:col-span-2">
              <Logo markSize={52} />
              <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">
                Professional support. One call away. Business, property, and administrative matters through one trusted point of contact.
              </p>
              <div className="mt-5 flex flex-col gap-1.5 text-sm">
                <a href="mailto:support@pinnaclemanagementventures.com" className="break-all font-medium text-slate-300 hover:text-gold">support@pinnaclemanagementventures.com</a>
                <a href="tel:+15613887879" className="font-medium text-slate-300 hover:text-gold">(561) 388-7879</a>
                <Link to={GET_HELP} className="mt-1 font-bold text-gold hover:text-gold-300">Get Help →</Link>
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[.14em] text-gold">Pinnacle</p>
              <ul className="space-y-2.5 text-sm font-medium text-slate-400">
                <li><Link to="/about" className="hover:text-gold">About</Link></li>
                <li><Link to="/how-it-works" className="hover:text-gold">How It Works</Link></li>
                <li><Link to="/contact" className="hover:text-gold">Contact</Link></li>
                <li><Link to="/professionals" className="hover:text-gold">Professional Network</Link></li>
              </ul>
            </div>

            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[.14em] text-gold">Business</p>
              <ul className="space-y-2.5 text-sm font-medium text-slate-400">
                <li><Link to="/services/consulting" className="hover:text-gold">Consulting</Link></li>
                <li><Link to="/services/administrative-support" className="hover:text-gold">Administrative Support</Link></li>
                <li><Link to="/services/merchant-services" className="hover:text-gold">Payments &amp; Systems</Link></li>
                <li><Link to="/services/funding" className="hover:text-gold">Funding Support</Link></li>
              </ul>
            </div>

            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[.14em] text-gold">Property</p>
              <ul className="space-y-2.5 text-sm font-medium text-slate-400">
                <li><Link to="/services/property-field" className="hover:text-gold">Property Support</Link></li>
                <li><Link to="/services/property-inspections" className="hover:text-gold">Inspections</Link></li>
                <li><Link to="/services/property-field" className="hover:text-gold">Vendor Coordination</Link></li>
              </ul>
            </div>

            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[.14em] text-gold">Administrative</p>
              <ul className="space-y-2.5 text-sm font-medium text-slate-400">
                <li><Link to="/services/mobile-notary" className="hover:text-gold">Mobile Notary</Link></li>
                <li><Link to="/services/document-courier" className="hover:text-gold">Document Courier</Link></li>
                <li><Link to="/services/administrative-support" className="hover:text-gold">Administrative Assistance</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-8 grid gap-6 border-t border-white/[.07] pt-5 lg:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[.14em] text-gold">Clients</p>
              <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-slate-400">
                <a href={CLIENT_LOGIN} className="hover:text-gold">Client Login</a>
                <Link to={GET_HELP} className="hover:text-gold">Get Help</Link>
                <Link to="/care-plans" className="hover:text-gold">Monthly Plans</Link>
              </nav>
            </div>
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[.14em] text-gold">Legal</p>
              <nav className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-500">
                <Link to="/privacy" className="hover:text-gold">Privacy</Link>
                <Link to="/terms" className="hover:text-gold">Terms</Link>
                <Link to="/accessibility" className="hover:text-gold">Accessibility</Link>
                <Link to="/electronic-communications" className="hover:text-gold">Electronic Records</Link>
                <Link to="/provider-agreement" className="hover:text-gold">Provider Agreement</Link>
              </nav>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 text-xs text-slate-500 lg:flex-row lg:items-center lg:justify-between">
            <span>&copy; {new Date().getFullYear()} Pinnacle Management Ventures · Nationwide with direct South Florida field coverage</span>
          </div>
          <div className="mt-4 max-w-4xl rounded-lg border border-white/[.06] bg-white/[.02] p-4 text-xs leading-6 text-slate-400">
            <p className="font-semibold text-slate-200">A quick note on how we work with you.</p>
            <p className="mt-1.5">Pinnacle is a professional services and coordination company: your one accountable point of contact for getting real work done. We handle plenty ourselves. When a job needs a licensed hand (an attorney, real estate broker, community-association manager, contractor, engineer, tax or accounting firm) we do not pretend to be that person. We name the qualified provider up front, tell you what scope they own and what stays with us, and keep the whole engagement connected. Notarial acts are performed only by a duly commissioned notary acting strictly within the notary&apos;s authorized scope.</p>
          </div>
        </div>
      </footer>
      <MobileConversionBar />
    </>
  )
}
