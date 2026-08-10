import { Link } from 'react-router-dom'
import { Header } from '../components/public/Header'
import { Footer } from '../components/public/Footer'
import { btnOutline, btnPrimary, CtaBand, SplitFeatures } from '../components/public/ui'
import { Reveal } from '../components/public/motion'
import { services } from '../data/services'
import { usePageMeta } from '../lib/usePageMeta'
import { Icon, type IconName } from '../components/kit/Icon'

const CLIENT_SIGNUP = 'https://secure.pinnaclemanagementventures.com/signup?source=home'

const startingPoints = services.slice(0, 4)
const situations: { icon: IconName; title: string; body: string; to: string }[] = [
  { icon: 'briefcase', title: 'The business has too many moving pieces', body: 'Operations, vendors, systems, follow-up, and projects need clearer ownership and coordination.', to: '/services/consulting' },
  { icon: 'building', title: 'A property or field project needs follow-through', body: 'Someone needs to coordinate access, vendors, inspections, documentation, or work happening on the ground.', to: '/services/property-management' },
  { icon: 'services', title: 'A system or vendor transition needs a steady hand', body: 'POS, payments, technology, data, training, and implementation can be organized around one transition plan.', to: '/services/merchant-services' },
  { icon: 'file', title: 'Something simply needs to get done', body: 'Administrative, mobile, document, or time-sensitive work can be handled without creating another internal project.', to: '/services' },
]

