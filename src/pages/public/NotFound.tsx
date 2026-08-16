import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { btnOutline, btnPrimary } from '../../components/public/ui'
import { ViewTransitionLink } from '../../components/public/ViewTransitionLink'
import { usePageMeta } from '../../lib/usePageMeta'
import { usePublicVisitor } from '../../lib/publicContext'
import { GET_HELP, pathwayLinks } from '../../data/publicSite'

export default function NotFound() {
  const visitor = usePublicVisitor()
  usePageMeta('Page not found', 'That page could not be found. Head back home or start a request with Pinnacle Management Ventures.')
  const WORLD_KEY: Record<string, string> = { business: 'business', property: 'property', documents: 'personal', funding: 'business' }
  const suggestions = visitor.state.world && visitor.state.world !== 'general'
    ? (pathwayLinks[WORLD_KEY[visitor.state.world]] ?? []).slice(0, 3)
    : [pathwayLinks.business[0], pathwayLinks.property[0], pathwayLinks.personal[0]].slice(0, 3)

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <main className="container-pmv py-20 sm:py-28">
        <div className="mx-auto max-w-2xl">
          <p className="eyebrow">404</p>
          <h1 className="pmv-h1 mt-4">That page could not be found.</h1>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            The link may have changed or the address may be wrong. Your request can still be started from here.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <ViewTransitionLink to={GET_HELP} className={btnPrimary}>Tell Us What You Need Help With</ViewTransitionLink>
            <ViewTransitionLink to="/" className={btnOutline}>Back to Home</ViewTransitionLink>
          </div>
          {suggestions.length > 0 && (
            <div className="mt-12 border-t border-white/10 pt-8">
              <p className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-500">You may be looking for</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {suggestions.map((item) => (
                  <ViewTransitionLink key={item.to} to={item.to} className="group rounded-lg border border-white/10 bg-white/[.02] px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-gold/40 hover:text-gold">
                    {item.label}
                    <span aria-hidden="true" className="ml-2 text-gold transition group-hover:translate-x-1">→</span>
                  </ViewTransitionLink>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}