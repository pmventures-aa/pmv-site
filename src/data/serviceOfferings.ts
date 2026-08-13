export interface ServiceOffering {
  id: string
  serviceKey: string
  name: string
  description: string
  startingPrice?: number
  pricingLabel?: string
  badge?: string
  requirements?: string[]
  note?: string
}

// Pricing in this catalog is set against the 2026 South Florida market
// (Miami-Dade, Broward, Palm Beach) as a direct local vendor, not a national
// platform reseller. Benchmarks used:
//   - Exterior property inspections / photo verification: $75-125 retail,
//     $65-95 direct-vendor; occupancy checks $65-95.
//   - Interior condition photo packages: $125-225.
//   - Broker Price Opinions (licensed): exterior $150-200, interior $225-300.
//   - Florida non-attorney eviction document services: notice prep $35-75,
//     document packages $149-260, full coordination $269-599. Court filing
//     (~$185), summons ($10/tenant), process server ($40-80/tenant), and
//     sheriff fees are always pass-through and never marked up.
//   - Mobile notary travel fees: $25-75 typical; loan signings $75-200.
//     The Florida notarial act fee ($10 in person / $25 RON) is statutory
//     and separate.
//   - Move-out / turnover cleaning: $180-650+ by size; deep cleans from ~$250.
//   - US-based fractional admin/ops retainers: $1,300-3,900/mo for 20-60 hrs.
const o = (
  id:string,
  serviceKey:string,
  name:string,
  description:string,
  startingPrice?:number,
  extras:Partial<ServiceOffering> = {},
):ServiceOffering => ({ id, serviceKey, name, description, startingPrice, ...extras })

