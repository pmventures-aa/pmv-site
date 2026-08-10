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
  { icon: 'briefcase', title: 'Business operations need more structure', body: 'We can help organize projects, vendors, systems, follow-up, and day-to-day operational work.', to: '/services/consulting' },
  { icon: 'building', title: 'A property or field project needs attention', body: 'We can coordinate access, inspections, documentation, vendors, and work happening on site.', to: '/services/property-management' },
  { icon: 'services', title: 'You are changing systems or service providers', body: 'We help plan and coordinate POS, payments, technology, data, training, and implementation changes.', to: '/services/merchant-services' },
  { icon: 'file', title: 'You need reliable help with a defined task', body: 'Administrative, document, mobile, and time-sensitive work can be handled without creating another internal project.', to: '/services' },
]

export default function Home() {
  usePageMeta('Home', 'Professional services, business consulting, POS and payment technology transition support, operations, property support, and mobile services.')

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />

      <section className="border-b border-white/[.06]">
        <div className="container-pmv py-16 sm:py-20 lg:py-24 xl:py-28">
          <div className="grid gap-12 lg:grid-cols-[1.12fr_.88fr] lg:items-center lg:gap-16">
            <div>
              <div className="mb-6 flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[.14em] text-slate-500">
                <span className="rounded-full border border-gold/20 bg-gold/[.05] px-3 py-1.5 text-gold/80">Professional Services</span>
                <span>Business, Property, Operations</span>
              </div>
              <h1 className="max-w-5xl font-display text-5xl font-medium leading-[1.03] tracking-[-.03em] text-white sm:text-6xl lg:text-7xl xl:text-[5.2rem]">
                Practical support for the work that keeps piling up.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">Pinnacle helps businesses and property owners manage projects, coordinate service providers, handle operational work, and move complicated tasks forward with one point of contact.</p>
              <div className="mt-9 flex flex-wrap gap-3"><a href={CLIENT_SIGNUP} className={btnPrimary}>Get Started</a><Link to="/services" className={btnOutline}>View Services</Link></div>
              <div className="mt-8 grid max-w-2xl grid-cols-1 gap-4 text-sm text-slate-400 sm:grid-cols-3">
                <div><strong className="block text-white">One point of contact</strong><span className="mt-1 block">A clearer place to bring the work and follow-up.</span></div>
                <div><strong className="block text-white">Flexible support</strong><span className="mt-1 block">Use us for a project, a retainer, or a specific task.</span></div>
                <div><strong className="block text-white">Secure client access</strong><span className="mt-1 block">Keep documents, messages, and active work organized.</span></div>
              </div>
            </div>

            <div className="surface-panel-strong overflow-hidden rounded-xl">
              <div className="border-b border-white/[.08] px-6 py-5"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-gold/70">Common reasons clients contact us</p><p className="mt-2 text-sm text-slate-400">Choose the closest fit, or just tell us what is going on.</p></div>
              {startingPoints.map((service, index) => (
                <Link key={service.key} to={`/services/${service.slug}`} className="group grid gap-2 border-b border-white/[.07] px-6 py-5 last:border-b-0 sm:grid-cols-[38px_1fr_auto] sm:items-start sm:gap-4 hover:bg-white/[.025]">
                  <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/[.08] bg-white/[.02] font-display text-xs text-gold/70">{String(index + 1).padStart(2, '0')}</span>
                  <span><span className="block text-sm font-semibold text-white group-hover:text-gold">{service.title}</span><span className="mt-1.5 block text-xs leading-5 text-slate-400">{service.shortDescription}</span></span>
                  <span className="hidden pt-1 text-slate-600 transition group-hover:translate-x-1 group-hover:text-gold sm:block">›</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container-pmv py-16 sm:py-20">
        <Reveal className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-16">
          <div>
            <p className="eyebrow">Start with the problem</p>
            <h2 className="mt-4 font-display text-3xl font-medium tracking-tight text-white sm:text-4xl">You do not need to fit your situation into a service category.</h2>
            <p className="mt-5 text-sm leading-7 text-slate-400">Tell us what needs attention, what has stalled, or what you are trying to change. We can help determine the right scope from there.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {situations.map((item) => (
              <Link key={item.title} to={item.to} className="group surface-panel rounded-xl p-5 transition hover:-translate-y-0.5 hover:border-gold/20">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gold/20 bg-gold/[.05] text-gold"><Icon name={item.icon} size={17} /></div>
                <h3 className="mt-5 text-sm font-semibold text-white group-hover:text-gold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.body}</p>
                <span className="mt-4 inline-flex text-xs font-semibold text-gold/80">Learn more ›</span>
              </Link>
            ))}
          </div>
        </Reveal>
      </section>

      <section className="border-y border-white/[.07] bg-navy-900/35">
        <div className="container-pmv py-16 sm:py-20">
          <Reveal className="max-w-3xl"><p className="eyebrow">How it works</p><h2 className="mt-4 font-display text-3xl font-medium tracking-tight text-white sm:text-4xl">A straightforward way to get the right work moving.</h2><p className="mt-5 text-base leading-7 text-slate-300">We get enough context to understand the problem, define what needs to happen, and stay involved at the level the work actually requires.</p></Reveal>
          <div className="mt-10"><SplitFeatures items={[
            ['Tell us what you need', 'Share the problem, project, transition, or task in plain language.'],
            ['We define the work', 'We clarify the scope, identify the right resources, and establish who is responsible for what.'],
            ['We stay on top of it', 'Active work, communication, and documents stay organized while the engagement is underway.'],
          ]} /></div>
        </div>
      </section>

      <section className="container-pmv py-16 sm:py-20">
        <Reveal className="surface-panel-strong grid overflow-hidden rounded-xl lg:grid-cols-[.9fr_1.1fr]">
          <div className="border-b border-white/[.08] p-7 sm:p-9 lg:border-b-0 lg:border-r"><p className="eyebrow">Client access</p><h2 className="mt-4 font-display text-3xl font-medium tracking-tight text-white sm:text-4xl">Keep the work in one place.</h2><p className="mt-5 text-sm leading-7 text-slate-400">Clients have a secure workspace for active services, documents, communication, billing, and next steps.</p></div>
          <div className="p-7 sm:p-9">
            <div className="space-y-6">
              <div className="flex gap-4"><span className="font-display text-sm text-gold">01</span><div><h3 className="text-sm font-semibold text-white">Simple intake</h3><p className="mt-1 text-sm leading-6 text-slate-400">We ask for the information needed for your specific request rather than making you complete a generic packet.</p></div></div>
              <div className="flex gap-4"><span className="font-display text-sm text-gold">02</span><div><h3 className="text-sm font-semibold text-white">Clear status</h3><p className="mt-1 text-sm leading-6 text-slate-400">See current tasks, messages, documents, and service activity without chasing updates.</p></div></div>
              <div className="flex gap-4"><span className="font-display text-sm text-gold">03</span><div><h3 className="text-sm font-semibold text-white">A continuing relationship</h3><p className="mt-1 text-sm leading-6 text-slate-400">When something new comes up, you can bring it back to the same place instead of starting from scratch.</p></div></div>
            </div>
            <a href={CLIENT_SIGNUP} className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-gold">Create a client account <Icon name="arrowRight" size={14} /></a>
          </div>
        </Reveal>
      </section>

      <CtaBand title="Need help with something specific?" body="Tell us what needs to be handled and we’ll help determine the right next step." primary={{ to: '/portal/signup', label: 'Get Started' }} secondary={{ to: '/contact', label: 'Contact Us' }} />
      <section className="border-b border-white/[.07]"><div className="container-pmv flex flex-col items-center justify-between gap-3 py-6 text-sm text-slate-400 sm:flex-row"><span>Already working with Pinnacle?</span><div className="flex flex-wrap items-center gap-4"><a href="https://secure.pinnaclemanagementventures.com/login" className="font-medium text-gold hover:underline">Client Login</a><a href="https://secure.pinnaclemanagementventures.com/hq/login" className="font-medium text-slate-400 hover:text-gold">Team Login</a></div></div></section>
      <Footer />
    </div>
  )
}
