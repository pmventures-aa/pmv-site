export interface ServiceInfo {
  slug: string
  key: string
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
    shortDescription: 'Practical help with operations, vendor changes, systems, workflows, and business projects.',
    heroDescription:
      'Pinnacle helps owners and teams bring structure to operational projects that have become difficult to manage internally. We can define the work, organize vendors and stakeholders, document decisions, and keep implementation moving.',
    highlights: [
      'Operations reviews, workflow improvement, and process documentation',
      'Vendor evaluation, transition planning, and implementation support',
      'CRM, payment, POS, and business system projects',
      'Project consulting and ongoing operational support',
    ],
    idealFor: ['Owners managing an operational change', 'Teams whose processes have outgrown the business', 'Businesses that need experienced project support without adding full-time headcount'],
  },
  {
    slug: 'merchant-services',
    key: 'merchant_services',
    title: 'POS & Payment Technology Consulting',
    tag: 'Consulting',
    popular: true,
    shortDescription: 'Independent support for POS, payments, vendor changes, data preparation, and implementation.',
    heroDescription:
      'Changing a POS system, payment provider, or related business platform can affect data, staff, vendors, hardware, and day-to-day operations. Pinnacle helps plan the transition, coordinate the parties involved, organize authorized business data, and manage implementation through launch.',
    highlights: [
      'Review of your current setup and business requirements',
      'POS, payment provider, and vendor evaluation support',
      'Authorized data export, organization, migration, and field mapping support',
      'Implementation planning, testing, training, launch, and issue tracking',
    ],
    idealFor: ['Businesses considering a new POS or payment provider', 'Multi-location operators planning a system change', 'Owners who want independent help coordinating vendors and implementation'],
  },
  {
    slug: 'administrative-support',
    key: 'admin_support',
    title: 'Administrative & Operational Support',
    tag: 'Professional Services',
    shortDescription: 'Flexible help with follow-up, records, scheduling, coordination, and recurring operational work.',
    heroDescription:
      'Pinnacle can take on administrative and operational work that is consuming time but still needs dependable follow-through. Support can be built around a defined project, a recurring process, or an ongoing business need.',
    highlights: [
      'Records, documentation, and workflow organization',
      'Scheduling, correspondence, and follow-up',
      'Vendor, customer, and project administration',
      'Project-based or ongoing support',
    ],
    idealFor: ['Owners handling too much themselves', 'Small teams without dedicated operations support', 'Businesses that need reliable administrative capacity'],
  },
  {
    slug: 'funding',
    key: 'funding',
    title: 'Business Funding & Capital Support',
    tag: 'Professional Services',
    shortDescription: 'Review financing options, prepare application materials, and connect with independent funding sources.',
    heroDescription:
      'Pinnacle helps businesses prepare for financing conversations by organizing the information lenders may request, reviewing available funding paths, and coordinating introductions to independent third-party sources when appropriate.',
    highlights: [
      'Funding readiness review',
      'Review of financing options and structures',
      'Introductions to independent third-party lenders',
      'Application and document preparation support',
    ],
    idealFor: ['Businesses seeking working capital', 'Owners preparing for expansion', 'Companies comparing financing options'],
  },
  {
    slug: 'property-management',
    key: 'property_management',
    title: 'Property Owner Support',
    tag: 'Property Services',
    shortDescription: 'Help coordinating property work, vendors, documentation, and owner follow-up.',
    heroDescription:
      'Pinnacle helps property owners stay on top of the practical work around a property, including vendor scheduling, issue follow-up, documentation, field coordination, and owner-requested projects.',
    highlights: [
      'Vendor and maintenance coordination',
      'Property communication and follow-up',
      'Owner documentation and project tracking',
      'Support for local and out-of-area owners',
    ],
    idealFor: ['Investment property owners', 'Owners coordinating multiple vendors or projects', 'Out-of-area owners who need local support'],
  },
  {
    slug: 'property-inspections',
    key: 'property_inspections',
    title: 'Property Inspections',
    tag: 'Property Services',
    shortDescription: 'Documented property condition checks and field reporting for owners and businesses.',
    heroDescription:
      'Pinnacle provides documented field observations when an owner or business needs a current view of a property for routine oversight, project follow-up, or another defined purpose.',
    highlights: [
      'Condition observations with photo documentation',
      'Routine, project, and owner-requested field checks',
      'Written reporting with practical observations',
      'Scheduling based on the needs of the assignment',
    ],
    idealFor: ['Owners monitoring property condition', 'Out-of-area owners needing local field support', 'Businesses needing documented site observations'],
  },
  {
    slug: 'document-courier',
    key: 'document_courier',
    title: 'Document Courier',
    tag: 'Mobile Services',
    shortDescription: 'Point-to-point pickup and delivery for important or time-sensitive documents.',
    heroDescription:
      'When documents need to be delivered locally and reliably, Pinnacle can coordinate pickup, delivery, and confirmation based on the timing and handling requirements of the assignment.',
    highlights: [
      'Careful handling of important documents',
      'Point-to-point pickup and delivery',
      'Delivery confirmation',
      'One-time or recurring scheduling',
    ],
    idealFor: ['Business and real estate documents', 'Time-sensitive local deliveries', 'Recurring office or client deliveries'],
  },
  {
    slug: 'mobile-notary',
    key: 'mobile_notary',
    title: 'Mobile Notary',
    tag: 'Mobile Services',
    shortDescription: 'Florida notary service available at convenient eligible locations in South Florida.',
    heroDescription:
      'For documents that require notarization, Pinnacle can coordinate service with a commissioned Florida notary at an eligible location that works for the signer and the assignment.',
    highlights: [
      'Commissioned Florida notary public',
      'Mobile scheduling in the service area',
      'Common personal and business documents',
      'Careful handling of sensitive documents',
    ],
    idealFor: ['Business documents', 'Affidavits and powers of attorney', 'People who need a notary to come to them'],
  },
]

export function getServiceBySlug(slug: string | undefined): ServiceInfo | undefined {
  return services.find((s) => s.slug === slug)
}
