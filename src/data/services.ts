export interface ServiceInfo {
  slug: string
  key: string // matches D1 services.key
  title: string
  tag: string
  popular?: boolean
  shortDescription: string
  heroDescription: string
  highlights: string[]
  idealFor: string[]
}

export const services: ServiceInfo[] = [
  {
    slug: 'consulting',
    key: 'consulting',
    title: 'Business & Operations Consulting',
    tag: 'Professional Services',
    popular: true,
    shortDescription: 'Hands-on support for operations, vendor changes, systems, workflows, and complex business projects.',
    heroDescription:
      'When a project has too many moving pieces, Pinnacle can step in as the coordination layer. We help define the work, organize vendors and stakeholders, track decisions, and keep implementation moving from planning through follow-through.',
    highlights: [
      'Operations review, workflow improvement, and process documentation',
      'Vendor evaluation, transition planning, and implementation coordination',
      'CRM, payment, POS, and business-system project support',
      'Project-based consulting and ongoing advisory engagements',
    ],
    idealFor: ['Owners managing a major operational change', 'Teams with processes that have outgrown the business', 'Businesses that need an experienced project lead without adding full-time headcount'],
  },
  {
    slug: 'merchant-services',
    key: 'merchant_services',
    title: 'POS & Payment Technology Consulting',
    tag: 'Consulting',
    popular: true,
    shortDescription: 'Independent guidance and project coordination for POS, payments, vendor transitions, and implementation.',
    heroDescription:
      'Changing a POS, payment provider, or core business platform is more than signing a new agreement. Pinnacle helps you organize the transition, coordinate the parties involved, prepare authorized business data, track implementation, and plan a cleaner go-live.',
    highlights: [
      'Current-environment and business-requirements review',
      'POS, payment-provider, and vendor evaluation support',
      'Authorized data export, organization, migration, and field-mapping coordination',
      'Implementation timeline, testing, training, cutover, and post-launch issue tracking',
    ],
    idealFor: ['Businesses considering a new POS or payment provider', 'Multi-location operators planning a system transition', 'Owners who want someone on their side coordinating vendors and implementation'],
  },
  {
    slug: 'administrative-support',
    key: 'admin_support',
    title: 'Administrative & Operational Support',
    tag: 'Professional Services',
    shortDescription: 'Flexible support for the follow-up, coordination, records, and recurring work that keeps a business moving.',
    heroDescription:
      'Offload the operational and administrative work that keeps pulling you away from higher-value priorities. Pinnacle can support defined projects, recurring workflows, or ongoing business needs.',
    highlights: [
      'Records, documentation, and workflow organization',
      'Scheduling, correspondence, and follow-up coordination',
      'Vendor, customer, and project administration',
      'Flexible project-based or ongoing support',
    ],
    idealFor: ['Owners wearing too many hats', 'Small teams without dedicated operations support', 'Businesses that need reliable project or recurring administrative capacity'],
  },
  {
    slug: 'funding',
    key: 'funding',
    title: 'Business Funding & Capital Support',
    tag: 'Professional Services',
    shortDescription: 'Understand financing options, prepare for applications, and connect with independent funding sources.',
    heroDescription:
      'We help businesses understand potential funding paths, prepare the information lenders may request, and coordinate introductions to independent third-party financing sources when appropriate.',
    highlights: [
      'Funding readiness review',
      'Guidance on financing options and structures',
      'Connections to independent third-party lenders',
      'Application support and document preparation',
    ],
    idealFor: ['Businesses seeking working capital', 'Owners preparing for expansion', 'Companies exploring financing options for the first time'],
  },
  {
    slug: 'property-management',
    key: 'property_management',
    title: 'Property Owner Support',
    tag: 'Property Services',
    shortDescription: 'Practical coordination for owners who need help keeping property-related work organized and moving.',
    heroDescription:
      'Pinnacle helps property owners coordinate the day-to-day moving pieces around their properties, from vendor scheduling and issue follow-up to documentation and owner support.',
    highlights: [
      'Vendor and maintenance coordination',
      'Property-related communication and follow-up',
      'Owner documentation and project tracking',
      'Support for local and out-of-area property owners',
    ],
    idealFor: ['Investment-property owners', 'Owners coordinating multiple vendors or projects', 'Out-of-area or hands-off property owners'],
  },
  {
    slug: 'property-inspections',
    key: 'property_inspections',
    title: 'Property Inspections',
    tag: 'Property Services',
    shortDescription: 'Documented property-condition checks and field reporting for owners and businesses.',
    heroDescription:
      'Get a clearer, documented view of a property’s condition for routine oversight, project follow-up, or another defined business need.',
    highlights: [
      'Condition observations with photo documentation',
      'Routine, project, and owner-requested field checks',
      'Clear written reporting you can act on',
      'Scheduling coordinated around your timeline',
    ],
    idealFor: ['Owners tracking property condition', 'Out-of-area owners needing local field support', 'Businesses needing documented site observations'],
  },
  {
    slug: 'document-courier',
    key: 'document_courier',
    title: 'Document Courier',
    tag: 'Mobile Services',
    shortDescription: 'Professional point-to-point delivery for important and time-sensitive documents.',
    heroDescription:
      'When a document needs to get from one place to another reliably, Pinnacle coordinates professional pickup, delivery, and confirmation.',
    highlights: [
      'Careful handling of important and time-sensitive documents',
      'Point-to-point pickup and delivery',
      'Delivery confirmation',
      'Coordinated scheduling for one-time or recurring needs',
    ],
    idealFor: ['Business and real-estate documents', 'Time-sensitive local deliveries', 'Recurring interoffice or client deliveries'],
  },
  {
    slug: 'mobile-notary',
    key: 'mobile_notary',
    title: 'Mobile Notary',
    tag: 'Mobile Services',
    shortDescription: 'Commissioned Florida notary service brought to a convenient South Florida location.',
    heroDescription:
      'For documents that require notarization, a commissioned Florida notary can meet you at a convenient eligible location for professional, straightforward service.',
    highlights: [
      'Commissioned Florida notary public',
      'Flexible scheduling and mobile service',
      'Support for commonly notarized personal and business documents',
      'Professional handling of sensitive documents',
    ],
    idealFor: ['Business documents', 'Affidavits and powers of attorney', 'People who need a notary to come to them'],
  },
]

export function getServiceBySlug(slug: string | undefined): ServiceInfo | undefined {
  return services.find((s) => s.slug === slug)
}
