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
  o('consult-discovery','consulting','Business Operations Discovery Session','Focused working session to identify the problem, priorities, stakeholders, and practical next steps.',195,{pricingLabel:'$195 flat'}),
  o('consult-process-review','consulting','Workflow & Process Review','Review of one core business workflow with findings and practical improvement recommendations.',495,{pricingLabel:'Starting at $495'}),
  o('consult-vendor-eval','consulting','Vendor Evaluation & Comparison','Independent comparison of vendors, proposals, requirements, implementation risk, and decision points.',395,{pricingLabel:'Starting at $395'}),
  o('consult-project-plan','consulting','Implementation Project Plan','Structured project plan with milestones, owners, dependencies, risks, and follow-up cadence.',650,{pricingLabel:'Starting at $650'}),
  o('consult-project-coordination','consulting','Project Coordination Engagement','Hands-on coordination across vendors, stakeholders, deadlines, testing, issues, and follow-through.',1250,{pricingLabel:'Starting at $1,250'}),
  o('consult-retainer','consulting','Ongoing Operations Advisory','Recurring access to Pinnacle for operational projects, vendor coordination, and management support.',1500,{pricingLabel:'From $1,500 / month'}),

  // POS & Payment Technology Consulting
  o('pos-environment-review','merchant_services','POS & Payments Environment Review','Review of the current POS, gateway, processor, integrations, workflows, pain points, and business requirements.',295,{pricingLabel:'$295 flat'}),
  o('pos-vendor-comparison','merchant_services','POS / Processor Vendor Comparison','Independent side-by-side evaluation of proposed systems, pricing structure, features, integrations, and implementation considerations.',495,{pricingLabel:'Starting at $495'}),
  o('pos-migration-readiness','merchant_services','Data Migration Readiness Review','Inventory and organization of authorized data sources, fields, exports, dependencies, and migration risks before a transition.',750,{pricingLabel:'Starting at $750'}),
  o('pos-implementation','merchant_services','POS / Payments Implementation Coordination','Project coordination from vendor selection through data preparation, hardware/integration readiness, testing, training, cutover, and stabilization.',1500,{pricingLabel:'Starting at $1,500'}),
  o('pos-multilocation','merchant_services','Multi-Location Technology Transition','Coordinated rollout planning for multi-location operators including location tracking, configuration, testing, training, and cutover sequencing.',2500,{pricingLabel:'Starting at $2,500'}),
  o('pos-training','merchant_services','Team Training & Go-Live Readiness','Role-based readiness session, implementation checklist review, and launch-day preparation.',495,{pricingLabel:'Starting at $495'}),

  // Administrative & Operational Support
  o('admin-document-cleanup','admin_support','Document & Records Organization','Organize a defined set of business records, files, naming conventions, and follow-up items into a cleaner working system.',125,{pricingLabel:'Starting at $125'}),
  o('admin-workflow-cleanup','admin_support','Administrative Workflow Cleanup','Simplify a recurring administrative process and create a practical repeatable checklist or procedure.',295,{pricingLabel:'Starting at $295'}),
  o('admin-followup','admin_support','Follow-Up & Scheduling Sprint','Short-term support for calls, scheduling, vendor/customer follow-up, status tracking, and loose-end cleanup.',195,{pricingLabel:'Starting at $195'}),
  o('admin-project-block','admin_support','Project Administration Block','Reserved administrative support for a defined project or backlog.',375,{pricingLabel:'From $375 / 5-hour block'}),
  o('admin-recurring','admin_support','Recurring Administrative Support','Ongoing administrative capacity for owners or teams that need dependable help without adding full-time headcount.',750,{pricingLabel:'From $750 / month'}),

  // Funding & Capital Support
  o('funding-readiness','funding','Funding Readiness Review','Review of the business profile, requested use of funds, documentation readiness, and likely application gaps.',195,{pricingLabel:'$195 flat',note:'Pinnacle does not guarantee approval or funding.'}),
  o('funding-document-package','funding','Lender Documentation Package','Organization of commonly requested business documents into a lender-ready package.',395,{pricingLabel:'Starting at $395',note:'Third-party lender requirements vary.'}),
  o('funding-application-support','funding','Funding Application Support','Guided support organizing and completing a defined third-party funding application and responding to document requests.',495,{pricingLabel:'Starting at $495',note:'Pinnacle does not make credit decisions or guarantee approval.'}),
  o('funding-postapproval','funding','Post-Approval Coordination','Help track conditions, requested documents, closing requirements, and communication after a third-party approval.',295,{pricingLabel:'Starting at $295'}),

  // Property owner support / coordination
  o('property-vendor-coordinate','property_management','Property Vendor Coordination','Coordinate one defined maintenance/vendor need including outreach, scheduling, access details, and status follow-up.',95,{pricingLabel:'Starting at $95'}),
  o('property-access','property_management','Property Access Coordination','Coordinate authorized access, lockbox instructions, vendor arrival, and completion confirmation for one visit.',75,{pricingLabel:'Starting at $75'}),
  o('property-maintenance-followup','property_management','Maintenance Follow-Up Visit','Field follow-up to document whether a previously assigned repair or maintenance item appears completed.',99,{pricingLabel:'Starting at $99'}),
  o('property-turnover-coordinate','property_management','Turnover Coordination','Coordinate a defined move-out / make-ready scope across vendors and track completion items for the owner.',295,{pricingLabel:'Starting at $295'}),
  o('property-project-coordinate','property_management','Property Project Coordination','Coordinate a larger property project involving multiple vendors, dates, access requirements, documentation, and follow-up.',650,{pricingLabel:'Starting at $650'}),

  // Property verification, inspections and BPO
  o('field-exterior-light','property_inspections','Exterior Property Verification - Light','Subject-property exterior documentation with a minimum of 3 requested photos.',49,{pricingLabel:'Starting at $49',badge:'Photo verification'}),
  o('field-driveby','property_inspections','Exterior Drive-By Verification','Exterior subject verification with a minimum of 4 requested photos.',49,{pricingLabel:'Starting at $49',badge:'Photo verification'}),
  o('field-street-scenes','property_inspections','Exterior + Street Scene Verification','Subject property plus two street-scene views, minimum 4 photos.',55,{pricingLabel:'Starting at $55'}),
  o('field-address','property_inspections','Exterior + Address / Street Sign Verification','Subject exterior plus address and/or street-sign documentation, minimum 4 photos.',55,{pricingLabel:'Starting at $55'}),
  o('field-both-sides','property_inspections','Exterior Both-Sides Photoset','Exterior documentation including both sides of the subject, minimum 5 photos.',59,{pricingLabel:'Starting at $59'}),
  o('field-main6','property_inspections','Exterior Property Photoset - 6','Standard six-photo exterior property documentation set.',59,{pricingLabel:'Starting at $59'}),
  o('field-main7','property_inspections','Exterior Property Photoset - 7','Expanded seven-photo exterior property documentation set.',65,{pricingLabel:'Starting at $65'}),
  o('field-rear','property_inspections','Exterior + Rear Documentation','Exterior property photoset including rear view when safely and lawfully accessible.',69,{pricingLabel:'Starting at $69'}),
  o('field-across','property_inspections','Subject + Across-Street Documentation','Subject property and contextual across-street documentation, minimum 8 photos.',69,{pricingLabel:'Starting at $69'}),
  o('field-detached','property_inspections','Subject + Detached Structure Documentation','Subject property photoset including an accessible detached structure.',75,{pricingLabel:'Starting at $75'}),
  o('field-context10','property_inspections','Expanded Property & Street Documentation','Subject, across-street context, and four street scenes, minimum 10 photos.',79,{pricingLabel:'Starting at $79'}),
  o('occupancy','property_inspections','Occupancy Verification','Field visit to document observable occupancy indicators without entering the property.',59,{pricingLabel:'Starting at $59'}),
  o('occupancy-notice','property_inspections','Occupancy Verification + Authorized Notice Posting','Occupancy field visit plus posting of a client-supplied/authorized notice where lawful.',79,{pricingLabel:'Starting at $79'}),
  o('listing-verification','property_inspections','Exterior Listing Verification','Exterior documentation intended to verify observable property/listing characteristics.',69,{pricingLabel:'Starting at $69'}),
  o('insurance-photo','property_inspections','Homeowner Insurance Photo Documentation','Defined homeowner/property photo set for client or insurer documentation needs.',89,{pricingLabel:'Starting at $89'}),
  o('disaster-doc','property_inspections','Disaster / Loss Property Documentation','Subject property and surrounding observable condition documentation, minimum 8 photos.',99,{pricingLabel:'Starting at $99'}),
  o('interior-lockbox','property_inspections','Interior / Exterior Photoset - Vacant Lockbox','Interior and exterior property documentation for an authorized vacant property with lockbox access.',129,{pricingLabel:'Starting at $129'}),
  o('interior-appointment','property_inspections','Interior / Exterior Photoset - Appointment','Interior and exterior property documentation requiring scheduled access.',149,{pricingLabel:'Starting at $149'}),
  o('pmi-removal','property_inspections','PMI / Condition Photoset - Appointment','Interior/exterior documentation prepared to a client-specified PMI or condition-photo scope.',159,{pricingLabel:'Starting at $159'}),
  o('qc-progress','property_inspections','Quality Control / Progress Inspection','Interior/exterior visual progress documentation for a defined repair, rehab, or project scope.',139,{pricingLabel:'Starting at $139'}),
  o('investor-lockbox','property_inspections','Investor Property Evaluation - Vacant','Visual property-condition documentation for an investor with authorized vacant/lockbox access.',129,{pricingLabel:'Starting at $129'}),
  o('investor-appointment','property_inspections','Investor Property Evaluation - Appointment','Visual property-condition documentation for an investor requiring scheduled access.',149,{pricingLabel:'Starting at $149'}),
  o('rentready-lockbox','property_inspections','Rent-Ready Property Evaluation - Vacant','Room-by-room observable condition and rent-ready documentation with authorized vacant access.',139,{pricingLabel:'Starting at $139'}),
  o('rentready-appointment','property_inspections','Rent-Ready Property Evaluation - Appointment','Rent-ready visual condition documentation requiring scheduled access.',159,{pricingLabel:'Starting at $159'}),
  o('moveout','property_inspections','Move-Out Ready Inspection','Post-move-out condition documentation for an authorized vacant property.',159,{pricingLabel:'Starting at $159'}),
  o('construction','property_inspections','New Construction Progress Photography','Interior/exterior/project-permit progress documentation to a defined client scope.',179,{pricingLabel:'Starting at $179'}),
  o('boarded','property_inspections','Boarded Property Documentation - Tools Required','Interior/exterior documentation where authorized access requires tools or additional field preparation.',225,{pricingLabel:'Starting at $225'}),
  o('video-lockbox','property_inspections','Real Estate Video Evaluation - Lockbox','Guided property video documentation with authorized vacant/lockbox access.',149,{pricingLabel:'Starting at $149'}),
  o('video-appointment','property_inspections','Real Estate Video Evaluation - Appointment','Guided property video documentation requiring scheduled access.',179,{pricingLabel:'Starting at $179'}),
  o('bpo-exterior','property_inspections','Exterior Broker Price Opinion (BPO)','Exterior/drive-by BPO prepared by a licensed real-estate professional in Pinnacle’s vetted network, including market/comparable analysis and broker opinion of value.',149,{pricingLabel:'Starting at $149',badge:'Licensed professional',requirements:['Property address','Purpose/use case','Client-defined report requirements'],note:'Broker Price Opinion; not an appraisal. Assignment availability depends on applicable licensing and use-case requirements.'}),
  o('bpo-interior','property_inspections','Interior / Exterior Broker Price Opinion (BPO)','Interior/exterior BPO prepared by a licensed real-estate professional in Pinnacle’s vetted network with authorized access, property observations, comparable analysis, and broker opinion of value.',225,{pricingLabel:'Starting at $225',badge:'Licensed professional',requirements:['Authorized interior access','Property address','Purpose/use case'],note:'Broker Price Opinion; not an appraisal. Complex, commercial, rush, or expanded-comparable scopes may be quoted separately.'}),
  o('commercial-underwriting','property_inspections','Commercial Property Photo Verification','Defined commercial-property exterior documentation for underwriting or asset-verification use.',79,{pricingLabel:'Starting at $79'}),
  o('commercial-site','property_inspections','Commercial Property Site Audit - Freestanding','Exterior/site-condition audit to a defined client checklist.',79,{pricingLabel:'Starting at $79'}),
  o('gas-station','property_inspections','Convenience Store / Gas Station Exterior Audit','Exterior, signage, and forecourt documentation to a defined client checklist.',89,{pricingLabel:'Starting at $89'}),
  o('landscape','property_inspections','Shopping Center Landscape Inspection','Common-area and landscape quality documentation for a shopping center.',99,{pricingLabel:'Starting at $99'}),
  o('restroom','property_inspections','Commercial Restroom Site Inspection','Visual commercial restroom condition/quality documentation to a client checklist.',99,{pricingLabel:'Starting at $99'}),
  o('night-signage-free','property_inspections','Night Signage Audit - Freestanding Property','Nighttime signage/illumination documentation for a freestanding commercial property.',89,{pricingLabel:'Starting at $89'}),
  o('night-signage-center','property_inspections','Night Signage Audit - Shopping Center','Nighttime signage/illumination documentation for a shopping-center assignment.',89,{pricingLabel:'Starting at $89'}),
  o('community-amenities','property_inspections','Community Amenities & Common Area Review','Visual review of selected amenities, common areas, landscaping, and general observable condition.',129,{pricingLabel:'Starting at $129'}),
  o('dealership','property_inspections','Customer Impression Audit - Auto Dealership','Customer-facing exterior/interior impression audit to a defined client checklist.',69,{pricingLabel:'Starting at $69'}),
  o('hotel','property_inspections','Customer Impression Audit - Hotel Lobby / Restroom','Customer-facing hotel lobby and restroom impression audit to a defined checklist.',69,{pricingLabel:'Starting at $69'}),
  o('display-endcap','property_inspections','Product Display / Endcap Audit','Retail merchandising verification with required display photos and checklist responses.',69,{pricingLabel:'Starting at $69'}),
  o('vacation-rental','property_inspections','Rental / Vacation Property Verification','Appointment-based property verification and requested photo documentation.',149,{pricingLabel:'Starting at $149'}),
  o('auto-l1','property_inspections','Automobile Evaluation Photography - Level 1','Appointment-based automobile identity/condition photography to a defined client shot list.',129,{pricingLabel:'Starting at $129'}),
  o('auto-l2','property_inspections','Automobile Evaluation Photography - Level 2','Expanded appointment-based automobile condition/feature photography.',169,{pricingLabel:'Starting at $169'}),
  o('motorcycle','property_inspections','Motorcycle Evaluation Photography','Appointment-based motorcycle identity and condition photography.',149,{pricingLabel:'Starting at $149'}),
  o('rv','property_inspections','RV / Camper Evaluation Photography','Appointment-based RV/camper visual documentation to a defined client scope.',199,{pricingLabel:'Starting at $199'}),
  o('marine-small','property_inspections','Marine Verification - Up to 30 ft','Appointment-based vessel identity/condition photography for boats up to 30 feet.',199,{pricingLabel:'Starting at $199'}),
  o('marine-large','property_inspections','Marine Verification - Over 30 ft','Appointment-based vessel identity/condition photography for larger vessels.',249,{pricingLabel:'Starting at $249'}),
  o('aircraft-small','property_inspections','Aircraft Verification - Up to 30 ft','Appointment-based aircraft identity/condition photography to a defined client scope.',299,{pricingLabel:'Starting at $299'}),
  o('aircraft-large','property_inspections','Aircraft Verification - Over 30 ft','Appointment-based larger-aircraft identity/condition photography to a defined client scope.',399,{pricingLabel:'Starting at $399'}),

  // Document courier
  o('courier-local','document_courier','Local Document Delivery','Point-to-point local business/document delivery with completion confirmation.',49,{pricingLabel:'Starting at $49'}),
  o('courier-priority','document_courier','Priority Document Delivery','Priority pickup and direct delivery for time-sensitive documents.',69,{pricingLabel:'Starting at $69'}),
  o('courier-tricounty','document_courier','Same-Day Tri-County Delivery','Same-day document delivery within eligible Broward, Palm Beach, or Miami-Dade service zones.',89,{pricingLabel:'Starting at $89'}),
  o('courier-roundtrip','document_courier','Round-Trip Document Courier','Pickup, delivery/processing wait when applicable, and return of documents or confirmation materials.',119,{pricingLabel:'Starting at $119'}),
  o('courier-filing','document_courier','Agency / Courthouse Filing Run','Physical filing or delivery to an eligible local agency/courthouse with receipt/confirmation when available.',129,{pricingLabel:'Starting at $129',note:'Government filing fees, parking, tolls, copies, and third-party charges are additional.'}),

  // Mobile notary - service/travel pricing is separate from the Florida notarial act fee
  o('notary-local','mobile_notary','Mobile Notary Appointment - Local','Scheduled mobile appointment at an eligible local location.',45,{pricingLabel:'Travel/service fee from $45',note:'Florida notarial act fee is separate and may not exceed the amount allowed by Florida law.'}),
  o('notary-extended','mobile_notary','Mobile Notary Appointment - Extended Area','Scheduled appointment outside the core local zone.',65,{pricingLabel:'Travel/service fee from $65',note:'Notarial act fees are separate; tolls/parking may apply.'}),
  o('notary-afterhours','mobile_notary','Evening / Weekend Mobile Notary','Mobile appointment outside standard weekday hours, subject to availability.',75,{pricingLabel:'Travel/service fee from $75',note:'Notarial act fees are separate.'}),
  o('notary-hospital','mobile_notary','Hospital / Care Facility Mobile Notary','Appointment at an eligible hospital, rehabilitation, assisted-living, or care setting with added access/wait-time coordination.',85,{pricingLabel:'Travel/service fee from $85',note:'Signer willingness, awareness, identification, and notarial requirements must be satisfied; notarial act fees are separate.'}),
  o('notary-business','mobile_notary','Business / Office Notary Visit','Scheduled office visit for one or more eligible business documents/signers.',65,{pricingLabel:'Travel/service fee from $65',note:'Notarial act fees are separate and charged per applicable act.'}),
]

export const offeringsFor = (serviceKey:string) => serviceOfferings.filter((item)=>item.serviceKey===serviceKey)

export function lowestStartingPrice(serviceKey:string):number|undefined {
  const prices = offeringsFor(serviceKey).map((item)=>item.startingPrice).filter((value):value is number=>typeof value==='number')
  return prices.length ? Math.min(...prices) : undefined
}
