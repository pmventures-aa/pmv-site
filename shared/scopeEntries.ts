import { JOB_WORLD, SERVICE_WORLD, type OperatingWorld } from './workspace'

export type ScopeQuestionWhen = {
  key?: string
  in?: string[]
  includes?: string
  location?: 'onsite' | 'remote'
}

export type ScopeQuestion = {
  key: string
  label: string
  hint?: string
  type: 'select' | 'multiselect' | 'text' | 'number'
  options?: string[]
  when?: ScopeQuestionWhen
}

export type ScopeEntry = {
  id: string
  job: string
  serviceKey: string | null
  world: OperatingWorld
  remoteDefault: boolean
  eyebrow: string
  title: string
  body: string
  pickerLabel: string
  questions: ScopeQuestion[]
}

const q = (
  key: string,
  label: string,
  type: ScopeQuestion['type'],
  extras: Partial<ScopeQuestion> = {},
): ScopeQuestion => ({ key, label, type, ...extras })

const CLEAN_QUESTIONS: ScopeQuestion[] = [
  q('clean_type', 'What kind of clean?', 'select', { options: ['Standard turnover', 'Deep / detail clean', 'Move-out with punch list', 'Rent-ready', 'REO / vacant', 'Post-eviction / heavy condition', 'Vacancy maintenance (recurring)'] }),
  q('property_type', 'Property type', 'select', { options: ['Single-family', 'Condo', 'Townhome', 'Multi-unit 2-4', 'Small multi-family 5-20', 'Vacation / STR', 'Commercial'] }),
  q('square_feet', 'Approx square footage', 'number', { hint: 'Best guess is fine' }),
  q('occupancy', 'Current occupancy', 'select', { options: ['Occupied', 'Vacant / on market', 'Vacant / off market', 'Transitioning', 'Owner-occupied'] }),
  q('access', 'Access instructions', 'text', { hint: 'Lockbox, key hidden, tenant present, etc.', when: { location: 'onsite' } }),
]

