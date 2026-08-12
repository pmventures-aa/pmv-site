import { useSearchParams } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { ScopeWizard } from '../../components/public/ScopeWizard'
import { AmbientGlow } from '../../components/public/motion'
import { usePageMeta } from '../../lib/usePageMeta'
import { publicIntakeCopy, worldFromPublicParams } from '../../lib/workspace'

export default function ScopeRequest(){
  const [params]=useSearchParams()
  const world=worldFromPublicParams({
    world:params.get('world'),
    service:params.get('service'),
    job:params.get('job'),
    source:params.get('source'),
    audience:params.get('audience'),
    family:params.get('family'),
    guide:params.get('guide'),
  })
  const copy=publicIntakeCopy(world)
  usePageMeta(`${copy.title.replace(/\.$/, '')} | Pinnacle Management Ventures`, copy.body)
  return <div className="min-h-screen bg-navy-950"><Header/><main><section className="relative overflow-hidden border-b border-white/10"><AmbientGlow/><div className="container-pmv relative z-10 py-12 sm:py-16"><div className="mb-8 max-w-3xl"><p className="eyebrow">{copy.eyebrow}</p><h1 className="mt-3 font-display text-4xl font-bold tracking-[-.035em] text-white sm:text-5xl">{copy.title}</h1><p className="mt-4 text-lg leading-8 text-slate-300">{copy.body}</p></div><ScopeWizard/></div></section></main><Footer/></div>
}
