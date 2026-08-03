import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { panelCls } from '../../components/public/ui'

const sections: [string, string][] = [
  [
    'Scope of services',
    'Pinnacle Management Ventures ("Pinnacle," "we," "us") provides business consulting, funding and capital ' +
      'introductions, property management, mobile notary services, property inspections, document courier, and ' +
      'administrative support. Not every service is available in every location or to every account. Availability ' +
      'is confirmed individually.',
  ],
  [
    'Not a law firm',
    'Pinnacle is not a law firm and does not provide legal advice, legal document preparation, licensed ' +
      'real-estate brokerage, or contracting services unless those credentials are specifically confirmed in ' +
      'writing for a given engagement. Notarial acts are performed only by a commissioned Florida notary, strictly ' +
      'within the bounds of Florida notary law, which does not include drafting legal documents or giving legal advice.',
  ],
  [
    'Funding and capital introductions',
    'Any funding, lending, or capital services are provided through third-party lenders and financing partners. ' +
      'Pinnacle does not itself extend credit, and no approval, rate, term, or funding outcome is guaranteed by ' +
      'Pinnacle or by any third-party partner we introduce you to.',
  ],
  [
    'Tax and accounting matters',
    'Any tax-related guidance is provided by, or in coordination with, appropriately qualified and licensed tax ' +
      'professionals. Nothing on this portal or site constitutes tax advice on its own; you should confirm your ' +
      'specific tax position with your assigned professional.',
  ],
  [
    'Property services',
    'Property management, inspection, and related services are provided where Pinnacle or its affiliated ' +
      'professionals are appropriately licensed for the applicable jurisdiction and service type.',
  ],
  [
    'Your account',
    'You are responsible for keeping your login credentials confidential and for all activity under your account. ' +
      'Notify us promptly at support@pinnaclemanagementventures.com if you suspect unauthorized access. You agree ' +
      'to provide accurate contact information, including a working phone number, so we can reach you about your ' +
      'services.',
  ],
  [
    'Communications',
    'By creating an account, you agree that Pinnacle may contact you by phone, email, or through the client ' +
      'portal about the services associated with your account.',
  ],
  [
    'Fees and payment',
    'Fees for specific services are quoted and agreed to separately before work begins. Invoices are payable per ' +
      'the terms stated on each invoice.',
  ],
  [
    'Limitation of liability',
    'To the fullest extent permitted by law, Pinnacle’s liability for any claim arising from these services is ' +
      'limited to the amount you paid Pinnacle for the specific service giving rise to the claim.',
  ],
  [
    'Changes to these terms',
    'We may update these terms from time to time. Continued use of the portal after an update constitutes ' +
      'acceptance of the revised terms. Material changes will be reflected by an updated effective date below.',
  ],
  [
    'Contact',
    'Questions about these terms can be sent to support@pinnaclemanagementventures.com or (561) 388-7879.',
  ],
]

export default function Terms() {
  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <section className="container-pmv py-16">
        <div className="mx-auto max-w-3xl">
          <p className="eyebrow">Legal</p>
          <h1 className="mt-3 font-display text-4xl font-medium text-white">Terms of Service</h1>
          <p className="mt-3 text-sm text-slate-400">Effective date: August 2, 2026</p>

          <div className={`${panelCls} mt-8 space-y-6`}>
            {sections.map(([title, body]) => (
              <div key={title}>
                <h2 className="text-base font-semibold text-white">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  )
}
