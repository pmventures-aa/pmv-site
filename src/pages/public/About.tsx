import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { CtaBand, PageIntro, SplitFeatures } from '../../components/public/ui'

const values: [string, string][] = [
  ['Straight answers', 'We tell you what a service actually involves — and what it doesn’t — before you commit to anything.'],
  ['One point of contact', 'A single team coordinates across services, so you’re not repeating yourself to a different person every time.'],
  ['Right-sized support', 'From a one-time notarization to ongoing consulting, we scale to what you actually need.'],
]

export default function About() {
  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <section className="container-pmv py-16">
        <PageIntro
          kicker="About us"
          title="Professional support, without the runaround"
          subtitle="Pinnacle Management Ventures connects businesses and property owners with the professional resources they need — consulting, funding, property management, mobile notary, inspections, courier, and administrative support — coordinated under one roof instead of scattered across a dozen vendors."
        />
        <div className="mt-14">
          <SplitFeatures items={values} />
        </div>
      </section>

      <CtaBand
        title="Tell us what you need — we’ll take it from there"
        body="Every engagement starts with a conversation, not a contract. We’ll help you figure out which services fit, what it costs, and what happens next."
        primary={{ to: '/contact', label: 'Request Service' }}
        secondary={{ to: '/services', label: 'Browse Services' }}
      />
      <Footer />
    </div>
  )
}
