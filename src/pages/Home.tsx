import { Link } from 'react-router-dom'
import { Header } from '../components/public/Header'
import { Footer } from '../components/public/Footer'
import { btnOutline, btnPrimary, CtaBand, SplitFeatures } from '../components/public/ui'
import { Reveal } from '../components/public/motion'
import { services } from '../data/services'
import { usePageMeta } from '../lib/usePageMeta'
import { Icon, type IconName } from '../components/kit/Icon'

const CLIENT_SIGNUP = 'https://client.pinnaclemanagementventures.com/signup?source=home'

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

      <section className="container-pmv py-16 sm:py-20 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[1.08fr_.92fr] lg:items-end lg:gap-16">
          <div>
            <p className="eyebrow">Professional Services &amp; Business Consulting</p>
            <h1 className="mt-4 max-w-4xl font-display text-5xl font-medium leading-[1.04] tracking-tight text-white sm:text-6xl lg:text-7xl">
              Keep the work moving.<br /><span className="italic text-gold">We’ll help organize the rest.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">Pinnacle helps businesses and property owners coordinate complicated work, bring the right people together, and keep the next step clear.</p>
            <div className="mt-8 flex flex-wrap gap-3"><a href={CLIENT_SIGNUP} className={btnPrimary}>Get Started</a><Link to="/services" className={btnOutline}>Explore Services</Link></div>
            <p className="mt-5 max-w-xl text-sm leading-6 text-slate-400">You do not need to know the service name before you begin. Start with what is happening, and we’ll help map the right path from there.</p>
          </div>

          <div className="border-y border-white/10">
            <div className="py-4"><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Common starting points</p></div>
            {startingPoints.map((service, index) => (
              <Link key={service.key} to={`/services/${service.slug}`} className="group grid gap-2 border-t border-white/10 py-4 sm:grid-cols-[32px_1fr_auto] sm:items-start sm:gap-4">
                <span className="font-display text-sm text-gold/70">{String(index + 1).padStart(2, '0')}</span>
                <span><span className="block text-sm font-semibold text-white group-hover:text-gold">{service.title}</span><span className="mt-1 block text-xs leading-5 text-slate-400">{service.shortDescription}</span></span>
                <span className="hidden pt-0.5 text-slate-500 transition group-hover:translate-x-1 group-hover:text-gold sm:block">→</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-navy-900/30">
        <div className="container-pmv py-14 sm:py-16">
          <Reveal className="grid gap-8 lg:grid-cols-[.78fr_1.22fr] lg:gap-14">
            <div>
              <p className="eyebrow">Start with the situation</p>
              <h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Professional help should fit the work, not force you into a box.</h2>
              <p className="mt-4 text-sm leading-6 text-slate-400">Pinnacle can handle a defined task, coordinate a project, or stay involved as needs evolve.</p>
            </div>
            <div className="divide-y divide-white/10 border-y border-white/10">
              {situations.map((item) => (
                <Link key={item.title} to={item.to} className="group grid gap-3 py-5 sm:grid-cols-[34px_1fr_auto] sm:items-start sm:gap-4">
                  <span className="pt-0.5 text-gold"><Icon name={item.icon} size={18} /></span>
                  <span><span className="block text-sm font-semibold text-white group-hover:text-gold">{item.title}</span><span className="mt-1 block text-sm leading-6 text-slate-400">{item.body}</span></span>
                  <span className="hidden text-slate-500 transition group-hover:translate-x-1 group-hover:text-gold sm:block">→</span>
                </Link>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="container-pmv py-14 sm:py-16">
        <Reveal className="max-w-2xl"><p className="eyebrow">How Pinnacle works</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">White-glove coordination without making the process heavier.</h2><p className="mt-4 text-slate-300">We learn enough to understand what is happening, organize the next move, and keep the relationship easy to follow as the work develops.</p></Reveal>
        <div className="mt-9"><SplitFeatures items={[
          ['Tell us what is happening', 'Start with the problem, goal, transition, or task. You do not need to diagnose the service yourself.'],
          ['We organize the next move', 'Pinnacle helps clarify scope, coordinate people and information, and keep ownership of the follow-up visible.'],
          ['Your portal grows with the relationship', 'Track current work first. Discover other services only when they become useful to you.'],
        ]} /></div>
      </section>

      <section className="border-y border-white/10 bg-navy-900/30">
        <Reveal className="container-pmv grid gap-8 py-14 sm:py-16 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
          <div><p className="eyebrow">The client journey</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">You should always know what happens next.</h2></div>
          <div className="space-y-4 text-slate-300">
            <p>Once you create an account, Pinnacle carries the reason you came in into a guided welcome. We ask for context in smaller steps, keep the next useful action visible, and leave the rest of the portal available to discover when you need it.</p>
            <p className="text-sm text-slate-400">The goal is not to make you learn a system. The goal is to give the work one organized place to live.</p>
            <a href={CLIENT_SIGNUP} className="inline-flex items-center gap-2 text-sm font-semibold text-gold">Start my Pinnacle journey <Icon name="arrowRight" size={14} /></a>
          </div>
        </Reveal>
      </section>

      <section id="why" className="container-pmv py-14 sm:py-16">
        <Reveal className="grid gap-8 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
          <div><p className="eyebrow">Why Pinnacle</p><h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Too many moving pieces. One point of coordination.</h2></div>
          <div className="space-y-3 text-slate-300"><p>Pinnacle can work alongside your existing vendors, systems, contractors, lenders, processors, and internal team when authorized.</p><p className="text-sm text-slate-400">Clear ownership, clear next steps, and less time spent chasing the work.</p><Link to="/about" className="inline-flex items-center gap-2 text-sm font-semibold text-gold">How we work <Icon name="arrowRight" size={14}/></Link></div>
        </Reveal>
      </section>

      <CtaBand title="Ready to get something moving?" body="Create your client account with the basics. We’ll help you organize the next step from inside the portal." primary={{ to: '/portal/signup', label: 'Get Started' }} secondary={{ to: '/contact', label: 'Talk to Pinnacle' }} />
      <section className="border-b border-white/10"><div className="container-pmv flex flex-col items-center justify-between gap-3 py-6 text-sm text-slate-400 sm:flex-row"><span>Already working with Pinnacle?</span><div className="flex flex-wrap items-center gap-4"><a href="https://client.pinnaclemanagementventures.com/login" className="font-medium text-gold hover:underline">Client Login →</a><a href="https://hq.pinnaclemanagementventures.com/login" className="font-medium text-slate-400 hover:text-gold">Team Login →</a></div></div></section>
      <Footer />
    </div>
  )
}
