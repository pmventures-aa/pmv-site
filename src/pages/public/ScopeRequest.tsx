import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { ScopeWizard } from '../../components/public/ScopeWizard'
import { AmbientGlow, KineticHeading } from '../../components/public/motion'
import { Breadcrumbs, BreadcrumbSlot } from '../../components/public/Breadcrumbs'
import { usePageMeta } from '../../lib/usePageMeta'
import { usePublicVisitor } from '../../lib/publicContext'
import { publicIntakeCopy, worldFromPublicParams } from '../../lib/workspace'
import { resolveScopeEntry } from '../../../shared/scopeEntries'

export default function ScopeRequest(){
  const [params]=useSearchParams()
  const visitor=usePublicVisitor()
  const entry=resolveScopeEntry({
    guide:params.get('guide'),
    entry:params.get('entry'),
    service:params.get('service'),
    job:params.get('job'),
    offering:params.get('offering'),
    source:params.get('source'),
  })
  const world=worldFromPublicParams({
    world:params.get('world'),
    service:params.get('service'),
    job:params.get('job')||entry?.job,
    source:params.get('source'),
    audience:params.get('audience'),
    family:params.get('family'),
    guide:params.get('guide'),
    entry:params.get('entry'),
  })
  useEffect(() => { if (world !== 'general') visitor.setWorld(world) }, [world])
  const copy=entry||publicIntakeCopy(world)
  usePageMeta(`${copy.title.replace(/\.$/, '')} | Pinnacle Management Ventures`, copy.body)
  return <div className="min-h-screen bg-navy-950"><Header/><main><section className="relative overflow-hidden border-b border-white/10"><AmbientGlow/><div className="container-pmv relative z-10 py-12 sm:py-16"><BreadcrumbSlot><Breadcrumbs items={[{ label: 'Start a request' }]} /></BreadcrumbSlot><div className="mb-8 max-w-3xl"><p className="eyebrow">{copy.eyebrow}</p><h1 className="pmv-h1 mt-3"><KineticHeading trigger="mount" lines={[{ text: copy.title }]} /></h1><p className="mt-4 text-lg leading-8 text-slate-300">{copy.body}</p></div><ScopeWizard/></div></section></main><Footer/></div>
}
