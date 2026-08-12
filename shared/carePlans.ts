export type PlanFamilyKey = 'property' | 'ops' | 'legal'

export interface PlanTier {
  key: string
  name: string
  priceCents: number
  cadence: 'monthly'
  tagline: string
  includes: string[]
  bestFor: string
  featured?: boolean
}

export interface PlanService {
  key: string
  label: string
  detail: string
  priceHint?: string
  category?: string
}

export interface PlanFamilyDef {
  key: PlanFamilyKey
  eyebrow: string
  headline: string
  intro: string
  benchmark: string
  tiers: PlanTier[]
  services: PlanService[]
  intakeKind: 'property' | 'business' | 'legal'
  ctaLabel: string
}

const PROPERTY_SERVICES: PlanService[] = [
  { key:'clean_standard', category:'Cleaning', label:'Standard rental clean', detail:'Routine turnover between short-term stays or standard tenant transitions.', priceHint:'$150-250' },
  { key:'clean_deep', category:'Cleaning', label:'Deep / detail clean', detail:'Baseboards, appliances, grout, hard-surface detail. Post-neglect condition.', priceHint:'$275-500' },
  { key:'clean_move_out', category:'Cleaning', label:'Move-out clean with punch list', detail:'Full move-out plus punch-list documentation for security deposit dispute.', priceHint:'$325-650' },
  { key:'clean_rent_ready', category:'Cleaning', label:'Rent-ready turnover', detail:'Deep clean, touch-up paint coordination, minor repair triage, ready-to-list state.', priceHint:'$450-900' },
  { key:'clean_reo', category:'Cleaning', label:'REO / bank-owned clean', detail:'Vacant + neglected asset preparation for listing, inspection, or occupancy.', priceHint:'$425-1,000' },
  { key:'clean_post_eviction', category:'Cleaning', label:'Post-eviction / heavy-condition clean', detail:'Bio-aware cleanup, debris removal, unit reset after adversarial move-out.', priceHint:'$600-1,800' },
  { key:'clean_vacancy_maint', category:'Cleaning', label:'Vacancy maintenance clean', detail:'Recurring light clean for vacant properties on market or in transition.', priceHint:'From $95/visit' },
  { key:'junk_partial', category:'Junk & Debris', label:'Junk removal - partial load', detail:'Up to ~1/4 truck. Single-room or garage pickup.', priceHint:'$150-325' },
  { key:'junk_full', category:'Junk & Debris', label:'Junk removal - full truck', detail:'Whole-unit or heavy-load haul, includes dump fee coordination.', priceHint:'$450-950' },
  { key:'junk_post_eviction', category:'Junk & Debris', label:'Post-eviction cleanout', detail:'Coordinated haul + documented condition for post-writ property recovery.', priceHint:'$700-2,500' },
  { key:'winterize_full', category:'Seasonal', label:'Full winterization', detail:'Water shutoff, line blowout, HVAC prep, freeze-protection tagging.', priceHint:'$185-350' },
  { key:'dewinterize', category:'Seasonal', label:'De-winterization / re-activation', detail:'Reactivate utilities, verify no freeze damage, ready for occupancy.', priceHint:'$150-300' },
  { key:'storm_prep', category:'Seasonal', label:'Hurricane / storm prep', detail:'Shutters, patio secure-down, exterior clear, photo documentation.', priceHint:'$225-600' },
  { key:'storm_assess', category:'Seasonal', label:'Post-storm damage assessment', detail:'Interior + exterior condition report with photos and insurance-ready notes.', priceHint:'$150-350' },
  { key:'insp_occupancy', category:'Inspections & Reports', label:'Occupancy check (drive-by / knock)', detail:'Verify occupied vs vacant, exterior condition, photo evidence.', priceHint:'$65-115' },
  { key:'insp_interior', category:'Inspections & Reports', label:'Interior condition + photo package', detail:'Room-by-room photos + observed condition notes with timestamps.', priceHint:'$125-225' },
  { key:'insp_movein_out', category:'Inspections & Reports', label:'Move-in / move-out condition report', detail:'Comprehensive documented report suitable for lease dispute or turnover.', priceHint:'$185-325' },
  { key:'insp_insurance', category:'Inspections & Reports', label:'Insurance / underwriting inspection package', detail:'4-point, wind mitigation coordination, or exterior underwriting photos.', priceHint:'$150-275' },
  { key:'insp_progress', category:'Inspections & Reports', label:'Rehab / construction progress report', detail:'Weekly or milestone photos + status notes for out-of-state owners or lenders.', priceHint:'$95-175/visit' },
  { key:'insp_recurring', category:'Inspections & Reports', label:'30/60/90-day rental inspection', detail:'Recurring interior check for lease compliance, condition, and early issue detection.', priceHint:'From $85/visit' },
  { key:'insp_vacant', category:'Inspections & Reports', label:'Vacant property check', detail:'Weekly, bi-weekly, or monthly check on vacant / seasonal / investor-hold properties.', priceHint:'From $65/visit' },
  { key:'insp_damage', category:'Inspections & Reports', label:'Damage assessment report', detail:'Focused report after suspected damage, break-in, or tenant-reported issue.', priceHint:'$185-425' },
  { key:'bpo_support', category:'Broker / Association', label:'BPO support & broker coordination', detail:'BPO photo sets from $79; licensed BPOs via our partnering broker.', priceHint:'$79-265' },
  { key:'cam_liaison', category:'Broker / Association', label:'CAM / association liaison', detail:'Community-association coordination through our credentialed CAM partner.', priceHint:'By hour' },
]

