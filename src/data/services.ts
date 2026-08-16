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
  offeringPrefixes?: string[]
  planFamily?: 'property' | 'ops' | 'legal'
  /** Preselects the matching job in the scope-request wizard. */
  intakeJob?: string
}

// Several public service pages intentionally share one backend service key
// (the D1 `services` table drives intake, offerings, and reporting). The
// slug + offeringPrefixes split lets the public site present focused,
// detailed pages - field photos vs inspections, cleaning vs management vs
// eviction - without a schema migration.
export const services: ServiceInfo[] = [
  {
    slug: 'short-term-rental-support',
    key: 'str_turnover',
    title: 'Short-Term Rental Turnover Support',
    tag: 'Property Services',
    popular: true,
    planFamily: 'property',
    shortDescription: 'Verified STR turnovers: tracked checklists, required photos, issue flagging, and a guest-ready report in your portal. Per-turnover pricing quoted in writing.',
    heroDescription:
      'A short-term rental lives or dies on the gap between checkout and check-in. Pinnacle runs that gap as one owned process: a tracked checklist, required completion photos, issues flagged the moment they appear, independent verification before the property is released, and a guest-ready report in your portal.',
    highlights: [
      'Tracked room-by-room checklist matched to your property',
      'Required completion photos and a verified finish before the next guest',
      'Issues flagged with photos and approved extras, never surprise charges',
      'Reservation feeds and monthly managed support for busy calendars',
    ],
    idealFor: ['Short-term rental hosts and property owners', 'Out-of-area owners who want documented, verified turnovers', 'Hosts managing several calendars who want it to just work'],
    offeringPrefixes: ['str-turnover'],
    intakeJob: 'cleaning_turnover',
  },
  {
    slug: 'consulting',
    key: 'consulting',
    title: 'Business & Operations Consulting',
    tag: 'Business Services',
    popular: true,
    planFamily: 'ops',
    shortDescription: 'Hands-on help with operations, vendor changes, systems, and the projects that keep sliding to next week.',
    heroDescription:
      'Most operational projects do not fail for lack of ideas. They fail because nobody owns the next step. Pinnacle works alongside owners and teams to define the work, coordinate the vendors and stakeholders, document the decisions, and keep implementation moving until it is finished.',
    highlights: [
      'Operations reviews, workflow improvement, and written process documentation',
      'Independent vendor evaluation, transition planning, and implementation support',
      'CRM, payment, POS, and business system projects with one accountable owner',
      'Project engagements from $195 discovery sessions to full coordination',
    ],
    idealFor: ['Owners managing an operational change without internal bandwidth', 'Teams whose processes have outgrown the tools running them', 'Businesses that need experienced project support without a full-time hire'],
    offeringPrefixes: ['consult-'],
    intakeJob: 'business_operations',
  },
  {
    slug: 'merchant-services',
    key: 'merchant_services',
    title: 'POS & Payment Technology Consulting',
    tag: 'Business Services',
    popular: true,
    planFamily: 'ops',
    shortDescription: 'Independent support for POS and payment transitions: comparison, data preparation, cutover, and stabilization.',
    heroDescription:
      'Changing a POS system or payment provider touches your data, your staff, your hardware, and every day of revenue. Pinnacle plans the transition, coordinates the vendors, prepares and migrates authorized business data, and manages implementation through launch - without taking referral fees from the vendors being compared.',
    highlights: [
      'A documented review of your current setup, fees, and requirements',
      'Independent side-by-side vendor comparison with a clear recommendation',
      'Authorized data export, organization, migration, and field mapping',
      'Implementation planning, testing, training, cutover, and issue tracking',
    ],
    idealFor: ['Businesses comparing POS or payment providers', 'Multi-location operators planning a system change', 'Owners who want an independent coordinator between them and the vendors'],
    offeringPrefixes: ['pos-'],
    intakeJob: 'pos_payments',
  },
  {
    slug: 'administrative-support',
    key: 'admin_support',
    title: 'Administrative & Operational Support',
    tag: 'Business Services',
    planFamily: 'ops',
    shortDescription: 'Dependable capacity for follow-up, records, scheduling, and the recurring work that eats the owner\u2019s week.',
    heroDescription:
      'Pinnacle takes on the administrative and operational work that is consuming your time but still needs real follow-through: records, correspondence, scheduling, vendor and customer follow-up, and recurring processes. Built around a defined project, a monthly retainer, or a one-time sprint.',
    highlights: [
      'Records, documentation, and workflow organization',
      'Follow-up and scheduling sprints that clear the backlog in days',
      'Reserved project blocks at a $75/hr effective rate',
      'Monthly recurring support from $750, or an Ops-on-Call plan from $199/mo',
    ],
    idealFor: ['Owners doing administrative work at 9 pm', 'Small teams without dedicated operations support', 'Businesses that need steady capacity without adding headcount'],
    offeringPrefixes: ['admin-'],
    intakeJob: 'business_operations',
  },
  {
    slug: 'funding',
    key: 'funding',
    title: 'Business Funding & Capital Support',
    tag: 'Business Services',
    planFamily: 'ops',
    shortDescription: 'Get lender-ready: honest readiness review, organized documentation, and application support.',
    heroDescription:
      'Financing conversations go better when the paperwork is ready before anyone asks for it. Pinnacle reviews your funding readiness, organizes the documents lenders actually request, supports the application, and coordinates the follow-through after an approval.',
    highlights: [
      'A candid $195 readiness review before you apply anywhere',
      'Lender documentation organized into one complete package',
      'Application and underwriting document-request support',
      'Post-approval condition tracking through closing',
    ],
    idealFor: ['Businesses seeking working capital', 'Owners preparing for an expansion or equipment purchase', 'Companies comparing financing structures'],
    offeringPrefixes: ['funding-'],
    intakeJob: 'business_operations',
  },
  {
    slug: 'property-management',
    key: 'property_management',
    title: 'Property Management & Owner Support',
    tag: 'Property Services',
    popular: true,
    planFamily: 'property',
    shortDescription: 'Licensed property managers and CAM agents in the Pinnacle network, at a lower cost than the typical 8-12% shop, plus on-call Property Care if you keep the keys.',
    heroDescription:
      'South Florida full-service management typically runs 8-12% of collected rent plus a stack of fees that rarely gets explained up front. Pinnacle gives owners a straighter path: coordination and field services a la carte, monthly Property Care plans from $89, and tenant placement or full management through our licensed broker partner at the lower end of the market band - with every fee in writing before you sign anything.',
    highlights: [
      'Vendor coordination, access management, and maintenance follow-up from $75 per visit',
      'Turnover and make-ready projects run against a tracked punch list',
      'Tenant placement (typically 75-100% of first month\u2019s rent) and full management (8-10% of collected rent) via licensed partner',
      'Monthly Property Care plans with included inspections, service credits, and member discounts',
    ],
    idealFor: ['Landlords who want oversight without the full management percentage', 'Out-of-area owners who need dependable local follow-through', 'Investors comparing management proposals and tired of surprise fees'],
    offeringPrefixes: ['property-tenant-placement','property-full-management','property-portfolio','property-vendor-coordinate','property-access','property-maintenance-followup','property-turnover-coordinate','property-project-coordinate'],
    intakeJob: 'cleaning_turnover',
  },
  {
    slug: 'property-cleaning',
    key: 'property_management',
    title: 'Property Cleaning, Turnovers & Preservation',
    tag: 'Property Services',
    popular: true,
    planFamily: 'property',
    shortDescription: 'Standard, deep, move-out, REO, and post-eviction cleaning with photo documentation and instant planning estimates.',
    heroDescription:
      'Every clean is scoped to the actual condition and the outcome you need: a routine refresh, a landlord-inspection-grade move-out, an REO ready-to-market preparation, or a heavy post-eviction reset. Get an instant planning range online in 30 seconds, then a confirmed price after a short scope review - before-and-after photos included when it matters.',
    highlights: [
      'Standard cleaning typically $150-250; deep cleaning $275-500',
      'Move-out / turnover cleaning $325-650 by size, with deposit-file photo documentation',
      'REO, vacant-property, trash-out, and preservation visits for asset teams',
      'Instant online estimate, real appointment slots, and documented completion',
    ],
    idealFor: ['Landlords and hosts between occupants', 'Agents and investors preparing a listing', 'Banks, servicers, and asset managers with vacant inventory'],
    offeringPrefixes: ['property-standard-clean','property-deep-clean','property-moveout-clean','property-reo-clean','property-trashout','property-preservation'],
    intakeJob: 'cleaning_turnover',
  },
  {
    slug: 'eviction-support',
    key: 'property_management',
    title: 'Eviction Support & Turnover (Non-Legal)',
    tag: 'Property Services',
    popular: true,
    planFamily: 'property',
    shortDescription: 'Notice preparation, filing packets, courthouse runs, milestone tracking, lockout-day coordination, and post-possession turnover.',
    heroDescription:
      'A Florida eviction is a sequence of small, unforgiving steps: the notice, the filing, the service, the docket, the writ, the lockout, the turnover. Pinnacle handles the non-legal work in that sequence - document preparation from your instructions, field delivery with photo proof, courthouse filing runs, milestone tracking, and the physical turnover after lawful possession - and coordinates with your attorney when the case needs one.',
    highlights: [
      'Client-directed notice preparation from $75; delivery or posting visits with timestamped photos from $95',
      'Filing-ready document packets from $225; court fees always pass-through, never marked up',
      'Docket milestone tracking and writ / lockout-day coordination with locksmith and securing',
      'Post-possession packages: inspection, trash-out, deep clean, and ready-to-list preparation',
    ],
    idealFor: ['Self-managing landlords handling a non-payment or holdover case', 'Investors and REO teams recovering possession at scale', 'Attorneys who want the field work and paperwork logistics off their desk'],
    offeringPrefixes: ['eviction-','property-eviction-admin','property-lockout-turnover'],
    intakeJob: 'eviction_reo',
  },
  {
    slug: 'property-inspections',
    key: 'property_inspections',
    title: 'Property Inspections & Condition Reports',
    tag: 'Property Services',
    planFamily: 'property',
    shortDescription: 'Occupancy checks, interior condition packages, rent-ready and move-out reports, rehab progress, and insurance documentation.',
    heroDescription:
      'When you cannot be at the property, the report has to stand in for you. Pinnacle delivers documented field inspections with GPS-tagged, timestamped photos and plain-language observations: occupancy verification from $75, interior condition packages from $145, and recurring programs for rentals, rehabs, and vacant assets.',
    highlights: [
      'Occupancy verification and notice-posting visits',
      'Interior / exterior condition packages, rent-ready and move-out reports',
      'Rehab, draw, and new-construction progress documentation on a cadence',
      'Insurance, underwriting, and disaster / loss photo documentation',
    ],
    idealFor: ['Out-of-area owners and investors', 'Lenders and servicers needing dated condition evidence', 'Landlords running 30/60/90-day or turnover inspections'],
    offeringPrefixes: ['occupancy','insurance-photo','disaster-doc','interior-','pmi-removal','qc-progress','investor-','rentready-','moveout','construction','boarded','video-','vacation-rental'],
    intakeJob: 'property_inspection',
  },
  {
    slug: 'field-photos-bpo',
    key: 'property_inspections',
    title: 'Field Photos, Verification & BPO Support',
    tag: 'Property Services',
    popular: true,
    planFamily: 'property',
    shortDescription: 'Direct-vendor photo verification from $65, BPO photo sets, licensed Broker Price Opinions, and commercial site audits.',
    heroDescription:
      'National platforms charge $95-125 for an exterior verification and route it to whoever is available. Pinnacle is the local vendor: exterior photo sets from $65 with 24-48 hour turnaround, complete BPO photo packages shot to your platform checklist, licensed Broker Price Opinions through our vetted network, and commercial site audits across Miami-Dade, Broward, and Palm Beach - with volume rates at 10+ orders per month.',
    highlights: [
      'Exterior photo verification sets from $65, GPS-tagged and timestamped',
      'BPO photo sets - drive-by from $79, full interior from $149 - labeled to your checklist',
      'Licensed exterior BPOs from $165 and interior BPOs from $265 via vetted brokers',
      'Commercial, signage, mystery-audit, vehicle, marine, and aircraft verification',
    ],
    idealFor: ['BPO brokers and agents who need reliable photo coverage', 'Servicers, asset managers, and inspection companies routing South Florida volume', 'Underwriters and lenders verifying collateral'],
    offeringPrefixes: ['field-','bpo-','listing-verification','commercial-','gas-station','landscape','restroom','night-signage','community-amenities','dealership','hotel','display-endcap','auto-','motorcycle','rv','marine-','aircraft-'],
    intakeJob: 'property_inspection',
  },
  {
    slug: 'document-preparation',
    key: 'admin_support',
    title: 'Document Preparation & Filing Support',
    tag: 'Document Services',
    popular: true,
    planFamily: 'legal',
    shortDescription: 'Client-directed document preparation, landlord packets, business filings, and filing-ready packages with delivery handled.',
    heroDescription:
      'Paperwork stalls when nobody owns the assembly: the right form, the right copies, the right counter, the right fee. Pinnacle prepares client-directed non-lawyer documents, organizes landlord and business packets, handles Florida annual reports and business filings, and gets the finished package delivered, filed, and confirmed - and tells you plainly when the matter needs an attorney instead.',
    highlights: [
      'Client-directed form and document preparation from $95',
      'Property / landlord packets: leases, ledgers, notices, and photos organized into one file',
      'Florida annual report and business filing support with state fees pass-through',
      'Courier, courthouse and agency delivery, and filing confirmation',
    ],
    idealFor: ['Owners who need paperwork organized and moved forward', 'Landlords building a clean file before a dispute', 'Businesses with recurring registration and filing deadlines'],
    offeringPrefixes: ['document-'],
    intakeJob: 'documents_notary',
  },
  {
    slug: 'document-courier',
    key: 'document_courier',
    title: 'Document Courier & Filing Runs',
    tag: 'Document Services',
    planFamily: 'legal',
    shortDescription: 'Tracked point-to-point delivery, same-day tri-county runs, and courthouse filings with stamped copies returned.',
    heroDescription:
      'Some documents cannot ride with a parcel service: original signatures, filings with a deadline, checks that need a receipt. Pinnacle runs tracked point-to-point deliveries across Broward, Palm Beach, and Miami-Dade, with photo and signature confirmation on every handoff and stamped copies returned from every filing.',
    highlights: [
      'Local delivery from $55 with photo and signature confirmation',
      'Same-day tri-county runs and priority direct delivery',
      'Courthouse and agency filing runs with stamped copies and receipts',
      'Recurring routes for firms and offices on a weekly cadence',
    ],
    idealFor: ['Law firms and title companies', 'Real estate closings with original documents in motion', 'Offices with recurring bank, courthouse, or agency runs'],
    offeringPrefixes: ['courier-'],
    intakeJob: 'documents_notary',
  },
  {
    slug: 'mobile-notary',
    key: 'mobile_notary',
    title: 'Mobile Notary & Loan Signings',
    tag: 'Document Services',
    planFamily: 'legal',
    shortDescription: 'A commissioned Florida notary at your home, office, hospital, or closing table - travel fee quoted up front, always.',
    heroDescription:
      'Florida caps the notarial act fee at $10; the only variable is the travel, and we quote it in writing before the appointment is confirmed. Pinnacle covers homes, offices, hospitals and care facilities, evening and weekend appointments, and certified loan signings with printing and document return included.',
    highlights: [
      'Local mobile appointments with the travel fee from $45, disclosed before booking',
      'Hospital, care-facility, and after-hours coverage',
      'Certified loan signing agents from $150 including printing and return',
      'Statutory notarial act fees - never a marked-up "notary fee"',
    ],
    idealFor: ['Powers of attorney, affidavits, and estate documents', 'Title companies and lenders needing signing coverage', 'Families coordinating signings at hospitals or care facilities'],
    offeringPrefixes: ['notary-'],
    intakeJob: 'documents_notary',
  },
  {
    slug: 'remote-online-notary',
    key: 'mobile_notary',
    title: 'Remote Online Notarization (RON)',
    tag: 'Document Services',
    planFamily: 'legal',
    shortDescription: 'Florida-authorized online notarization from anywhere: identity verification, recorded session, document returned electronically.',
    heroDescription:
      'If the document qualifies, nobody has to drive anywhere. Pinnacle coordinates Florida-authorized Remote Online Notarization sessions: knowledge-based identity verification, a live recorded video session with a commissioned online notary, and the completed document returned electronically - for signers anywhere in the United States.',
    highlights: [
      'Single-document sessions from $45; multi-document and multi-signer from $69',
      'Signers can be anywhere; the notary is commissioned in Florida',
      'Recorded audio-video session and audit trail retained per Florida law',
      'Eligibility confirmed before scheduling - not every document qualifies for RON',
    ],
    idealFor: ['Out-of-state signers on Florida transactions', 'Firms that need same-day notarization without travel', 'Anyone whose document qualifies and whose time matters'],
    offeringPrefixes: ['ron-'],
    intakeJob: 'documents_notary',
  },
]

export function getServiceBySlug(slug: string | undefined): ServiceInfo | undefined {
  return services.find((s) => s.slug === slug)
}
