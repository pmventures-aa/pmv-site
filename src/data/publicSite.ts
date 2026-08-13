export const GET_HELP = '/scope-request?source=get-help'
export const CLIENT_LOGIN = '/portal/login'

export const pathways = [
  {
    key: 'business',
    label: 'Business',
    title: 'Support for the work behind your business.',
    body: 'Consulting, operations, payments and systems, funding readiness, and project coordination. One owner for the next step.',
    to: '/services/business-operations',
    items: ['Consulting', 'Operations & Administrative Support', 'Payments & Business Systems', 'Funding Support', 'Project & Vendor Coordination'],
  },
  {
    key: 'property',
    label: 'Property',
    title: 'Help managing the details behind a property or project.',
    body: 'Inspections, vendor coordination, document and courier work, and project oversight. Licensed property managers or CAMs are named when that work requires them.',
    to: '/services/property-field',
    items: ['Property Support', 'Vendor Coordination', 'Inspections', 'Document & Courier Services', 'Project Oversight'],
  },
  {
    key: 'personal',
    label: 'Personal & Administrative',
    title: 'Professional help when something simply needs to get handled.',
    body: 'Documents, mobile notary, research, applications, scheduling, and the administrative work that does not belong on your evening.',
    to: '/services/mobile-documents',
    items: ['Document Assistance', 'Mobile Notary', 'Research', 'Applications', 'Administrative Tasks', 'Professional Coordination'],
  },
] as const

export const howItWorks = [
  ['Tell Us What\'s Going On', 'Start with the situation, the address, the document, or the deadline. You do not need the correct service name.'],
  ['We Review the Matter', 'We confirm what Pinnacle can handle directly, what needs a qualified provider, and what the work will involve.'],
  ['Know Who\'s Handling It', 'You get a named point of contact and a clear next step, instead of being sent between vendors.'],
  ['We Stay With It', 'Updates, documents, and completion stay in one place until the agreed work is done.'],
] as const

export const whyPinnacle = [
  ['One Point of Contact', 'Bring the next need back to a team that already has the context.'],
  ['Clear Scope', 'We say what we own, what a specialist owns, and what you decide.'],
  ['Real Follow-Through', 'The next step has an owner. Photos, notes, and files stay with the request.'],
  ['Secure Client Experience', 'Matters, documents, messages, and billing live in a private portal once you are a client.'],
  ['Flexible Support', 'One task, a defined project, or ongoing help. The structure matches the work.'],
] as const

export const useCases = [
  { title: 'I\'m opening another location.', body: 'Capacity, vendors, systems, and the handoffs that come with growth.', to: '/scope-request?world=business&source=use-case-location' },
  { title: 'I\'m switching POS or payment providers.', body: 'Comparison, data, cutover, and follow-up without losing the middle.', to: '/projects/switching-pos-payment-providers' },
  { title: 'I own a property but don\'t have time to coordinate everything.', body: 'Inspections, cleaning, vendors, and documented visits from one request.', to: '/scope-request?world=property&source=use-case-property' },
  { title: 'I need a document delivered or notarized.', body: 'Preparation, courier, mobile notary, or RON with a completion record.', to: '/scope-request?world=documents&source=use-case-document' },
  { title: 'I don\'t even know who handles this.', body: 'Start with Pinnacle. Tell us what is going on and we will help determine the next step.', to: GET_HELP },
] as const

export const portalHighlights = [
  'Matters and current status',
  'Documents and agreements',
  'Updates from your Pinnacle contact',
  'Billing and next steps',
] as const

export const founder = {
  name: 'Cody R. Jenkins',
  title: 'Founder & Managing Director',
  lead: 'After years working directly with businesses, clients, vendors, financial-service providers, implementations, operations, and escalations, Cody kept seeing the same pattern: even straightforward matters required too many providers, repeated follow-ups, and too much coordination from the customer.',
  close: 'Pinnacle was designed around a simpler approach: understand the matter, establish ownership, coordinate what is needed, and follow through.',
}

export const principles = [
  ['Understand the Matter', 'Before recommending the solution.'],
  ['Own the Next Step', 'Clear responsibility and communication.'],
  ['Coordinate What Matters', 'Across people, vendors, and providers.'],
  ['Follow Through', 'Until the agreed work is complete.'],
] as const