const INSPECTION_QUESTIONS: ScopeQuestion[] = [
  q('inspection_type', 'What kind of inspection?', 'select', { options: ['Occupancy check (drive-by / knock)', 'Interior + photo package', 'Move-in / move-out condition report', 'Insurance / underwriting package', 'Rehab / construction progress', '30/60/90-day rental', 'Vacant property check', 'Damage assessment', 'Field photos / BPO'] }),
  q('property_type', 'Property type', 'select', { options: ['Single-family', 'Condo', 'Townhome', 'Multi-unit', 'Commercial', 'Land / lot'] }),
  q('photo_set', 'What photo set do you need?', 'select', { options: ['Exterior / drive-by (3-6 photos)', 'Exterior + street scenes', 'BPO photo set - exterior', 'BPO photo set - interior / full', 'Licensed exterior BPO', 'Licensed interior BPO', 'Commercial / signage audit'], when: { key: 'inspection_type', in: ['Interior + photo package', 'Insurance / underwriting package', 'Field photos / BPO'] } }),
  q('platform', 'BPO or inspection platform, if any', 'text', { hint: 'Clear Capital, ServiceLink, interior checklist, etc.', when: { key: 'inspection_type', in: ['Interior + photo package', 'Insurance / underwriting package', 'Field photos / BPO'] } }),
  q('recurring', 'One-time or recurring?', 'select', { options: ['One-time', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly'] }),
  q('access', 'Access instructions', 'text', { when: { location: 'onsite' } }),
]

const PHOTO_QUESTIONS: ScopeQuestion[] = [
  q('photo_set', 'What photo set do you need?', 'select', { options: ['Exterior / drive-by (3-6 photos)', 'Exterior + street scenes', 'BPO photo set - exterior', 'BPO photo set - interior / full', 'Licensed exterior BPO', 'Licensed interior BPO', 'Commercial / signage audit', 'Volume program (10+ / month)'] }),
  q('platform', 'BPO or inspection platform, if any', 'text', { hint: 'Clear Capital, ServiceLink, interior checklist, etc.' }),
  q('turnaround', 'Turnaround needed', 'select', { options: ['Standard 24-48 hours', 'Same day', 'Next business day', 'Flexible'] }),
  q('access', 'Access for interior work', 'text', { hint: 'Lockbox, occupied appointment, vacant, or exterior only' }),
]

const EVICTION_QUESTIONS: ScopeQuestion[] = [
  q('stage', 'Current stage', 'select', { options: ['Pre-notice', 'Notice served', 'Filed / awaiting hearing', 'Judgment entered', 'Writ / lockout scheduled', 'Post-possession'] }),
  q('county', 'Florida county', 'select', { options: ['Broward', 'Palm Beach', 'Miami-Dade', 'Other Florida county'] }),
  q('attorney', 'Is an attorney already involved?', 'select', { options: ['Yes', 'No', 'Not yet, looking to coordinate one'] }),
  q('property_condition', 'Expected property condition', 'select', { options: ['Normal turnover', 'Heavy trash / damage expected', 'Bio-aware condition', 'Unknown'] }),
  q('needs_after_lockout', 'What is needed after lawful possession?', 'multiselect', { options: ['Locksmith / rekey', 'Debris haul', 'Deep clean', 'Inspection + photos', 'Board-up / secure', 'Ready-to-list'] }),
]

const DOCUMENT_QUESTIONS: ScopeQuestion[] = [
  q('document_kind', 'What kind of document work?', 'multiselect', { options: ['Mobile notary', 'Remote Online Notary (RON)', 'Document prep / packet', 'Courier / delivery', 'Courthouse filing', 'Signing coordination', 'Attorney handoff'] }),
  q('notary_kind', 'In person or remote?', 'select', { options: ['Mobile notary at a location', 'Remote Online Notarization (RON)', 'Loan signing package', 'Not sure yet'], when: { key: 'document_kind', includes: 'notary' } }),
  q('document_type', 'What is being signed or prepared?', 'text', { hint: 'POA, affidavit, closing package, lease, etc.', when: { key: 'document_kind', includes: 'notary' } }),
  q('signer_count', 'How many signers?', 'select', { options: ['1', '2', '3', '4+'], when: { key: 'document_kind', includes: 'notary' } }),
  q('pickup', 'Pickup location', 'text', { when: { key: 'document_kind', includes: 'Courier' } }),
  q('dropoff', 'Drop-off or filing location', 'text', { when: { key: 'document_kind', includes: 'Courier' } }),
  q('has_document', 'Do you already have the document?', 'select', { options: ['Yes, ready to go', 'Yes, needs review', 'No, need help preparing it'] }),
  q('meeting_location', 'Where does it need to happen?', 'text', { hint: 'Address, office, care facility, courthouse, remote', when: { location: 'onsite' } }),
]

const NOTARY_QUESTIONS: ScopeQuestion[] = [
  q('notary_kind', 'In person or remote?', 'select', { options: ['Mobile notary at a location', 'Remote Online Notarization (RON)', 'Loan signing package', 'Not sure yet'] }),
  q('document_type', 'What is being signed?', 'text', { hint: 'POA, affidavit, closing package, lease, etc.' }),
  q('signer_count', 'How many signers?', 'select', { options: ['1', '2', '3', '4+'] }),
  q('special_location', 'Any special location needs?', 'select', { options: ['Home or office', 'Hospital / care facility', 'After hours / weekend', 'RON from anywhere'] }),
]

const OPS_QUESTIONS: ScopeQuestion[] = [
  q('industry', 'Industry / vertical', 'select', { options: ['Real estate', 'Legal / professional', 'Retail', 'Restaurant / hospitality', 'Health / wellness', 'Home services / contractor', 'Property services', 'Non-profit', 'Other'] }),
  q('team_size', 'Team size', 'select', { options: ['Solo / owner-only', '2-5', '6-15', '16-50', '50+'] }),
  q('need_type', 'What kind of help?', 'multiselect', { options: ['Administrative capacity', 'Bookkeeping coordination', 'Vendor management', 'Client follow-up', 'Project management', 'Process documentation', 'Operational audit', 'Systems / software'] }),
  q('urgency', 'Is there a launch date or deadline?', 'text'),
]

const DATA_QUESTIONS: ScopeQuestion[] = [
  q('source_system', 'What system are you moving data out of?', 'text', { hint: 'POS, CRM, membership, accounting, or spreadsheets' }),
  q('destination_system', 'Where does it need to land?', 'text', { hint: 'Optional if you are still choosing' }),
  q('record_types', 'What records matter most?', 'multiselect', { options: ['Customers / members', 'Transactions / invoices', 'Inventory', 'Appointments', 'Employees', 'Documents / files', 'Other operational data'] }),
  q('exports_ready', 'Do you already have exports?', 'select', { options: ['Yes, files are ready', 'Partial / messy exports', 'No, we need help pulling them', 'Not sure what can be exported'] }),
  q('must_not_break', 'What cannot break during the move?', 'text'),
]

const POS_QUESTIONS: ScopeQuestion[] = [
  q('current_system', 'Current POS / payment provider', 'text'),
  q('target_system', 'Target system, if known', 'text', { hint: 'Optional - we can help you compare' }),
  q('business_type', 'Business type', 'select', { options: ['Retail', 'Restaurant / hospitality', 'Services', 'E-commerce', 'Multi-location', 'Other'] }),
  q('volume', 'Approx monthly card volume', 'select', { options: ['Under $10k', '$10k-$50k', '$50k-$250k', '$250k-$1M', 'Over $1M', 'Not sure'] }),
  q('timeline', 'Timeline pressure', 'select', { options: ['ASAP - system down or provider issues', 'Within 30 days', '1-3 months', 'No fixed date'] }),
]

const TRANSITION_QUESTIONS: ScopeQuestion[] = [
  q('change_type', 'What is changing?', 'multiselect', { options: ['A system or vendor', 'A location or operating model', 'Ownership / leadership', 'A process the whole team uses', 'Several of the above'] }),
  q('stakeholders', 'Who else is involved?', 'text', { hint: 'Vendors, staff, advisors, landlords, etc.' }),
  q('deadline', 'Is there a hard date?', 'text'),
  q('stuck_on', 'What is stuck right now?', 'text'),
]

const FUNDING_QUESTIONS: ScopeQuestion[] = [
  q('use_of_funds', 'What would the funds be used for?', 'text'),
  q('amount_range', 'Amount you are exploring', 'select', { options: ['Under $25k', '$25k-$75k', '$75k-$250k', '$250k-$1M', 'Over $1M', 'Not sure yet'] }),
  q('stage', 'Where are you in the process?', 'select', { options: ['Just exploring', 'Comparing options', 'Ready to apply', 'Already in underwriting'] }),
  q('docs_ready', 'How organized is the paperwork?', 'select', { options: ['Ready to send', 'Partial', 'Need help assembling it'] }),
]

const OTHER_QUESTIONS: ScopeQuestion[] = [
  q('outcome', 'What outcome are you after?', 'text', { hint: 'Describe the handled state so we can scope backwards from it' }),
]

const JOB_QUESTIONS: Record<string, ScopeQuestion[]> = {
  cleaning_turnover: CLEAN_QUESTIONS,
  property_inspection: INSPECTION_QUESTIONS,
  documents_notary: DOCUMENT_QUESTIONS,
  eviction_reo: EVICTION_QUESTIONS,
  business_operations: OPS_QUESTIONS,
  pos_payments: POS_QUESTIONS,
  other: OTHER_QUESTIONS,
}

function entry(
  id: string,
  job: string,
  serviceKey: string | null,
  copy: { eyebrow: string; title: string; body: string; pickerLabel: string },
  questions: ScopeQuestion[],
  remoteDefault = false,
): ScopeEntry {
  const world = (JOB_WORLD[job] || (serviceKey && SERVICE_WORLD[serviceKey]) || 'general') as OperatingWorld
  return { id, job, serviceKey, world, remoteDefault, questions, ...copy }
}

export const GUIDE_ENTRIES: Record<string, ScopeEntry> = {
  'moving-data-between-systems': entry(
    'moving-data-between-systems',
    'pos_payments',
    'merchant_services',
    {
      eyebrow: 'Data & systems',
      title: 'Tell us about the data that needs to move.',
      body: 'Source system, destination, the records that matter, and what cannot break. We will map the handoffs instead of sending you back to a generic service list.',
      pickerLabel: 'Moving data between systems',
    },
    DATA_QUESTIONS,
    true,
  ),
  'switching-pos-payment-providers': entry(
    'switching-pos-payment-providers',
    'pos_payments',
    'merchant_services',
    {
      eyebrow: 'POS & payments',
      title: 'Tell us about the POS or payment change.',
      body: 'Current provider, the system you are considering, and the date that matters. Pinnacle coordinates the transition so the cutover has an owner.',
      pickerLabel: 'Switching a POS or payment provider',
    },
    POS_QUESTIONS,
    true,
  ),
  'managing-business-transition': entry(
    'managing-business-transition',
    'business_operations',
    'consulting',
    {
      eyebrow: 'Operational transition',
      title: 'Tell us what is changing in the business.',
      body: 'The outcome, the people involved, and the pieces that currently have no owner. We will turn that into a working plan.',
      pickerLabel: 'Managing a business transition',
    },
    TRANSITION_QUESTIONS,
    true,
  ),
  'ongoing-administrative-support': entry(
    'ongoing-administrative-support',
    'business_operations',
    'admin_support',
    {
      eyebrow: 'Ongoing operations',
      title: 'Tell us what should come off your plate.',
      body: 'The recurring work, the tools you already use, and how often it needs to happen. This is how we size a monthly capacity engagement.',
      pickerLabel: 'Add capacity to the business',
    },
    OPS_QUESTIONS,
    true,
  ),
  'property-cleaning-turnover': entry(
    'property-cleaning-turnover',
    'cleaning_turnover',
    'property_management',
    {
      eyebrow: 'Property cleaning & turnover',
      title: 'Tell us about the property that needs to be made ready.',
      body: 'Condition, size, access, and the date it has to be done. That is enough to price a clean, a turnover, or an REO make-ready.',
      pickerLabel: 'Clean or make a property rent-ready',
    },
    CLEAN_QUESTIONS,
  ),
  'local-support-south-florida': entry(
    'local-support-south-florida',
    'property_inspection',
    'property_inspections',
    {
      eyebrow: 'South Florida field support',
      title: 'Tell us what needs a person on the ground.',
      body: 'Address, access, and the condition or task to verify. We will document what we find and send it back the same day when we can.',
      pickerLabel: 'Get eyes on a property',
    },
    INSPECTION_QUESTIONS,
  ),
  'eviction-turnover-support': entry(
    'eviction-turnover-support',
    'eviction_reo',
    'property_management',
    {
      eyebrow: 'Eviction support (non-legal)',
      title: 'Tell us where the eviction or recovery stands.',
      body: 'Stage, county, and whether an attorney is already involved. Pinnacle handles document prep, filing runs, and the field work after lawful possession. We do not give legal advice.',
      pickerLabel: 'Handle an eviction or REO property',
    },
    EVICTION_QUESTIONS,
  ),
}

export const SERVICE_ENTRIES: Record<string, ScopeEntry> = {
  consulting: entry('consulting', 'business_operations', 'consulting', {
    eyebrow: 'Operations consulting',
    title: 'Tell us the operational work that needs an owner.',
    body: 'The project, the people involved, and the outcome you need. Discovery, a workflow review, or ongoing advisory all start here.',
    pickerLabel: 'Add capacity to the business',
  }, OPS_QUESTIONS, true),
  'merchant-services': entry('merchant-services', 'pos_payments', 'merchant_services', {
    eyebrow: 'POS & payments',
    title: 'Tell us about the payment or POS work.',
    body: 'Current setup, the change you are considering, and the date that matters.',
    pickerLabel: 'Fix or switch a system or POS',
  }, POS_QUESTIONS, true),
  'administrative-support': entry('administrative-support', 'business_operations', 'admin_support', {
    eyebrow: 'Administrative support',
    title: 'Tell us the recurring work that needs follow-through.',
    body: 'Records, scheduling, vendor follow-up, or a defined sprint. We will size it as a project or a monthly retainer.',
    pickerLabel: 'Add capacity to the business',
  }, OPS_QUESTIONS, true),
  funding: entry('funding', 'business_operations', 'funding', {
    eyebrow: 'Funding conversation',
    title: 'Tell us about the financing work in front of you.',
    body: 'Pinnacle organizes materials and status. Independent lenders decide approval and terms.',
    pickerLabel: 'Funding and capital support',
  }, FUNDING_QUESTIONS, true),
  'property-management': entry('property-management', 'cleaning_turnover', 'property_management', {
    eyebrow: 'Property management',
    title: 'Tell us about the property that needs an owner on it.',
    body: 'One visit, a turnover, or ongoing management through our licensed partner. Start with the property and the outcome.',
    pickerLabel: 'Property management & owner support',
  }, [
    q('need', 'What do you need on this property?', 'select', { options: ['Vendor / maintenance coordination', 'Tenant placement', 'Full management', 'Turnover / make-ready', 'Ongoing owner support', 'Not sure yet'] }),
    q('unit_count', 'How many units?', 'select', { options: ['1', '2-4', '5-20', '21-50', '50+'] }),
    q('occupancy', 'Current occupancy', 'select', { options: ['Occupied', 'Vacant', 'Mixed', 'Owner-occupied'] }),
    q('access', 'Access instructions', 'text'),
  ]),
  'property-cleaning': GUIDE_ENTRIES['property-cleaning-turnover'],
  'eviction-support': GUIDE_ENTRIES['eviction-turnover-support'],
  'property-inspections': entry('property-inspections', 'property_inspection', 'property_inspections', {
    eyebrow: 'Property inspections',
    title: 'Tell us what needs to be documented at the property.',
    body: 'Occupancy, condition, rent-ready, rehab progress, or insurance photos. GPS-tagged, timestamped, written in plain language.',
    pickerLabel: 'Get eyes on a property',
  }, INSPECTION_QUESTIONS),
  'field-photos-bpo': entry('field-photos-bpo', 'property_inspection', 'property_inspections', {
    eyebrow: 'Field photos & BPO',
    title: 'Tell us the photo or BPO set you need.',
    body: 'Exterior verification, a BPO photo package, or a licensed Broker Price Opinion. Direct local coverage, not a national platform reseller.',
    pickerLabel: 'Field photos, verification, or a BPO',
  }, PHOTO_QUESTIONS),
  'document-preparation': entry('document-preparation', 'documents_notary', 'admin_support', {
    eyebrow: 'Document preparation',
    title: 'Tell us about the document that needs to be prepared or filed.',
    body: 'Client-directed preparation, a landlord packet, or a Florida filing. We will tell you plainly if the matter needs an attorney.',
    pickerLabel: 'Prepare, sign, or move a document',
  }, DOCUMENT_QUESTIONS, true),
  'document-courier': entry('document-courier', 'documents_notary', 'document_courier', {
    eyebrow: 'Document courier',
    title: 'Tell us what needs to be delivered or filed.',
    body: 'Pickup, destination, and the deadline. Photo and signature confirmation on every handoff.',
    pickerLabel: 'Prepare, sign, or move a document',
  }, [
    q('run_type', 'What kind of run?', 'select', { options: ['Local delivery', 'Priority / direct', 'Same-day tri-county', 'Round-trip', 'Courthouse / agency filing'] }),
    q('pickup', 'Pickup location', 'text'),
    q('dropoff', 'Drop-off or filing location', 'text'),
    q('deadline', 'Deadline', 'text'),
  ]),
  'mobile-notary': entry('mobile-notary', 'documents_notary', 'mobile_notary', {
    eyebrow: 'Mobile notary',
    title: 'Tell us about the signing appointment.',
    body: 'Document type, signer count, and where it needs to happen. Travel is quoted before the visit is confirmed. The Florida notarial act fee is statutory.',
    pickerLabel: 'Prepare, sign, or move a document',
  }, NOTARY_QUESTIONS),
  'remote-online-notary': entry('remote-online-notary', 'documents_notary', 'mobile_notary', {
    eyebrow: 'Remote Online Notarization',
    title: 'Tell us about the RON session.',
    body: 'If the document qualifies, nobody has to drive. We confirm eligibility, run identity verification, and return the completed document electronically.',
    pickerLabel: 'Prepare, sign, or move a document',
  }, [
    q('document_type', 'What is being notarized?', 'text'),
    q('signer_count', 'How many signers?', 'select', { options: ['1', '2', '3', '4+'] }),
    q('signer_location', 'Where will the signer be?', 'text', { hint: 'City and state, or "out of country"' }),
    q('deadline', 'When does it need to be done?', 'text'),
  ], true),
}

const JOB_ENTRIES: Record<string, ScopeEntry> = {
  cleaning_turnover: entry('cleaning_turnover', 'cleaning_turnover', 'property_management', {
    eyebrow: 'Property request', title: 'Tell us about the property work.', body: 'Cleaning, turnovers, and make-ready work start with condition, size, and access.', pickerLabel: 'Clean or make a property rent-ready',
  }, CLEAN_QUESTIONS),
  property_inspection: entry('property_inspection', 'property_inspection', 'property_inspections', {
    eyebrow: 'Property request', title: 'Tell us what needs to be seen on site.', body: 'Inspection, photos, occupancy, or a documented field visit.', pickerLabel: 'Get eyes on a property',
  }, INSPECTION_QUESTIONS),
  eviction_reo: entry('eviction_reo', 'eviction_reo', 'property_management', {
    eyebrow: 'Eviction support (non-legal)', title: 'Tell us where the eviction or recovery stands.', body: 'Document prep, filing runs, and field work after lawful possession. Not legal advice.', pickerLabel: 'Handle an eviction or REO property',
  }, EVICTION_QUESTIONS),
  documents_notary: entry('documents_notary', 'documents_notary', 'admin_support', {
    eyebrow: 'Documents & signing', title: 'Tell us about the document that needs to move.', body: 'Preparation, notary, RON, courier, or a courthouse run.', pickerLabel: 'Prepare, sign, or move a document',
  }, DOCUMENT_QUESTIONS, true),
  business_operations: entry('business_operations', 'business_operations', 'consulting', {
    eyebrow: 'Operations request', title: 'Tell us what the business needs handled.', body: 'Capacity, follow-through, vendors, or a defined operating project.', pickerLabel: 'Add capacity to the business',
  }, OPS_QUESTIONS, true),
  pos_payments: entry('pos_payments', 'pos_payments', 'merchant_services', {
    eyebrow: 'Systems & payments', title: 'Tell us about the system that needs to change.', body: 'POS, payments, data, or a software transition.', pickerLabel: 'Fix or switch a system or POS',
  }, POS_QUESTIONS, true),
  other: entry('other', 'other', null, {
    eyebrow: 'Start here', title: 'Tell us what needs to be handled.', body: 'Describe the outcome. We will help scope it.', pickerLabel: 'Something else',
  }, OTHER_QUESTIONS, true),
}

const OFFERING_PREFIX_JOB: [string, string][] = [
  ['property-standard-clean', 'cleaning_turnover'],
  ['property-deep-clean', 'cleaning_turnover'],
  ['property-moveout-clean', 'cleaning_turnover'],
  ['property-reo-clean', 'cleaning_turnover'],
  ['property-trashout', 'cleaning_turnover'],
  ['property-preservation', 'cleaning_turnover'],
  ['eviction-', 'eviction_reo'],
  ['property-eviction', 'eviction_reo'],
  ['property-lockout', 'eviction_reo'],
  ['field-', 'property_inspection'],
  ['bpo-', 'property_inspection'],
  ['occupancy', 'property_inspection'],
  ['interior-', 'property_inspection'],
  ['pos-', 'pos_payments'],
  ['consult-', 'business_operations'],
  ['admin-', 'business_operations'],
  ['funding-', 'business_operations'],
  ['notary-', 'documents_notary'],
  ['ron-', 'documents_notary'],
  ['courier-', 'documents_notary'],
  ['document-', 'documents_notary'],
]

export function questionsForJob(job: string): ScopeQuestion[] {
  return JOB_QUESTIONS[job] || OTHER_QUESTIONS
}

export function questionIsVisible(
  question: ScopeQuestion,
  answers: Record<string, string | string[]>,
  locationType?: 'onsite' | 'remote',
): boolean {
  const when = question.when
  if (!when) return true
  if (when.location && locationType && when.location !== locationType) return false
  if (when.key) {
    const raw = answers[when.key]
    const values = Array.isArray(raw) ? raw : raw ? [raw] : []
    if (when.in && !when.in.some((option) => values.includes(option))) return false
    if (when.includes) {
      const needle = when.includes.toLowerCase()
      if (!values.some((value) => value.toLowerCase().includes(needle))) return false
    }
  }
  return true
}

export function visibleQuestions(
  questions: ScopeQuestion[],
  answers: Record<string, string | string[]>,
  locationType?: 'onsite' | 'remote',
): ScopeQuestion[] {
  return questions.filter((question) => questionIsVisible(question, answers, locationType))
}

export function resolveScopeEntry(input: {
  guide?: string | null
  entry?: string | null
  service?: string | null
  job?: string | null
  offering?: string | null
  source?: string | null
}): ScopeEntry | null {
  const guide = (input.guide || '').trim()
  if (guide && GUIDE_ENTRIES[guide]) return GUIDE_ENTRIES[guide]

  const named = (input.entry || '').trim()
  if (named && GUIDE_ENTRIES[named]) return GUIDE_ENTRIES[named]
  if (named && SERVICE_ENTRIES[named]) return SERVICE_ENTRIES[named]

  const offering = (input.offering || '').trim()
  if (offering) {
    const match = OFFERING_PREFIX_JOB.find(([prefix]) => offering.startsWith(prefix))
    if (match) return JOB_ENTRIES[match[1]] || null
  }

  const job = (input.job || '').trim()
  if (job && JOB_ENTRIES[job]) return JOB_ENTRIES[job]

  const service = (input.service || '').trim()
  if (service) {
    const bySlug = SERVICE_ENTRIES[service.replace(/_/g, '-')]
    if (bySlug) return bySlug
    const byKey = Object.values(SERVICE_ENTRIES).find((item) => item.serviceKey === service)
    if (byKey) return byKey
  }

  const source = (input.source || '').toLowerCase()
  const fromSource = Object.keys(GUIDE_ENTRIES).find((slug) => source.includes(slug))
  if (fromSource) return GUIDE_ENTRIES[fromSource]

  return null
}

export function worldFromGuide(guide: string | null | undefined): OperatingWorld | null {
  if (!guide) return null
  return GUIDE_ENTRIES[guide]?.world || null
}
