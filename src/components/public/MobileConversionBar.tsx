import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Icon } from '../kit/Icon'
import { worldFromPublicParams } from '../../lib/workspace'

function intakeFromPath(pathname: string, family: string | null) {
  if (pathname.includes('professionals') || pathname.includes('vendor-signup') || pathname.includes('provider-agreement')) {
    return { to: '/admin/vendor-signup', label: 'Apply' }
  }
  const world = worldFromPublicParams({ source: pathname, guide: pathname, family })
  if (world === 'property') return { to: '/scope-request?world=property&source=mobile-bar', label: 'Property' }
  if (world === 'documents') return { to: '/scope-request?world=documents&source=mobile-bar', label: 'Documents' }
  if (world === 'business') return { to: '/scope-request?world=business&source=mobile-bar', label: 'Ops' }
  if (world === 'funding') return { to: '/scope-request?world=funding&source=mobile-bar', label: 'Funding' }
  return { to: '/services', label: 'Services' }
}

export function MobileConversionBar(){
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const intake = intakeFromPath(pathname, params.get('family'))
  return <><div className="h-16 md:hidden" aria-hidden="true"/><nav className="fixed inset-x-0 bottom-0 z-50 grid h-16 grid-cols-3 border-t border-white/10 bg-navy-950/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_35px_rgba(0,0,0,.35)] backdrop-blur-xl md:hidden" aria-label="Quick contact"><a href="tel:+15613887879" className="flex flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-white"><Icon name="support" size={17}/>Call</a><a href="sms:+15613887879" className="flex flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-white"><Icon name="messages" size={17}/>Text</a><Link to={intake.to} className="m-1.5 flex flex-col items-center justify-center gap-1 rounded-lg bg-gold text-[10px] font-extrabold uppercase tracking-wide text-navy-950"><Icon name="arrowRight" size={17}/>{intake.label}</Link></nav></>
}
