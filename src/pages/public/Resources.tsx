import { Link } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { CtaBand, PageIntro } from '../../components/public/ui'
import { Reveal } from '../../components/public/motion'
import { usePageMeta } from '../../lib/usePageMeta'
import { GET_HELP } from '../../data/publicSite'
import { projectGuides } from './ProjectGuides'

export default function Resources() {
  usePageMeta(
    'Resources',
    'Practical guides for POS transitions, property projects, documents, and administrative support from Pinnacle Management Ventures.',
  )

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <main>
        <section className="container-pmv py-16 sm:py-20">
          <PageIntro
            kicker="Resources"
            title="Useful starting points, not a content mill."
            subtitle="These guides cover real questions clients bring us. Each one can open a request when you are ready."
          />
          <div className="mt-12 divide-y divide-white/10 border-y border-white/10">
            {projectGuides.map((guide) => (
              <Reveal key={guide.slug}>
                <Link to={`/projects/${guide.slug}`} className="group grid gap-3 py-6 sm:grid-cols-[160px_1fr_auto] sm:items-start">
                  <p className="text-[10px] font-bold uppercase tracking-[.14em] text-gold">{guide.eyebrow}</p>
                  <div>
                    <h2 className="text-lg font-semibold text-white group-hover:text-gold">{guide.title}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{guide.summary}</p>
                  </div>
                  <span className="text-sm font-semibold text-gold">Read →</span>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
        <CtaBand
          title="Have a version of this on your desk?"
          body="Start with the situation. We will help define the right scope and next move."
          primary={{ to: GET_HELP, label: 'Tell Us What You Need Help With' }}
          secondary={{ to: '/services', label: 'Explore Services' }}
        />
      </main>
      <Footer />
    </div>
  )
}
