import { LegalPage, P, Strong, UL, type LegalSection } from '../../components/public/LegalPage'
import { usePageMeta } from '../../lib/usePageMeta'
import { PROVIDER_AGREEMENT_VERSION } from '../../../shared/providerAgreement'

const sections: LegalSection[] = [
  {
    id: 'agreement',
    title: 'The Agreement and Who It Covers',
    content: <>
      <P>This Independent Provider Network Agreement is between <Strong>Pinnacle Management Ventures</Strong>, referred to as <Strong>Pinnacle</Strong>, <Strong>we</Strong>, <Strong>us</Strong>, or <Strong>our</Strong>, and the individual or business accepting it, referred to as the <Strong>Provider</Strong>, <Strong>you</Strong>, or <Strong>your</Strong>.</P>
      <P>This is the master agreement for your participation in the Pinnacle Professional Network. It becomes effective when you accept it electronically and continues until terminated. Your provider application, each written assignment or work order, applicable service standards, and any signed addendum are part of the agreement for the work they cover. A specific work order controls if it conflicts with this master agreement about that assignment's scope, location, timing, rate, expenses, or deliverables.</P>
      <P>If you accept for a company, practice, or other legal entity, you represent that you have authority to bind that entity. The entity and the person performing the work are both responsible for obligations that apply to them.</P>
    </>,
  },
  {
    id: 'network',
    title: 'Professional Network, Not Guaranteed Work',
    content: <>
      <P>Approval means Pinnacle may consider you for work that fits your services, credentials, service area, availability, capacity, and performance history. Approval does not guarantee assignments, minimum earnings, recurring work, territory exclusivity, client access, or continued network status.</P>
      <P>You may update your availability and may accept or decline an opportunity before it becomes a work order. Declining an opportunity does not breach this agreement. Once you accept a work order, you are responsible for the commitment unless Pinnacle releases you in writing.</P>
    </>,
  },
  {
    id: 'services',
    title: 'Services the Network May Coordinate',
    content: <>
      <P>Pinnacle coordinates a broad professional network. You may accept only work that fits your approved profile, actual qualifications, lawful authority, and current credentials. Potential assignments include:</P>
      <UL>
        <li><Strong>Property and field services:</Strong> property-condition and occupancy checks, photographs and video, cleaning and deep cleaning, janitorial work, turns, inspections within the provider's lawful scope, REO and vacant-property support, eviction and move-out support, preservation, lock or lockbox services, key and access coordination, minor maintenance or repair when qualified, vendor access, courier work, and documented site visits.</li>
        <li><Strong>Documents, signing, and mobile support:</Strong> client-directed document preparation or data entry, printing, copying, scanning, pickup, delivery, filing, courthouse or government runs, process service where lawfully authorized, mobile notary work, Remote Online Notarization, signing-agent appointments, witnesses, and document execution support.</li>
        <li><Strong>Business, administrative, and operational support:</Strong> administrative capacity, project or transaction coordination, bookkeeping support, vendor coordination, consulting, implementation, research, technology, POS and payment-system work, training, data migration, and funding-readiness or referral support.</li>
        <li><Strong>Licensed or specialized professional work:</Strong> legal, accounting, tax, inspection, contracting, brokerage, engineering, financial, or other regulated services only when the work order identifies the qualified provider and the provider may lawfully perform the work.</li>
      </UL>
      <P>A category in your profile is not permission to perform regulated work. A work order does not expand a license, commission, certification, permit, or legal scope.</P>
    </>,
  },
  {
    id: 'work-orders',
    title: 'Opportunities, Work Orders, and Changes',
    content: <>
      <P>An opportunity is a request for your review, not a promise of work. It should identify the available scope, location or remote status, expected timing, compensation, material access conditions, and required deliverables. Ask questions before accepting if the information is not sufficient to price, schedule, or lawfully perform the work.</P>
      <P>An opportunity becomes a <Strong>Work Order</Strong> when you accept it and Pinnacle confirms the assignment through the platform, email, text, or another written channel. You must promptly report a conflict, unsafe condition, access problem, material change, or fact that makes the original scope impractical. Do not perform or charge for additional work without written approval. An approved change may update the deadline, rate, expenses, or deliverables.</P>
      <P>Pinnacle may cancel or reassign unaccepted opportunities. If Pinnacle cancels an accepted Work Order without Provider fault, the Work Order will govern any trip, cancellation, or completed-work fee. If it is silent, Pinnacle will pay for conforming work completed and preapproved noncancelable expenses through the cancellation time.</P>
    </>,
  },
  {
    id: 'performance',
    title: 'Performance and Communication Standards',
    content: <>
      <P>You agree to perform accepted work professionally, safely, lawfully, and by the deadline in the Work Order. You control the lawful means and methods used to produce the required result, subject to site rules, client-authorized scope, security requirements, objective specifications, and professional standards.</P>
      <UL>
        <li>Review the full Work Order before accepting and confirm that you have the time, tools, credentials, transportation, and capacity to complete it.</li>
        <li>Use accurate status updates. Do not mark work started, on site, complete, or delivered when it is not.</li>
        <li>Follow stated photo, video, report, document, checklist, file-format, and completion-proof requirements.</li>
        <li>Protect the client experience. Be respectful, appropriately dressed for the assignment, and clear about your role as an independent Pinnacle provider.</li>
        <li>Do not make promises, admissions, price changes, legal conclusions, or commitments on behalf of Pinnacle or a client.</li>
        <li>Report a likely delay as soon as you know about it. Silence after accepting a time-sensitive assignment is a performance failure.</li>
      </UL>
      <P>If a deliverable is incomplete or does not reasonably match the Work Order, Pinnacle may request a prompt cure when practical. Pinnacle may reassign urgent, unsafe, abandoned, materially late, or uncured work. Payment may be reduced only for rejected, incomplete, duplicative, unauthorized, or nonconforming portions and will not be withheld arbitrarily.</P>
    </>,
  },
  {
    id: 'site',
    title: 'Property Access, Safety, and Sensitive Assignments',
    content: <>
      <P>Enter a property, open a lockbox, change access, post a notice, photograph an interior, contact an occupant, handle belongings, or remove material only when the Work Order provides documented authority and clear instructions. Never force entry, misrepresent your identity or authority, threaten an occupant, provide legal advice, or participate in a physical eviction.</P>
      <P>Eviction, foreclosure, REO, preservation, and vacant-property assignments may be sensitive. Your role is limited to the lawful field, documentation, cleaning, delivery, coordination, or other support stated in the Work Order. Service of process, legal document selection, contracting, mold or hazardous-material work, and other regulated activity may be performed only by a person authorized to do it.</P>
      <P>Stop and move to a safe location if you encounter a threatening person, unsafe structure, active criminal activity, uncontrolled animal, suspected hazardous material, exposed utility, or another condition outside your training or scope. Contact emergency services when reasonably necessary, then notify Pinnacle. Do not create or conceal damage.</P>
    </>,
  },
  {
    id: 'credentials',
    title: 'Licenses, Insurance, Verification, and Equipment',
    content: <>
      <P>You must maintain every license, commission, registration, permit, bond, certification, background clearance, and insurance policy required by law or the Work Order. You must promptly tell Pinnacle about an expiration, suspension, restriction, claim, investigation, lapse, or other change that may affect your eligibility.</P>
      <P>You are responsible for your ordinary business expenses, transportation, devices, tools, supplies, protective equipment, software, connectivity, and other resources unless a Work Order states otherwise. Do not accept an assignment that requires equipment, training, insurance, or credentials you do not have.</P>
      <P>Pinnacle may verify identity, business registration, tax information, insurance, licenses, references, work history, and submitted documents. When a background or consumer report requires a separate disclosure or authorization, Pinnacle will request it separately. Approval or verification by Pinnacle does not transfer the Provider's professional responsibility to Pinnacle.</P>
    </>,
  },
  {
    id: 'notary',
    title: 'Notaries, RON, and Other Independent Professional Duties',
    content: <>
      <P>A notary, Remote Online Notary, signing agent, attorney, accountant, inspector, contractor, or other regulated professional must exercise the independent judgment and duties required by applicable law and professional standards. Nothing in a Work Order requires a provider to perform an improper act, ignore a conflict, alter a certificate, select a legal instrument, backdate a record, conceal a fee, or act outside an authorized scope.</P>
      <P>A notary may refuse or stop a notarial act when identity, willingness, awareness, document readiness, technology, location, journal, recording, witness, or other legal requirements are not satisfied. The provider must document the reason through the appropriate secure channel without disclosing more personal information than necessary.</P>
    </>,
  },
  {
    id: 'independent',
    title: 'Independent Business Relationship',
    content: <>
      <P>The parties intend an independent business relationship. You are not a Pinnacle employee, partner, joint venturer, franchisee, or general agent. The actual facts and applicable law control classification, not this heading alone.</P>
      <UL>
        <li>You decide whether to accept each opportunity and may provide services to other clients or companies.</li>
        <li>You control your business organization and the lawful means and methods of performing accepted work, while remaining responsible for the promised result.</li>
        <li>You bear your ordinary business expenses and may realize a profit or loss from the way you operate.</li>
        <li>You receive no employee wages, overtime, paid leave, retirement, unemployment, workers' compensation, health insurance, or other employee benefit from Pinnacle unless applicable law requires otherwise.</li>
        <li>You have no authority to hire, bind, contract for, incur debt for, or make representations on behalf of Pinnacle or a client.</li>
      </UL>
      <P>You may not transfer a Work Order or give another person client information, credentials, property access, or performance responsibility without Pinnacle's advance written approval. Approved personnel remain under your direction and responsibility, must be lawfully engaged by you, and must satisfy the same applicable security, credential, confidentiality, and service requirements.</P>
    </>,
  },
  {
    id: 'payment',
    title: 'Compensation, Expenses, Invoices, and Taxes',
    content: <>
      <P>The Work Order states the compensation for an assignment and any conditions for a rush, trip, cancellation, milestone, or completion payment. Compensation includes your ordinary overhead unless the Work Order says otherwise. Travel, tolls, parking, filing fees, materials, third-party charges, and other expenses require advance written approval to be reimbursable.</P>
      <P>Submit complete deliverables, required completion evidence, and any invoice or payment information requested. Unless a Work Order provides a different schedule, Pinnacle will pay undisputed, verified amounts within 30 calendar days after receiving the completed work, a complete invoice when required, and all tax and payment records needed to issue payment. Pinnacle will give a reasonable description of a disputed or rejected amount and an opportunity to provide missing information or cure when practical.</P>
      <P>You are responsible for federal, state, and local taxes, registrations, business filings, insurance, payroll, and reporting obligations arising from your business and personnel. You must provide a current Form W-9 or other required tax documentation. Pinnacle may report compensation, apply backup withholding, or make other deductions when required by law.</P>
    </>,
  },
  {
    id: 'confidentiality',
    title: 'Confidential Information, Client Data, and Security',
    content: <>
      <P>Client identities, contact details, property and occupancy information, access codes, alarm information, documents, signatures, financial information, credentials, photographs, pricing, Work Orders, internal methods, and nonpublic business information are confidential. Use them only to perform the accepted work and disclose them only to an approved person who needs them for that work.</P>
      <UL>
        <li>Use Pinnacle's secure platform or approved channel for sensitive records. Do not place confidential material in personal cloud folders, public links, social media, or unapproved AI or file-sharing services.</li>
        <li>Keep account credentials, keys, gate codes, lockbox combinations, and one-time links private. Do not reuse or retain access after the assignment.</li>
        <li>Collect only the information and images the Work Order requires. Avoid unrelated people, documents, screens, license plates, or personal belongings when they are not needed.</li>
        <li>Notify Pinnacle immediately, and no later than 24 hours after discovery, of suspected loss, unauthorized access, mistaken disclosure, device compromise, or security incident affecting Pinnacle or client information.</li>
        <li>Return or securely delete confidential material when instructed, subject to a legal or professional record-retention duty you disclose to Pinnacle.</li>
      </UL>
      <P>These duties continue after an assignment and after this agreement ends.</P>
    </>,
  },
  {
    id: 'client',
    title: 'Client Communication and No Side Arrangements',
    content: <>
      <P>Communicate with a client, occupant, signer, property contact, or other third party only as the Work Order permits. Route scope, pricing, complaints, changes, and payment questions through Pinnacle unless the Work Order authorizes another process. Do not collect money from a client or occupant, advertise unrelated services during an assignment, or move Pinnacle work to a direct side arrangement.</P>
      <P>You remain free to advertise generally and serve your existing or independently developed relationships. During an active Work Order and for six months after its completion, you will not use Pinnacle's confidential information or introduction to knowingly route the same client need, or materially related follow-on work arising from that assignment, around Pinnacle to avoid the agreed coordination or fee structure. This restriction does not apply to a preexisting relationship disclosed before accepting the Work Order, general advertising not directed using Pinnacle information, or work Pinnacle approves in writing.</P>
    </>,
  },
  {
    id: 'work-product',
    title: 'Work Product, Records, and Publicity',
    content: <>
      <P>Reports, photographs, video, forms, data, notes, diagrams, recordings, files, and other assignment-specific material created for a Work Order are <Strong>Work Product</Strong>. To the extent permitted by law, Work Product is specially commissioned for Pinnacle or its client and will be treated as work made for hire. To the extent it is not work made for hire, you assign to Pinnacle all right, title, and interest needed for Pinnacle and the client to own, use, reproduce, modify, distribute, verify, and retain it for the assignment and related business, legal, insurance, compliance, and recordkeeping purposes.</P>
      <P>You retain ownership of tools, methods, templates, know-how, and material developed independently of the assignment. If your background material is embedded in a deliverable, you grant Pinnacle and the client a perpetual, worldwide, paid-up license to use it as part of that deliverable.</P>
      <P>Do not publish, sell, reuse, train a model on, or use client or assignment material for a portfolio, marketing, social media, or another purpose without prior written approval. Maintain accurate assignment and payment records for the period required by law and any longer period stated in the Work Order.</P>
    </>,
  },
  {
    id: 'representations',
    title: 'Provider Promises',
    content: <>
      <P>You represent that application and payment information is accurate and current; you may lawfully operate the business and perform accepted services; your work will be original or properly licensed; you are not bound by another obligation that prevents performance; and you will comply with applicable law, professional duties, the Work Order, and this agreement.</P>
      <P>You will not engage in discrimination, harassment, retaliation, bribery, kickbacks, fraud, theft, falsification, trespass, unauthorized surveillance, substance impairment while performing work, or other conduct that threatens a person, property, record, or client relationship.</P>
    </>,
  },
  {
    id: 'risk',
    title: 'Responsibility, Indemnification, and Liability',
    content: <>
      <P>Each party is responsible for its own acts and omissions. You will defend and indemnify Pinnacle, its clients, and their personnel from third-party claims, damages, penalties, and reasonable legal costs to the extent caused by your breach of this agreement, negligence, willful misconduct, unlawful act, infringement, data-security failure, or the acts of personnel you use. Pinnacle will defend and indemnify you from third-party claims to the extent caused by Pinnacle's negligence, willful misconduct, or material breach.</P>
      <P>To the fullest extent permitted by law, neither party is liable to the other for indirect, special, exemplary, punitive, or consequential damages, or lost profits unrelated to payment for completed Work Orders. Except for payment obligations and liability that cannot lawfully be limited, each party's aggregate liability under this agreement will not exceed the greater of amounts paid or payable under Work Orders during the 12 months before the event or available insurance proceeds covering the claim.</P>
      <P>The liability limit does not apply to fraud, willful misconduct, bodily injury, physical property damage, confidentiality or data-security obligations, intellectual-property infringement, indemnification obligations, or a provider's unauthorized collection of client funds.</P>
    </>,
  },
  {
    id: 'term',
    title: 'Suspension and Termination',
    content: <>
      <P>Either party may end this agreement or pause future opportunities by written notice. Ending the agreement does not cancel an accepted Work Order unless the parties agree or Pinnacle reassigns it. Pinnacle may immediately suspend opportunities, access, or an assignment for a safety or security risk, suspected fraud, expired credential, client request, material performance failure, unlawful conduct, breach, or conduct that may harm a client or the network.</P>
      <P>On termination, return access items and confidential material, submit completed Work Product, and cooperate in a reasonable handoff for accepted work. Accrued payment obligations and provisions concerning confidentiality, data security, taxes, records, Work Product, client protection, liability, disputes, and other terms that by nature should continue will survive.</P>
    </>,
  },
  {
    id: 'electronic',
    title: 'Electronic Records and Communications',
    content: <>
      <P>You agree that the relationship may be administered electronically. Click acceptance, a typed signature, platform activity, email or text acceptance, timestamps, IP and device information, audit records, and other electronic evidence may document your intent and assignment activity. You may save or print this agreement and should keep copies of accepted Work Orders and payment records.</P>
      <P>Service messages about applications, opportunities, Work Orders, safety, access, security, credentials, performance, and payment are transactional communications. Marketing consent is separate and is not required to participate in the network. The <a href="/electronic-communications" className="font-bold text-gold hover:text-gold-300">Electronic Communications Disclosure</a> provides additional details.</P>
    </>,
  },
  {
    id: 'disputes',
    title: 'Disputes, Arbitration, and Class Waiver',
    content: <>
      <P><Strong>Please read this section carefully because it affects legal rights.</Strong> Before filing a formal claim, the complaining party must send written notice describing the dispute and requested resolution and allow at least 30 days for good-faith informal resolution. Notice to Pinnacle may be emailed to support@pinnaclemanagementventures.com with the subject "Provider Legal Dispute Notice."</P>
      <P>If the dispute is not resolved, either party may elect individual binding arbitration administered by the American Arbitration Association under the rules applicable to the dispute. The Federal Arbitration Act governs this arbitration provision. Hearings may be remote when allowed. Unless the parties agree otherwise, the arbitration seat will be Broward County, Florida. Either party may bring an eligible individual claim in small claims court or seek temporary injunctive relief to protect safety, property access, confidential information, intellectual property, or account security.</P>
      <P>Claims must be brought only on an individual basis and not as a class, collective, coordinated, consolidated, or representative action to the fullest extent permitted by law. You may opt out of arbitration by emailing support@pinnaclemanagementventures.com within 30 days after first accepting this agreement. Use the subject "Provider Arbitration Opt Out" and include your name, account email, and a clear statement that you are opting out. Opting out does not affect network eligibility.</P>
    </>,
  },
  {
    id: 'law',
    title: 'Governing Law and General Terms',
    content: <>
      <P>Florida law and applicable federal law govern this agreement, without regard to conflict-of-law principles. If a dispute is not subject to arbitration, the parties consent to exclusive venue in state or federal court in Broward County, Florida, unless applicable law requires another venue.</P>
      <P>You may not assign this agreement or a Work Order without Pinnacle's written consent. Pinnacle may assign the agreement in connection with a merger, financing, reorganization, sale, or transfer of the relevant business. Neither party is liable for delay caused by events beyond reasonable control, except payment for work already accepted and completed.</P>
      <P>If a provision is unenforceable, it will be limited to the minimum extent necessary and the remainder will continue. A waiver must be in writing and applies only to the stated instance. This agreement, accepted Work Orders, applicable addenda, and incorporated disclosures are the entire agreement about the provider relationship and replace prior inconsistent discussions about that subject.</P>
    </>,
  },
  {
    id: 'changes',
    title: 'Future Versions',
    content: <>
      <P>Pinnacle may revise this agreement as services, the platform, or law changes. A revised version will not retroactively change an accepted Work Order. If a revision materially changes provider rights or obligations, Pinnacle will provide reasonable notice and require affirmative acceptance before the revised version governs new assignments.</P>
    </>,
  },
]

export default function ProviderAgreement() {
  usePageMeta('Independent Provider Network Agreement', 'Terms for independent professionals and service providers participating in the Pinnacle Management Ventures network.')
  return <LegalPage eyebrow="Pinnacle Professional Network" title="Independent Provider Network Agreement" intro="One master agreement for the provider relationship, with clear work orders for each assignment. It applies across Pinnacle's property, field, document, notary, administrative, business, technology, and specialized professional network." updated={PROVIDER_AGREEMENT_VERSION} sections={sections}/>
}