export default function Home() {
  usePageMeta('Home', 'Professional services, business consulting, POS and payment technology transition support, operations, property support, and mobile services.')

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />

      <section className="relative overflow-hidden border-b border-white/[.06]">
        <div className="enterprise-grid pointer-events-none absolute inset-0 opacity-30" />
        <div className="container-pmv relative py-16 sm:py-20 lg:py-24 xl:py-28">
          <div className="grid gap-12 lg:grid-cols-[1.12fr_.88fr] lg:items-center lg:gap-16">
            <div>
              <div className="mb-6 flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500">
                <span className="rounded-full border border-gold/20 bg-gold/[.06] px-3 py-1.5 text-gold/80">Professional Services</span>
                <span>Business • Property • Operations</span>
              </div>
              <h1 className="max-w-5xl font-display text-5xl font-medium leading-[1.02] tracking-[-.035em] text-white sm:text-6xl lg:text-7xl xl:text-[5.4rem]">
                Keep the work moving.<br /><span className="italic text-gold">We organize the next step.</span>
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">Pinnacle gives businesses and property owners one accountable point of coordination for consulting, transitions, administration, field work, and the details that keep projects from stalling.</p>
              <div className="mt-9 flex flex-wrap gap-3"><a href={CLIENT_SIGNUP} className={btnPrimary}>Start with Pinnacle</a><Link to="/services" className={btnOutline}>Explore Services</Link></div>
              <div className="mt-8 grid max-w-2xl grid-cols-1 gap-3 text-sm text-slate-400 sm:grid-cols-3">
                <div className="border-l border-gold/25 pl-4"><strong className="block text-white">One point of contact</strong><span className="mt-1 block">Less chasing vendors and loose ends.</span></div>
                <div className="border-l border-white/10 pl-4"><strong className="block text-white">Flexible engagement</strong><span className="mt-1 block">Projects, retainers, or defined support.</span></div>
                <div className="border-l border-white/10 pl-4"><strong className="block text-white">Secure workspace</strong><span className="mt-1 block">Keep communication and work organized.</span></div>
              </div>
            </div>

            <div className="surface-panel-strong overflow-hidden rounded-2xl">
              <div className="border-b border-white/[.08] px-6 py-5"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-gold/70">Common starting points</p><p className="mt-2 text-sm text-slate-400">Start with the situation. We’ll help shape the engagement.</p></div>
              {startingPoints.map((service, index) => (
                <Link key={service.key} to={`/services/${service.slug}`} className="group grid gap-2 border-b border-white/[.07] px-6 py-5 last:border-b-0 sm:grid-cols-[38px_1fr_auto] sm:items-start sm:gap-4 hover:bg-white/[.025]">
                  <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/[.08] bg-white/[.02] font-display text-xs text-gold/70">{String(index + 1).padStart(2, '0')}</span>
                  <span><span className="block text-sm font-semibold text-white group-hover:text-gold">{service.title}</span><span className="mt-1.5 block text-xs leading-5 text-slate-400">{service.shortDescription}</span></span>
                  <span className="hidden pt-1 text-slate-600 transition group-hover:translate-x-1 group-hover:text-gold sm:block">→</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container-pmv py-16 sm:py-20">
        <Reveal className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-16">
          <div>
            <p className="eyebrow">Start with the situation</p>
            <h2 className="mt-4 font-display text-3xl font-medium tracking-tight text-white sm:text-4xl">Professional support that adapts to the work.</h2>
            <p className="mt-5 text-sm leading-7 text-slate-400">You do not need to know which service category applies. Tell us what is happening and where the friction is.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {situations.map((item) => (
              <Link key={item.title} to={item.to} className="group surface-panel rounded-xl p-5 transition hover:-translate-y-0.5 hover:border-gold/20">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gold/20 bg-gold/[.06] text-gold"><Icon name={item.icon} size={17} /></div>
                <h3 className="mt-5 text-sm font-semibold text-white group-hover:text-gold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.body}</p>
                <span className="mt-4 inline-flex text-xs font-semibold text-gold/80">See how Pinnacle can help →</span>
              </Link>
            ))}
          </div>
        </Reveal>
      </section>

      <section className="border-y border-white/[.07] bg-navy-900/35">
        <div className="container-pmv py-16 sm:py-20">
          <Reveal className="max-w-3xl"><p className="eyebrow">How Pinnacle works</p><h2 className="mt-4 font-display text-3xl font-medium tracking-tight text-white sm:text-4xl">Clear ownership without adding another layer of complexity.</h2><p className="mt-5 text-base leading-7 text-slate-300">We help define the work, organize the right people and information, and keep the next action visible from beginning to completion.</p></Reveal>
          <div className="mt-10"><SplitFeatures items={[
            ['Tell us what is happening', 'Start with the problem, goal, transition, or task. You do not need to diagnose the service yourself.'],
            ['We organize the next move', 'Pinnacle clarifies scope, coordinates people and information, and keeps ownership of follow-up visible.'],
            ['Your workspace grows with you', 'Track active work first. Add other Pinnacle services only when they become useful.'],
          ]} /></div>
        </div>
      </section>

      <section className="container-pmv py-16 sm:py-20">
        <Reveal className="surface-panel-strong grid overflow-hidden rounded-2xl lg:grid-cols-[.9fr_1.1fr]">
          <div className="border-b border-white/[.08] p-7 sm:p-9 lg:border-b-0 lg:border-r"><p className="eyebrow">The client experience</p><h2 className="mt-4 font-display text-3xl font-medium tracking-tight text-white sm:text-4xl">You should always know what happens next.</h2><p className="mt-5 text-sm leading-7 text-slate-400">Pinnacle combines human support with a secure workspace so active engagements stay easy to understand.</p></div>
          <div className="p-7 sm:p-9">
            <div className="space-y-6">
              <div className="flex gap-4"><span className="font-display text-sm text-gold">01</span><div><h3 className="text-sm font-semibold text-white">Guided intake</h3><p className="mt-1 text-sm leading-6 text-slate-400">We capture the context that matters without turning onboarding into a giant form.</p></div></div>
              <div className="flex gap-4"><span className="font-display text-sm text-gold">02</span><div><h3 className="text-sm font-semibold text-white">Visible next steps</h3><p className="mt-1 text-sm leading-6 text-slate-400">Tasks, communication, documents, and service activity stay organized around the engagement.</p></div></div>
              <div className="flex gap-4"><span className="font-display text-sm text-gold">03</span><div><h3 className="text-sm font-semibold text-white">One ongoing relationship</h3><p className="mt-1 text-sm leading-6 text-slate-400">As needs change, new services can be added without starting over with a new provider every time.</p></div></div>
            </div>
            <a href={CLIENT_SIGNUP} className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-gold">Open your secure workspace <Icon name="arrowRight" size={14} /></a>
          </div>
        </Reveal>
      </section>

      <CtaBand title="Ready to get something moving?" body="Create your client account with the basics. We’ll help you organize the next step from inside the secure Pinnacle workspace." primary={{ to: '/portal/signup', label: 'Get Started' }} secondary={{ to: '/contact', label: 'Talk to Pinnacle' }} />
      <section className="border-b border-white/[.07]"><div className="container-pmv flex flex-col items-center justify-between gap-3 py-6 text-sm text-slate-400 sm:flex-row"><span>Already working with Pinnacle?</span><div className="flex flex-wrap items-center gap-4"><a href="https://secure.pinnaclemanagementventures.com/login" className="font-medium text-gold hover:underline">Client Login →</a><a href="https://secure.pinnaclemanagementventures.com/hq/login" className="font-medium text-slate-400 hover:text-gold">Team Login →</a></div></div></section>
      <Footer />
    </div>
  )
}