const OPS_SERVICES: PlanService[] = [
  { key:'ops_admin', category:'Ongoing capacity', label:'Administrative support', detail:'Email triage, scheduling, calls, follow-up. Owner-time back.' },
  { key:'ops_bookkeeping', category:'Ongoing capacity', label:'Bookkeeping coordination', detail:'AR/AP setup, receipt capture, month-end assist. Not accounting itself.' },
  { key:'ops_vendor_mgmt', category:'Ongoing capacity', label:'Vendor management', detail:'Sourcing, negotiation, contract review coordination, follow-up.' },
  { key:'ops_client_followup', category:'Ongoing capacity', label:'Client follow-up & CRM hygiene', detail:'Keep the pipeline moving. Owner does not have to chase old threads.' },
  { key:'ops_data_entry', category:'Ongoing capacity', label:'Data cleanup & migration prep', detail:'Records normalization, list hygiene, migration-ready exports.' },
  { key:'ops_meeting_coord', category:'Ongoing capacity', label:'Meeting coordination + minutes', detail:'Schedule, prepare, take notes, distribute action items.' },
  { key:'ops_document_mgmt', category:'Ongoing capacity', label:'Document management', detail:'Central records, retention rules, controlled sharing.' },
  { key:'ops_reports', category:'Ongoing capacity', label:'Recurring reports & dashboards', detail:'Weekly / monthly cadence, presented same format every time.' },
  { key:'consult_pos', category:'Projects & Transitions', label:'POS or payments transition', detail:'Provider comparison, cutover plan, vendor coordination, verification.' },
  { key:'consult_systems', category:'Projects & Transitions', label:'Systems migration (CRM / ERP / software)', detail:'Source to destination migration, mapping, validation, rollback plan.' },
  { key:'consult_process', category:'Projects & Transitions', label:'Process documentation', detail:'SOPs written from how the business actually operates today.' },
  { key:'consult_audit', category:'Projects & Transitions', label:'Operational audit', detail:'Where the work is stuck, who owns what, where money is bleeding.' },
  { key:'consult_hiring', category:'Projects & Transitions', label:'Hiring support', detail:'JD writing, screening, scheduling, reference coordination.' },
  { key:'consult_compliance', category:'Projects & Transitions', label:'Compliance readiness', detail:'Audit-prep organization, policy documentation, records collection.' },
  { key:'consult_growth', category:'Projects & Transitions', label:'Growth / scale planning', detail:'Operational bottleneck analysis for growth-stage businesses.' },
  { key:'consult_finance_setup', category:'Projects & Transitions', label:'Financial systems setup', detail:'Chart of accounts coordination, AR/AP workflow, invoicing hygiene.' },
]