export const serviceOfferings: ServiceOffering[] = [
  // Business & Operations Consulting
  o('consult-discovery','consulting','Business Operations Discovery Session','A focused 90-minute working session: what is stuck, who is involved, what has been tried, and the three next moves worth making. You leave with a written action summary.',195,{pricingLabel:'$195 flat'}),
  o('consult-process-review','consulting','Workflow & Process Review','We map one core workflow end to end - intake, handoffs, tools, failure points - and deliver written findings with specific fixes ranked by effort and payoff.',495,{pricingLabel:'Starting at $495'}),
  o('consult-vendor-eval','consulting','Vendor Evaluation & Comparison','Independent side-by-side comparison of vendors or proposals: pricing structure, contract terms, implementation risk, and a clear recommendation. We do not take referral fees from vendors.',395,{pricingLabel:'Starting at $395'}),
  o('consult-project-plan','consulting','Implementation Project Plan','A working project plan with milestones, owners, dependencies, and risks - built so your team can actually run it, not a slide deck.',650,{pricingLabel:'Starting at $650'}),
  o('consult-project-coordination','consulting','Project Coordination Engagement','Pinnacle runs the project: vendors, stakeholders, deadlines, testing, issues, and the follow-through between meetings. Weekly written status included.',1250,{pricingLabel:'Starting at $1,250'}),
  o('consult-retainer','consulting','Ongoing Operations Advisory','A standing monthly engagement for operational projects, vendor coordination, and management support. Compare against $2,500-4,000/mo fractional-ops market rates.',1500,{pricingLabel:'From $1,500 / month',badge:'Monthly'}),

  // POS & Payment Technology Consulting
  o('pos-environment-review','merchant_services','POS & Payments Environment Review','A documented review of your current POS, gateway, processor, integrations, and fees, with the specific issues and options laid out in writing.',295,{pricingLabel:'$295 flat'}),
  o('pos-vendor-comparison','merchant_services','POS / Processor Vendor Comparison','Independent evaluation of the systems you are considering: true processing cost, contract terms, hardware, integrations, and migration risk.',495,{pricingLabel:'Starting at $495'}),
  o('pos-migration-readiness','merchant_services','Data Migration Readiness Review','Inventory of every data source, field, export, and dependency before you commit to a cutover date - so nothing is discovered mid-migration.',750,{pricingLabel:'Starting at $750'}),
  o('pos-implementation','merchant_services','POS / Payments Implementation Coordination','One accountable owner from vendor selection through data preparation, hardware, testing, staff training, cutover, and stabilization.',1500,{pricingLabel:'Starting at $1,500'}),
  o('pos-multilocation','merchant_services','Multi-Location Technology Transition','Location-by-location rollout planning: configuration, testing, training, and cutover sequencing, tracked in one place.',2500,{pricingLabel:'Starting at $2,500'}),
  o('pos-training','merchant_services','Team Training & Go-Live Readiness','Role-based training, an implementation checklist walkthrough, and launch-day preparation for the whole team.',495,{pricingLabel:'Starting at $495'}),

  // Administrative & Operational Support
  o('admin-document-cleanup','admin_support','Document & Records Organization','A defined set of business records organized into a clean, findable working system: files, naming, follow-up items, and a simple maintenance routine.',125,{pricingLabel:'Starting at $125'}),
  o('admin-workflow-cleanup','admin_support','Administrative Workflow Cleanup','One recurring administrative process simplified and documented into a repeatable checklist your team can run without you.',295,{pricingLabel:'Starting at $295'}),
  o('admin-followup','admin_support','Follow-Up & Scheduling Sprint','A short burst of calls, scheduling, vendor and customer follow-up, and loose-end cleanup - the backlog handled in days, not months.',195,{pricingLabel:'Starting at $195'}),
  o('admin-project-block','admin_support','Project Administration Block','Reserved administrative capacity for a defined project or backlog. $75/hr effective rate; compare against $65-75/hr for experienced US-based support.',375,{pricingLabel:'From $375 / 5-hour block'}),
  o('admin-recurring','admin_support','Recurring Administrative Support','Standing monthly administrative capacity with a named coordinator. Most clients move to an Ops-on-Call plan once the cadence is steady.',750,{pricingLabel:'From $750 / month',badge:'Monthly'}),

  // Funding & Capital Support
  o('funding-readiness','funding','Funding Readiness Review','A candid review of the business profile, requested use of funds, documentation gaps, and which financing paths are realistic before you apply anywhere.',195,{pricingLabel:'$195 flat',note:'Pinnacle does not guarantee approval or funding.'}),
  o('funding-document-package','funding','Lender Documentation Package','The documents lenders actually request - statements, financials, licenses, ownership records - organized into one lender-ready package.',395,{pricingLabel:'Starting at $395',note:'Third-party lender requirements vary.'}),
  o('funding-application-support','funding','Funding Application Support','Guided support completing a defined third-party funding application and responding to underwriting document requests.',495,{pricingLabel:'Starting at $495',note:'Pinnacle does not make credit decisions or guarantee approval.'}),
  o('funding-postapproval','funding','Post-Approval Coordination','Tracking conditions, requested documents, closing requirements, and communication after a third-party approval so the funding actually closes.',295,{pricingLabel:'Starting at $295'}),

  // Property management & owner support
  o('property-tenant-placement','property_management','Tenant Placement (Lease-Only)','Marketing, showings, screening coordination, lease preparation, and move-in condition documentation for owners who self-manage after placement. Handled through our licensed broker partner.',undefined,{pricingLabel:'Typically 75-100% of first month\u2019s rent',badge:'Licensed partner',note:'Leasing activity is performed within the applicable Florida licensed scope under a written agreement.'}),
  o('property-full-management','property_management','Full Property Management','Rent collection, maintenance coordination, periodic inspections, owner reporting, tenant communication, and renewals. South Florida full-service management typically runs 8-12% of collected rent; our programs are quoted at the lower end of that band.',undefined,{pricingLabel:'8-10% of collected rent · via licensed partner',badge:'Licensed partner',note:'Provided only within the applicable Florida licensed scope and a final written management agreement.'}),
  o('property-portfolio','property_management','Portfolio & Investor Support','Enhanced reporting, priority maintenance coordination, annual planning, and a dedicated relationship owner for multi-property investors and small funds.',undefined,{pricingLabel:'Custom portfolio proposal',badge:'Portfolio'}),
  o('property-vendor-coordinate','property_management','Property Vendor Coordination','One defined maintenance or vendor need handled end to end: outreach, scheduling, access, and confirmation the work actually happened.',95,{pricingLabel:'Starting at $95'}),
  o('property-access','property_management','Property Access Coordination','Authorized access managed for one visit: lockbox instructions, vendor arrival, on-site contact, and completion confirmation.',75,{pricingLabel:'Starting at $75'}),
  o('property-maintenance-followup','property_management','Maintenance Follow-Up Visit','A field visit with photos to confirm whether a previously assigned repair or maintenance item is actually complete.',115,{pricingLabel:'Starting at $115'}),
  o('property-turnover-coordinate','property_management','Turnover Coordination','A defined move-out / make-ready scope run across cleaners, handymen, and vendors, with a punch list tracked to completion for the owner.',295,{pricingLabel:'Starting at $295'}),
  o('property-project-coordinate','property_management','Property Project Coordination','A larger property project - multiple vendors, dates, access requirements, documentation - coordinated with one accountable point of contact.',650,{pricingLabel:'Starting at $650'}),

  // Property cleaning, turnover & preservation
  o('property-standard-clean','property_management','Standard Property Cleaning','Routine cleaning for a residence, rental, or office, scoped by size and condition. Typical South Florida range $150-250 for most units.',undefined,{pricingLabel:'Typically $150-250',badge:'Instant estimate'}),
  o('property-deep-clean','property_management','Deep Cleaning','Top-to-bottom detail work: baseboards, appliances, grout, fixtures, and buildup that a routine clean does not touch. Typical range $275-500.',undefined,{pricingLabel:'Typically $275-500',badge:'Instant estimate'}),
  o('property-moveout-clean','property_management','Move-Out / Turnover Cleaning','A landlord-inspection-grade clean between occupants: inside appliances and cabinets, floors, baths, and closets, with optional photo documentation for the deposit file. Typical range $325-650 by size.',undefined,{pricingLabel:'Typically $325-650',badge:'Instant estimate'}),
  o('property-reo-clean','property_management','REO / Vacant Property Cleaning','Interior cleaning and ready-to-market preparation for authorized vacant or bank-owned properties, with before-and-after photos.',undefined,{pricingLabel:'Typically $425-1,000',badge:'REO'}),
  o('property-trashout','property_management','Trash-Out & Debris Removal','Removal of abandoned contents or property debris: scope, hauling, dump fees, and completion photos coordinated as one job.',undefined,{pricingLabel:'Typically $450-2,500 by load',badge:'REO'}),
  o('property-preservation','property_management','Vacant Property Preservation Visit','Defined securing, condition, exterior-maintenance, hazard, or posting tasks at a vacant property, documented with timestamped photos.',undefined,{pricingLabel:'Custom quote',badge:'REO'}),

  // Eviction support (non-legal) - document preparation, execution, field work
  o('eviction-notice-prep','property_management','Eviction Notice Preparation (Client-Directed)','A Florida 3-day, 7-day, or termination notice prepared from your instructions and lease details, formatted and ready to serve. Compare against $35-75 typical Florida document-prep rates.',75,{pricingLabel:'Starting at $75',badge:'Non-legal',note:'Document preparation only. Pinnacle is not a law firm and does not select remedies or give legal advice.'}),
  o('eviction-notice-posting','property_management','Notice Delivery / Posting Visit','A field visit to deliver or post your notice where lawful, with timestamped photos, an occupancy observation, and a written delivery record for your file.',95,{pricingLabel:'Starting at $95',badge:'Field visit'}),
  o('eviction-file-packet','property_management','Eviction Filing Packet (Client-Directed)','Your complaint, summons, and supporting documents assembled from client-provided information into a filing-ready packet with county-specific copies and instructions. Florida market rate for comparable packages: $149-260.',225,{pricingLabel:'Starting at $225',badge:'Non-legal',note:'Court filing fees (~$185), summons ($10/tenant), and process-server fees ($40-80/tenant) are paid to the county and never marked up. Attorney review may be required for contested cases.'}),
  o('eviction-filing-run','property_management','Courthouse Filing Run','Physical filing of your eviction paperwork at the county courthouse, with stamped copies, receipts, and case-number confirmation returned the same day where possible.',165,{pricingLabel:'Starting at $165 + court fees'}),
  o('eviction-case-tracking','property_management','Eviction Milestone Tracking','We watch the docket and keep you current: answer deadlines, motions, judgment, writ issuance, and the scheduling that follows, in plain language.',145,{pricingLabel:'Starting at $145 per case'}),
  o('eviction-writ-coordination','property_management','Writ / Lockout Day Coordination','Coordination of the lawful possession handoff: sheriff scheduling, locksmith or rekey, on-site documentation, and same-day securing of the property.',295,{pricingLabel:'Starting at $295',note:'Available only after lawful authorization and in coordination with the appropriate officials.'}),
  o('eviction-post-possession','property_management','Post-Possession Turnover Package','After lawful possession: documented condition inspection, trash-out, deep clean, repairs coordination, and ready-to-list preparation, run as one scoped project.',undefined,{pricingLabel:'Typically $900-3,500 by condition',badge:'Package'}),
  o('property-eviction-admin','property_management','Eviction Administrative Support','Owner records organized, permitted client-directed paperwork prepared, service and filing coordinated, and process milestones tracked - one place for the whole file.',undefined,{pricingLabel:'Scope-based',note:'Not legal advice. Final scope is subject to Florida law and may require a licensed attorney.'}),
  o('property-lockout-turnover','property_management','Writ / Lockout & Post-Possession Turnover Coordination','Authorized participants, access, locksmith and vendor scheduling, property documentation, cleaning, debris, and securing coordinated after lawful possession.',undefined,{pricingLabel:'Custom quote',note:'Available only after lawful authorization and in coordination with the appropriate officials or legal professionals.'}),

  // Property inspections & condition reports
  o('occupancy','property_inspections','Occupancy Verification','A field visit documenting observable occupancy indicators - utilities, vehicles, mail, condition - without entering the property. Photo evidence and a written observation included.',75,{pricingLabel:'Starting at $75'}),
  o('occupancy-notice','property_inspections','Occupancy Verification + Authorized Notice Posting','An occupancy visit plus posting of a client-supplied, authorized notice where lawful, documented with timestamped photos.',115,{pricingLabel:'Starting at $115'}),
  o('insurance-photo','property_inspections','Insurance / Underwriting Photo Documentation','A defined property photo set for homeowner-insurance or underwriting documentation, shot to the carrier checklist you provide.',115,{pricingLabel:'Starting at $115'}),
  o('disaster-doc','property_inspections','Disaster / Loss Documentation','Subject property and surrounding observable condition documented after a storm or loss event: minimum 8 photos plus written notes suitable for an insurance file.',135,{pricingLabel:'Starting at $135'}),
  o('interior-lockbox','property_inspections','Interior / Exterior Photo Package - Vacant Access','Room-by-room interior plus exterior documentation of an authorized vacant property with lockbox access. Market range for interior photo packages: $125-225.',145,{pricingLabel:'Starting at $145'}),
  o('interior-appointment','property_inspections','Interior / Exterior Photo Package - Appointment','Full interior and exterior documentation requiring scheduled access with a tenant, agent, or on-site contact.',165,{pricingLabel:'Starting at $165'}),
  o('pmi-removal','property_inspections','PMI / Condition Photo Package','Interior and exterior documentation prepared to a client-specified PMI or condition-photo scope.',175,{pricingLabel:'Starting at $175'}),
  o('qc-progress','property_inspections','Rehab / Construction Progress Inspection','Interior and exterior visual progress documentation for a repair, rehab, or draw-inspection scope, delivered with dated photos and notes.',155,{pricingLabel:'Starting at $155'}),
  o('investor-lockbox','property_inspections','Investor Property Evaluation - Vacant','Visual property-condition documentation for an out-of-area investor with authorized vacant or lockbox access: the walkthrough you would do yourself if you were here.',145,{pricingLabel:'Starting at $145'}),
  o('investor-appointment','property_inspections','Investor Property Evaluation - Appointment','Investor condition walkthrough requiring scheduled access, with room-by-room photos and plain-language observations.',165,{pricingLabel:'Starting at $165'}),
  o('rentready-lockbox','property_inspections','Rent-Ready Evaluation - Vacant','Room-by-room rent-ready documentation with authorized vacant access: what is ready, what is not, and what it will take.',155,{pricingLabel:'Starting at $155'}),
  o('rentready-appointment','property_inspections','Rent-Ready Evaluation - Appointment','Rent-ready condition documentation requiring scheduled access.',175,{pricingLabel:'Starting at $175'}),
  o('moveout','property_inspections','Move-Out Condition Inspection','Post-move-out condition documentation for an authorized vacant property, suitable for a security-deposit file or turnover punch list.',175,{pricingLabel:'Starting at $175'}),
  o('construction','property_inspections','New Construction Progress Photography','Interior, exterior, and permit-board progress documentation to a defined client scope, on a one-time or recurring cadence.',195,{pricingLabel:'Starting at $195'}),
  o('boarded','property_inspections','Boarded Property Documentation - Tools Required','Interior and exterior documentation where authorized access requires tools or additional field preparation.',245,{pricingLabel:'Starting at $245'}),
  o('video-lockbox','property_inspections','Property Video Walkthrough - Vacant Access','A guided video walkthrough of an authorized vacant property with lockbox access, narrated to your checklist.',165,{pricingLabel:'Starting at $165'}),
  o('video-appointment','property_inspections','Property Video Walkthrough - Appointment','A guided video walkthrough requiring scheduled access.',195,{pricingLabel:'Starting at $195'}),
  o('vacation-rental','property_inspections','Rental / Vacation Property Verification','Appointment-based verification and photo documentation of a rental or vacation property for owners and managers who are not local.',165,{pricingLabel:'Starting at $165'}),

  // Field photos, verification & BPO support
  o('field-exterior-light','property_inspections','Exterior Photo Verification - Light','Subject-property exterior documentation with a minimum of 3 requested photos, GPS-tagged and timestamped. 24-48 hour standard turnaround.',65,{pricingLabel:'Starting at $65',badge:'Photo verification'}),
  o('field-driveby','property_inspections','Exterior Drive-By Verification','Exterior subject verification with a minimum of 4 requested photos. Direct-vendor pricing; national platforms typically charge $95-125 for the same visit.',69,{pricingLabel:'Starting at $69',badge:'Photo verification'}),
  o('field-street-scenes','property_inspections','Exterior + Street Scene Verification','Subject property plus two street-scene context views, minimum 4 photos.',75,{pricingLabel:'Starting at $75'}),
  o('field-address','property_inspections','Exterior + Address / Street Sign Verification','Subject exterior plus address and street-sign documentation, minimum 4 photos.',75,{pricingLabel:'Starting at $75'}),
  o('field-both-sides','property_inspections','Exterior Both-Sides Photo Set','Exterior documentation including both sides of the subject, minimum 5 photos.',79,{pricingLabel:'Starting at $79'}),
  o('field-main6','property_inspections','Exterior Photo Set - 6','Standard six-photo exterior property documentation set.',79,{pricingLabel:'Starting at $79'}),
  o('field-main7','property_inspections','Exterior Photo Set - 7','Expanded seven-photo exterior property documentation set.',85,{pricingLabel:'Starting at $85'}),
  o('field-rear','property_inspections','Exterior + Rear Documentation','Exterior photo set including the rear view when safely and lawfully accessible.',89,{pricingLabel:'Starting at $89'}),
  o('field-across','property_inspections','Subject + Across-Street Documentation','Subject property and contextual across-street documentation, minimum 8 photos.',89,{pricingLabel:'Starting at $89'}),
  o('field-detached','property_inspections','Subject + Detached Structure Documentation','Subject property photo set including an accessible detached structure.',95,{pricingLabel:'Starting at $95'}),
  o('field-context10','property_inspections','Expanded Property & Street Documentation','Subject, across-street context, and four street scenes, minimum 10 photos.',99,{pricingLabel:'Starting at $99'}),
  o('listing-verification','property_inspections','Exterior Listing Verification','Exterior documentation verifying observable property and listing characteristics for agents, lenders, and marketplaces.',89,{pricingLabel:'Starting at $89'}),
  o('bpo-photos-exterior','property_inspections','BPO Photo Set - Exterior / Drive-By','The exterior photo set a broker needs to complete a drive-by BPO: subject from multiple angles, street scenes, and address verification, delivered in the format your BPO platform requires.',79,{pricingLabel:'Starting at $79',badge:'BPO support'}),
  o('bpo-photos-interior','property_inspections','BPO Photo Set - Interior / Full','Complete interior and exterior BPO photo documentation with authorized access: every room, systems, and condition items, labeled to your platform checklist.',149,{pricingLabel:'Starting at $149',badge:'BPO support'}),
  o('bpo-exterior','property_inspections','Exterior Broker Price Opinion (BPO)','A drive-by BPO prepared by a licensed real-estate professional in Pinnacle\u2019s vetted network: market and comparable analysis plus a broker opinion of value.',165,{pricingLabel:'Starting at $165',badge:'Licensed professional',requirements:['Property address','Purpose / use case','Client-defined report requirements'],note:'Broker Price Opinion; not an appraisal. Assignment availability depends on applicable licensing and use-case requirements.'}),
  o('bpo-interior','property_inspections','Interior / Exterior Broker Price Opinion (BPO)','A full interior BPO prepared by a licensed professional with authorized access: property observations, comparable analysis, and a broker opinion of value.',265,{pricingLabel:'Starting at $265',badge:'Licensed professional',requirements:['Authorized interior access','Property address','Purpose / use case'],note:'Broker Price Opinion; not an appraisal. Complex, commercial, rush, or expanded-comparable scopes are quoted separately.'}),
  o('field-volume','property_inspections','Volume Field Program (10+ orders / month)','Committed monthly volume for servicers, asset managers, and inspection companies: dedicated routing, SLA turnaround, consolidated invoicing, and volume rates below the per-order menu.',undefined,{pricingLabel:'Custom volume rates',badge:'Monthly',note:'Typical volume discounts run 10-20% off the per-order menu at 10+ orders per month.'}),
  o('commercial-underwriting','property_inspections','Commercial Property Photo Verification','Defined commercial-property exterior documentation for underwriting or asset-verification use.',95,{pricingLabel:'Starting at $95'}),
  o('commercial-site','property_inspections','Commercial Site Audit - Freestanding','Exterior and site-condition audit of a freestanding commercial property to your checklist.',95,{pricingLabel:'Starting at $95'}),
  o('gas-station','property_inspections','Convenience Store / Gas Station Exterior Audit','Exterior, signage, and forecourt documentation to a defined client checklist.',105,{pricingLabel:'Starting at $105'}),
  o('landscape','property_inspections','Shopping Center Landscape Inspection','Common-area and landscape quality documentation for a shopping center.',115,{pricingLabel:'Starting at $115'}),
  o('restroom','property_inspections','Commercial Restroom Site Inspection','Visual commercial restroom condition and quality documentation to a client checklist.',115,{pricingLabel:'Starting at $115'}),
  o('night-signage-free','property_inspections','Night Signage Audit - Freestanding Property','Nighttime signage and illumination documentation for a freestanding commercial property.',105,{pricingLabel:'Starting at $105'}),
  o('night-signage-center','property_inspections','Night Signage Audit - Shopping Center','Nighttime signage and illumination documentation for a shopping-center assignment.',105,{pricingLabel:'Starting at $105'}),
  o('community-amenities','property_inspections','Community Amenities & Common Area Review','Visual review of amenities, common areas, landscaping, and general observable condition for HOAs and community managers.',135,{pricingLabel:'Starting at $135'}),
  o('dealership','property_inspections','Customer Impression Audit - Auto Dealership','Customer-facing exterior and interior impression audit to a defined client checklist.',85,{pricingLabel:'Starting at $85'}),
  o('hotel','property_inspections','Customer Impression Audit - Hotel Lobby / Restroom','Customer-facing hotel lobby and restroom impression audit to a defined checklist.',85,{pricingLabel:'Starting at $85'}),
  o('display-endcap','property_inspections','Product Display / Endcap Audit','Retail merchandising verification with required display photos and checklist responses.',85,{pricingLabel:'Starting at $85'}),
  o('auto-l1','property_inspections','Automobile Evaluation Photography - Level 1','Appointment-based automobile identity and condition photography to a defined shot list.',135,{pricingLabel:'Starting at $135'}),
  o('auto-l2','property_inspections','Automobile Evaluation Photography - Level 2','Expanded appointment-based automobile condition and feature photography.',175,{pricingLabel:'Starting at $175'}),
  o('motorcycle','property_inspections','Motorcycle Evaluation Photography','Appointment-based motorcycle identity and condition photography.',155,{pricingLabel:'Starting at $155'}),
  o('rv','property_inspections','RV / Camper Evaluation Photography','Appointment-based RV or camper visual documentation to a defined client scope.',205,{pricingLabel:'Starting at $205'}),
  o('marine-small','property_inspections','Marine Verification - Up to 30 ft','Appointment-based vessel identity and condition photography for boats up to 30 feet.',205,{pricingLabel:'Starting at $205'}),
  o('marine-large','property_inspections','Marine Verification - Over 30 ft','Appointment-based vessel identity and condition photography for larger vessels.',255,{pricingLabel:'Starting at $255'}),
  o('aircraft-small','property_inspections','Aircraft Verification - Up to 30 ft','Appointment-based aircraft identity and condition photography to a defined client scope.',305,{pricingLabel:'Starting at $305'}),
  o('aircraft-large','property_inspections','Aircraft Verification - Over 30 ft','Appointment-based larger-aircraft identity and condition photography to a defined client scope.',405,{pricingLabel:'Starting at $405'}),

  // Document courier
  o('courier-local','document_courier','Local Document Delivery','Point-to-point local business or document delivery with photo and signature confirmation.',55,{pricingLabel:'Starting at $55'}),
  o('courier-priority','document_courier','Priority Document Delivery','Priority pickup and direct delivery for time-sensitive documents, no batching with other runs.',79,{pricingLabel:'Starting at $79'}),
  o('courier-tricounty','document_courier','Same-Day Tri-County Delivery','Same-day document delivery within eligible Broward, Palm Beach, or Miami-Dade service zones.',99,{pricingLabel:'Starting at $99'}),
  o('courier-roundtrip','document_courier','Round-Trip Document Courier','Pickup, delivery or processing wait when applicable, and return of documents or confirmation materials.',129,{pricingLabel:'Starting at $129'}),
  o('courier-filing','document_courier','Agency / Courthouse Filing Run','Physical filing or delivery to a local agency or courthouse with stamped copies and receipts returned.',145,{pricingLabel:'Starting at $145',note:'Government filing fees, parking, tolls, copies, and third-party charges are pass-through and never marked up.'}),

  // Document preparation and administrative filing support
  o('document-form-prep','admin_support','Client-Directed Form & Document Preparation','A defined non-lawyer document prepared or formatted from your information and instructions, delivered ready to sign or file.',95,{pricingLabel:'Starting at $95',badge:'Document support',note:'Pinnacle does not provide legal advice or select legal rights or remedies for a client.'}),
  o('document-property-packet','admin_support','Property / Landlord Document Packet','Leases, ledgers, notices, photos, and correspondence organized into one clean working packet - the file you wish you had before the dispute.',195,{pricingLabel:'Starting at $195'}),
  o('document-filing-package','admin_support','Filing-Ready Administrative Package','Client-provided and permitted documents assembled with required copies, cover materials, and delivery instructions for a defined filing.',195,{pricingLabel:'Starting at $195',note:'Filing fees and third-party charges are additional. Attorney review may be required.'}),
  o('document-annual-report','admin_support','Florida Annual Report Filing Support','Your Sunbiz annual report prepared from client-provided details and filed on time, with confirmation returned for your records.',95,{pricingLabel:'Starting at $95 + state fee',note:'State fees are paid directly to the Florida Department of State and never marked up.'}),
  o('document-business-filing','admin_support','Business Filing Support (Client-Directed)','Client-directed state or county business filings - fictitious names, registrations, renewals - prepared, submitted, and confirmed.',145,{pricingLabel:'Starting at $145 + government fees',note:'Document preparation and filing support only; not legal advice on entity selection or structure.'}),

  // Mobile notary - service/travel pricing is separate from the Florida notarial act fee
  o('notary-local','mobile_notary','Mobile Notary Appointment - Local','A commissioned Florida notary comes to you within the core local zone. Travel fee covers the visit; the notarial act fee is set by Florida law.',45,{pricingLabel:'Travel/service fee from $45',note:'Florida caps the in-person notarial act fee at $10 per act; that fee is separate and never exceeds the statutory amount.'}),
  o('notary-extended','mobile_notary','Mobile Notary Appointment - Extended Area','A scheduled appointment outside the core local zone, quoted up front before the visit is confirmed.',70,{pricingLabel:'Travel/service fee from $70',note:'Notarial act fees are separate; tolls and parking may apply.'}),
  o('notary-afterhours','mobile_notary','Evening / Weekend Mobile Notary','A mobile appointment outside standard weekday hours, subject to availability.',85,{pricingLabel:'Travel/service fee from $85',note:'Notarial act fees are separate.'}),
  o('notary-hospital','mobile_notary','Hospital / Care Facility Mobile Notary','An appointment at a hospital, rehabilitation, assisted-living, or care setting, with the extra access and wait-time coordination those visits require.',95,{pricingLabel:'Travel/service fee from $95',note:'Signer willingness, awareness, identification, and notarial requirements must be satisfied; notarial act fees are separate.'}),
  o('notary-business','mobile_notary','Business / Office Notary Visit','A scheduled office visit for one or more eligible business documents and signers.',65,{pricingLabel:'Travel/service fee from $65',note:'Notarial act fees are separate and charged per applicable act.'}),
  o('notary-loan-signing','mobile_notary','Loan Signing Appointment','A certified signing agent handles the full loan package: printing, the signing appointment, notarizations, and same-day document return. Florida market range $75-200.',150,{pricingLabel:'Starting at $150',badge:'Signing agent',note:'Includes document printing and return shipping coordination; notarial act fees within the package are statutory.'}),
  o('ron-single','mobile_notary','Remote Online Notarization (RON) - Single Document','A live Florida-authorized RON session for one eligible document: identity verification, recorded video session, and the completed notarized document returned electronically.',45,{pricingLabel:'From $45 per session',badge:'RON',note:'Florida caps the RON notarial act fee at $25 per act; the session fee covers platform, identity verification, and coordination.'}),
  o('ron-multi','mobile_notary','Remote Online Notarization (RON) - Multi-Document / Multi-Signer','A RON session covering multiple documents or signers, coordinated so everyone signs in one sitting from wherever they are.',69,{pricingLabel:'From $69 per session',badge:'RON'}),
]

export const offeringsFor = (serviceKey:string) => serviceOfferings.filter((item)=>item.serviceKey===serviceKey)

export function lowestStartingPrice(serviceKey:string):number|undefined {
  const prices = offeringsFor(serviceKey).map((item)=>item.startingPrice).filter((value):value is number=>typeof value==='number')
  return prices.length ? Math.min(...prices) : undefined
}
