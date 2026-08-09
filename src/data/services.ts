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
    title: 'Consulting',
    tag: 'Consulting',
    popular: true,
    shortDescription: 'Strategic guidance for business operations, growth, and organizational efficiency.',
    heroDescription:
      'Whether you’re untangling day-to-day operations or planning your next stage of growth, our consultants work alongside you to build a clear, practical path forward.',
    highlights: [
      'Operations review and process improvement',
      'Growth strategy and market positioning',
      'Organizational structure and efficiency planning',
      'Ongoing advisory sessions with a dedicated consultant',
    ],
    idealFor: ['Founders scaling past the early stage', 'Teams with operational bottlenecks', 'Businesses planning a major transition'],
  },
  {
    slug: 'funding',
    key: 'funding',
    title: 'Funding & Capital',
    tag: 'Funding',
    popular: true,
    shortDescription: 'Explore funding opportunities and connect with financing solutions for growth.',
    heroDescription:
      'We help you understand your funding options and connect you with financing solutions suited to where your business is today — and where you want it to go.',
    highlights: [
      'Funding readiness review',
      'Guidance on financing options and structures',
      'Connections to independent third-party lenders',
      'Application support and document preparation',
    ],
    idealFor: ['Businesses seeking working capital', 'Owners preparing for expansion', 'Companies exploring financing for the first time'],
  },
  {
    slug: 'property-management',
    key: 'property_management',
    title: 'Property Management',
    tag: 'Property',
    shortDescription: 'Tenant coordination, maintenance scheduling, and financial reporting.',
    heroDescription:
      'From tenant coordination to maintenance and reporting, we help property owners keep operations running smoothly — without the day-to-day burden.',
    highlights: [
      'Tenant communication and coordination',
      'Maintenance scheduling and vendor coordination',
      'Owner financial reporting',
      'Support across residential, commercial, and mixed-use properties',
    ],
    idealFor: ['Owners of investment property', 'Landlords managing multiple units', 'Out-of-state or hands-off property owners'],
  },
  {
    slug: 'mobile-notary',
    key: 'mobile_notary',
    title: 'Mobile Notary',
    tag: 'Notary',
    shortDescription: 'Commissioned Florida notary services at your location.',
    heroDescription:
      'A commissioned Florida notary comes to you — your home, office, or another convenient location — for fast, professional notarization.',
    highlights: [
      'Commissioned Florida notary public',
      'Flexible scheduling, on-site service',
      'Loan documents, affidavits, powers of attorney, and more',
      'Clear, professional handling of sensitive documents',
    ],
    idealFor: ['Real estate closings', 'Powers of attorney and affidavits', 'Anyone who can’t make it to a notary office'],
  },
  {
    slug: 'property-inspections',
    key: 'property_inspections',
    title: 'Property Inspections',
    tag: 'Property',
    shortDescription: 'Detailed property assessments and condition reports.',
    heroDescription:
      'Get a clear, documented picture of a property’s condition — for a purchase decision, routine oversight, or an insurance requirement.',
    highlights: [
      'Detailed condition assessments with photo documentation',
      'Pre-purchase, routine, and insurance-driven inspections',
      'Clear written reports you can act on',
      'Scheduling coordinated around your timeline',
    ],
    idealFor: ['Buyers evaluating a property', 'Owners tracking property condition over time', 'Insurance-required inspections'],
  },
  {
    slug: 'document-courier',
    key: 'document_courier',
    title: 'Document Courier',
    tag: 'Courier',
    shortDescription: 'Secure, timely delivery of important documents.',
    heroDescription:
      'When a document absolutely has to get there — intact, on time, and handled with care — our courier service delivers.',
    highlights: [
      'Secure handling of sensitive and time-critical documents',
      'Point-to-point pickup and delivery',
      'Delivery confirmation',
      'Coordinated scheduling for recurring courier needs',
    ],
    idealFor: ['Real estate and closing documents', 'Legal filings with tight deadlines', 'Recurring interoffice or client deliveries'],
  },
  {
    slug: 'merchant-services',
    key: 'merchant_services',
    title: 'Merchant Services',
    tag: 'Merchant',
    shortDescription: 'Payment processing setup and rate review for card and online payments.',
    heroDescription:
      'From accepting your first card payment to reviewing what you’re paying today, we help you set up or improve how your business gets paid.',
    highlights: [
      'Payment processing setup for card-present and online payments',
      'Rate and statement review against your current processor',
      'Guidance on point-of-sale and payment system options',
      'Support switching processors without disrupting your business',
    ],
    idealFor: ['New businesses setting up payments for the first time', 'Owners unsure if they’re overpaying on processing fees', 'Businesses outgrowing their current payment setup'],
  },
  {
    slug: 'administrative-support',
    key: 'admin_support',
    title: 'Administrative Support',
    tag: 'Admin',
    shortDescription: 'Filing, scheduling, correspondence, and day-to-day tasks.',
    heroDescription:
      'Offload the administrative work that eats into your week — filing, scheduling, correspondence, and the day-to-day tasks that keep a business running.',
    highlights: [
      'Filing and records organization',
      'Scheduling and calendar coordination',
      'Correspondence and follow-up management',
      'Flexible hours based on what you need',
    ],
    idealFor: ['Solo founders wearing too many hats', 'Small teams without dedicated admin support', 'Seasonal or project-based support needs'],
  },
]

export function getServiceBySlug(slug: string | undefined): ServiceInfo | undefined {
  return services.find((s) => s.slug === slug)
}