const LEGAL_SERVICES: PlanService[] = [
  { key:'legal_notary', label:'Mobile notary appointment', detail:'In-person notarization at your office, home, care facility, or courthouse.', priceHint:'$85-165/appt' },
  { key:'legal_ron', label:'Remote Online Notary (RON) session', detail:'Florida-authorized remote notarization for eligible documents.', priceHint:'$85-150/session' },
  { key:'legal_courier', label:'Document courier / delivery', detail:'Point-to-point pickup and delivery, tracked, receipt captured.', priceHint:'$45-95/run' },
  { key:'legal_courthouse', label:'Courthouse filing run', detail:'Filing, receipt, stamped-copy return, docket confirmation.', priceHint:'$95-175/run' },
  { key:'legal_process', label:'Process service coordination', detail:'Coordinated through licensed process servers when required.', priceHint:'Coord fee + server' },
  { key:'legal_signing', label:'Signing coordination / witness support', detail:'Real estate, POA, loan-doc signings with staged prep and witnesses.', priceHint:'$125-250/appt' },
  { key:'legal_post_eviction', label:'Post-eviction turnover coordination', detail:'Post-writ property turnover: locksmith, inspection, cleanout, ready-to-list.', priceHint:'Custom' },
  { key:'legal_prep', label:'Client-directed document prep', detail:'Format, organize, assemble packets. Not legal advice; attorney direction only.', priceHint:'By hour' },
  { key:'legal_attorney_handoff', label:'Attorney handoff coordination', detail:'When a matter needs licensed representation - coordinate with your attorney or refer to one.', priceHint:'No fee' },
]

const PROPERTY_TIERS: PlanTier[] = [
  { key:'property_watch', name:'Property Watch', priceCents:8900, cadence:'monthly', tagline:'Eyes on the property, on cadence.', bestFor:'Single-property landlords, remote owners, seasonal / second homes.',
    includes:[
      '1 exterior + occupancy check per quarter',
      'Saved property profile, access, and contacts',
      '1 photo report per quarter included',
      'Priority scheduling on any ad-hoc request',
      '10% off all services',
      'Storm alert coordination in South Florida',
    ] },
  { key:'property_care', name:'Property Care', priceCents:24900, cadence:'monthly', featured:true, tagline:'Active oversight with real service credits.', bestFor:'Rentals with tenants, small investor portfolios, out-of-state owners.',
    includes:[
      '1 interior + occupancy inspection per month',
      '1 standard cleaning credit per quarter (rollover 60 days)',
      '1 BPO coordination per year via broker partner',
      'Dedicated coordinator with named contact',
      '15% off all services',
      'Priority scheduling and emergency response option',
    ] },
  { key:'property_managed', name:'Property Managed', priceCents:54900, cadence:'monthly', tagline:'Nearly hands-off for the owner.', bestFor:'Higher-value properties, multi-unit small portfolios, active investors.',
    includes:[
      'Bi-weekly touchpoint + monthly interior inspection',
      '4 service credits per month (cleaning, inspection, notary - any mix)',
      'Quarterly BPO via broker partner',
      'Quarterly CAM / association liaison hours (via CAM partner)',
      '20% off all services',
      'First response guarantee for emergency events',
      'Consolidated monthly owner report',
    ] },
]

const OPS_TIERS: PlanTier[] = [
  { key:'ops_ready', name:'Ops Ready', priceCents:19900, cadence:'monthly', tagline:'A structured hour or two, on tap.', bestFor:'Solo owners who need something reliable but do not need a full VA.',
    includes:[
      '2 hours of administrative or coordination work per month',
      'Systems / POS triage line',
      'Monthly 30-minute office-hours call',
      'Priority scheduling on any project',
      '10% off consulting or project engagements',
    ] },
  { key:'ops_active', name:'Ops Active', priceCents:54900, cadence:'monthly', featured:true, tagline:'A true operating partner for the business.', bestFor:'Owner-operators, small teams, businesses in a growth or transition phase.',
    includes:[
      '8 hours of administrative or coordination work per month',
      'Named coordinator; shared task board',
      'Quarterly systems audit + written recommendations',
      'Priority project scheduling',
      '15% off consulting or project engagements',
      'One included discovery meeting per new project',
    ] },
  { key:'ops_embedded', name:'Ops Embedded', priceCents:149900, cadence:'monthly', tagline:'Effectively a fractional COO layer.', bestFor:'Multi-employee businesses, active projects, transitions in flight.',
    includes:[
      '30 hours of administrative, coordination, and project work per month',
      'Named coordinator + escalation contact',
      'Weekly stand-in / operating rhythm meeting',
      'Quarterly business review + roadmap update',
      '20% off consulting or project engagements',
      'Priority queue on every request',
    ] },
]

