import { Link } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { Card, Crest } from '../../components/ui'

const values = [
  ['Straight answers', 'We tell you what a service actually involves — and what it doesn’t — before you commit to anything.'],
  ['One point of contact', 'A single team coordinates across services, so you’re not repeating yourself to a different person every time.'],
  ['Right-sized support', 'From a one-time notarization to ongoing consulting, we scale to what you actually need.'],
]

export default function About() {
  return (
    <div className="min-h-screen bg-navy-radial">
      <Header />
      <section className="container-pmv py-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 flex justify-center">
            <Crest size={88} />
          </div>
          <p className="eyebrow">About us</p>
          <h1 className="mt-2 text-4xl font-bold text-white">Professional support, without the runaround</h1>
          <p className="mt-5 text-lg text-slate-300">
            Pinnacle Management Ventures connects businesses and property owners with the professional resources
            they need — consulting, funding, property management, mobile notary, inspections, courier, and
            administrative support — coordinated under one roof instead of scattered across a dozen vendors.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {values.map(([t, d]) => (
            <Card key={t}>
              <h3 className="text-lg font-semibold text-gold">{t}</h3>
              <p className="mt-2 text-sm text-slate-300">{d}</p>
            </Card>
          ))}
        </div>

        <Card className="mx-auto mt-14 max-w-3xl text-center">
          <p className="eyebrow">How we work</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Tell us what you need — we&rsquo;ll take it from there</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">
            Every engagement starts with a conversation, not a contract. We&rsquo;ll help you figure out which
            services fit, what it costs, and what happens next.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/contact" className="btn-gold">Request Service</Link>
            <Link to="/services" className="btn-outline">Browse Services</Link>
          </div>
        </Card>
      </section>
      <Footer />
    </div>
  )
}
