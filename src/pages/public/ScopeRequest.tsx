import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { ScopeWizard } from '../../components/public/ScopeWizard'
import { AmbientGlow } from '../../components/public/motion'
import { usePageMeta } from '../../lib/usePageMeta'

export default function ScopeRequest(){
  usePageMeta('Scope a Request | Pinnacle Management Ventures','Tell Pinnacle what needs to be handled. No account is required, and a person will reply within two business hours.')
  return <div className="min-h-screen bg-navy-950"><Header/><main><section className="relative overflow-hidden border-b border-white/10"><AmbientGlow/><div className="container-pmv relative z-10 py-12 sm:py-16"><div className="mb-8 max-w-3xl"><p className="eyebrow">Start here</p><h1 className="mt-3 font-display text-4xl font-bold tracking-[-.035em] text-white sm:text-5xl">Tell us what needs to be handled.</h1><p className="mt-4 text-lg leading-8 text-slate-300">One defined task or several connected pieces - give us the practical facts. We will identify the scope, the right people, and the next step.</p></div><ScopeWizard/></div></section></main><Footer/></div>
}