const LEGAL_TIERS: PlanTier[] = [
  { key:'legal_solo', name:'Solo', priceCents:9900, cadence:'monthly', tagline:'For solo attorneys, notaries, and small firms.', bestFor:'Solo practitioners, small firms, closing attorneys.',
    includes:[
      '1 mobile notary appointment per month',
      '2 document courier runs per month',
      'Priority scheduling on any additional appointment',
      '25% off all additional appointments and runs',
      'RON coordination for eligible Florida notarizations',
    ] },
  { key:'legal_firm', name:'Firm', priceCents:29900, cadence:'monthly', featured:true, tagline:'For firms with regular process, filing, and signing needs.', bestFor:'Practicing firms, real estate offices, lending, closing services.',
    includes:[
      '4 mobile notary appointments per month',
      '8 document courier runs per month',
      '2 courthouse filing runs per month',
      'Named coordinator with same-day scheduling',
      '25% off additional appointments',
      'Post-eviction turnover coordination when applicable',
    ] },
  { key:'legal_enterprise', name:'Enterprise', priceCents:0, cadence:'monthly', tagline:'High-volume, custom-scoped programs.', bestFor:'Firms with 10+ monthly appointments, statewide programs, agency work.',
    includes:[
      'Custom monthly volume commitment',
      'Named coordinator + escalation contact',
      'SLA on scheduling and completion',
      'Consolidated monthly invoicing',
      'Post-service documentation package',
    ] },
]

export const CARE_PLANS: Record<PlanFamilyKey, PlanFamilyDef> = {
  property: {
    key:'property',
    eyebrow:'Property Care Plans',
    headline:'Steady oversight for the property, without hiring a full property manager.',
    intro:'Pinnacle Property Care is not a licensed property-management engagement. It is coordination + service delivery on a monthly cadence, with credits, discounts, and a saved profile for your property. When licensed work is needed we coordinate with our credentialed CAM partner or our partnering broker.',
    benchmark:'Compares to $99-249/mo coordination-only programs local to South Florida, without the licensed-PM percentage of rent.',
    tiers:PROPERTY_TIERS,
    services:PROPERTY_SERVICES,
    intakeKind:'property',
    ctaLabel:'Start Property Care intake',
  },
  ops: {
    key:'ops',
    eyebrow:'Business Ops Plans',
    headline:'Recurring operational capacity without the hire.',
    intro:'Ops-on-Call is a monthly retainer for administrative capacity and project support. Use hours as they come up - triage, follow-up, systems work, coordination. Unused hours are not credit toward the next month; the plan is priced for reliable availability, not banking time.',
    benchmark:'Priced against local VA / fractional-ops rates ($30-70/hr equivalent) but adds project-management and systems-transition capability without renegotiation.',
    tiers:OPS_TIERS,
    services:OPS_SERVICES,
    intakeKind:'business',
    ctaLabel:'Start Ops intake',
  },
  legal: {
    key:'legal',
    eyebrow:'Legal & Notary Pass',
    headline:'Notary, signing, and courthouse-runner capacity, on retainer.',
    intro:'A monthly pass for firms and solo practitioners that need reliable local mobile notary, courier, and courthouse coverage. Included appointments plus a discount on anything past the plan minimum.',
    benchmark:'Priced below local per-appointment retail (typical mobile notary $85-165, courier $45-95, courthouse run $95-175) once you use even part of the included volume.',
    tiers:LEGAL_TIERS,
    services:LEGAL_SERVICES,
    intakeKind:'legal',
    ctaLabel:'Start Legal Pass intake',
  },
}

export const CARE_PLAN_FAMILIES: PlanFamilyKey[] = ['property','ops','legal']

export function findTier(family: PlanFamilyKey, tierKey: string): PlanTier | null {
  return CARE_PLANS[family]?.tiers.find(t => t.key === tierKey) ?? null
}

export function findService(family: PlanFamilyKey, serviceKey: string): PlanService | null {
  return CARE_PLANS[family]?.services.find(s => s.key === serviceKey) ?? null
}

export function formatPrice(cents: number): string {
  if (cents <= 0) return 'Custom quote'
  const dollars = cents / 100
  return `$${dollars.toLocaleString('en-US')}/mo`
}
