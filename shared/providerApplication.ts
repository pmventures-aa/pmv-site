// Per-track branching for the provider application. Each enrollment track
// declares the extra questions and the verification documents it needs, so the
// questionnaire and upload list assemble from whatever tracks an applicant
// selects. Keeping this in one shared module means the signup UI, the backend
// upload allowlist, and the branded application PDF all agree on what a given
// track requires.

export type ProviderTrackKey =
  | 'property_field'
  | 'mobile_notary'
  | 'ron'
  | 'document_courier'
  | 'merchant_technology'
  | 'business_operations'
  | 'bookkeeping_financial'
  | 'other'

// Uploadable document slots. Base slots apply to everyone; the rest are
// requested only by the tracks that need them.
export type ApplicationDocKey =
  | 'government_id_front'
  | 'government_id_back'
  | 'ein_letter'
  | 'w9'
  | 'professional_license'
  | 'insurance'
  | 'background_check_consent'
  | 'auto_insurance'
  | 'notary_commission'
  | 'eo_insurance'
  | 'ron_credential'
  | 'financial_credential'
  | 'tech_certification'
  | 'supporting'

export interface TrackQuestion {
  key: string
  label: string
  type: 'text' | 'textarea'
  placeholder?: string
}

export interface TrackDocRequirement {
  key: ApplicationDocKey
  label: string
  help: string
  required: boolean
}

// Human labels for every document slot, used by the branded PDF and the admin
// profile so a stored document_type renders as a readable name.
export const DOC_LABELS: Record<ApplicationDocKey, string> = {
  government_id_front: 'Government ID — front',
  government_id_back: 'Government ID — back',
  ein_letter: 'IRS EIN letter',
  w9: 'W-9',
  professional_license: 'Professional / trade license',
  insurance: 'Proof of insurance',
  background_check_consent: 'Background check consent',
  auto_insurance: 'Auto insurance',
  notary_commission: 'Notary commission certificate',
  eo_insurance: 'E&O insurance / notary bond',
  ron_credential: 'RON platform credential',
  financial_credential: 'Bookkeeping / accounting credential',
  tech_certification: 'Technology certification',
  supporting: 'Supporting document',
}

// The full set the backend accepts on upload. Keep in sync with DOC_LABELS.
export const ALL_APPLICATION_DOC_KEYS = Object.keys(DOC_LABELS) as ApplicationDocKey[]

// Extra questions per track — only dimensions not already covered by the
// shared questions (experience, license/insurance yes-no, commission, travel
// radius, technology platforms, accounting credentials).
export const TRACK_QUESTIONS: Record<ProviderTrackKey, TrackQuestion[]> = {
  property_field: [
    { key: 'property_types', label: 'Types of property or field work you handle', type: 'textarea', placeholder: 'Inspections, repairs, turns, photography, lawn/pool, etc.' },
    { key: 'crew_size', label: 'Do you work solo or with a crew?', type: 'text', placeholder: 'Solo / 2-person / crew of 5…' },
  ],
  mobile_notary: [
    { key: 'loan_signing_certified', label: 'Are you certified for loan signings? (NNA/LSS or similar)', type: 'text', placeholder: 'Yes — NNA certified / No' },
    { key: 'notary_languages', label: 'Languages you can notarize in', type: 'text', placeholder: 'English, Spanish…' },
  ],
  ron: [
    { key: 'ron_states', label: 'States where you are commissioned for remote online notarization', type: 'text', placeholder: 'FL, TX…' },
  ],
  document_courier: [
    { key: 'vehicle_type', label: 'Vehicle you use for courier work', type: 'text', placeholder: 'Sedan, van, SUV…' },
    { key: 'courier_coverage', label: 'Typical courier coverage area', type: 'text', placeholder: 'Counties or radius you cover' },
  ],
  merchant_technology: [
    { key: 'systems_brands', label: 'POS / payment brands and systems you have deployed', type: 'textarea', placeholder: 'Clover, Toast, Stripe Terminal, specific gateways…' },
  ],
  business_operations: [
    { key: 'ops_domains', label: 'Operations or consulting areas you specialize in', type: 'textarea', placeholder: 'Vendor management, SOPs, project coordination…' },
  ],
  bookkeeping_financial: [
    { key: 'accounting_software', label: 'Accounting software you work in', type: 'text', placeholder: 'QuickBooks Online, Xero…' },
  ],
  other: [],
}

// Track-specific documents. Base documents (ID, EIN, W-9) are added separately.
export const TRACK_DOCUMENTS: Record<ProviderTrackKey, TrackDocRequirement[]> = {
  property_field: [
    { key: 'insurance', label: 'Proof of liability insurance', help: 'Current certificate or declarations page for general/professional liability.', required: true },
    { key: 'professional_license', label: 'Professional / trade license (if applicable)', help: 'Upload any trade or professional license your work requires.', required: false },
    { key: 'background_check_consent', label: 'Background check consent', help: 'Required for on-site and in-home work. Upload the signed consent form.', required: true },
  ],
  mobile_notary: [
    { key: 'notary_commission', label: 'Notary commission certificate', help: 'Upload your current state notary commission certificate.', required: true },
    { key: 'eo_insurance', label: 'E&O insurance / notary bond', help: 'Upload your errors & omissions policy or notary bond as applicable in your state.', required: true },
    { key: 'background_check_consent', label: 'Background check consent', help: 'Required for signing and in-home appointments. Upload the signed consent form.', required: true },
  ],
  ron: [
    { key: 'notary_commission', label: 'Notary commission certificate', help: 'Upload your current state notary commission certificate.', required: true },
    { key: 'ron_credential', label: 'RON platform credential / approval', help: 'Upload proof of your remote online notarization platform approval.', required: true },
    { key: 'eo_insurance', label: 'E&O insurance', help: 'Upload your errors & omissions policy.', required: true },
  ],
  document_courier: [
    { key: 'auto_insurance', label: 'Auto insurance', help: 'Upload current proof of auto insurance for courier work.', required: true },
    { key: 'background_check_consent', label: 'Background check consent', help: 'Required for document handling and delivery. Upload the signed consent form.', required: true },
  ],
  merchant_technology: [
    { key: 'tech_certification', label: 'Technology certifications (if any)', help: 'Upload any vendor or platform certifications relevant to your work.', required: false },
  ],
  business_operations: [],
  bookkeeping_financial: [
    { key: 'financial_credential', label: 'Bookkeeping / accounting credential (if any)', help: 'Upload a CPA license, QuickBooks ProAdvisor, or similar credential if you hold one.', required: false },
  ],
  other: [],
}

// Union of track questions for the selected tracks, de-duplicated by key.
export function questionsForTracks(tracks: ProviderTrackKey[]): TrackQuestion[] {
  const seen = new Set<string>()
  const out: TrackQuestion[] = []
  for (const track of tracks) {
    for (const q of TRACK_QUESTIONS[track] ?? []) {
      if (seen.has(q.key)) continue
      seen.add(q.key)
      out.push(q)
    }
  }
  return out
}

// Full document requirement list for the selected tracks, including the base
// documents everyone provides. De-duplicated by slot; if any track marks a
// shared slot required, it is required.
export function documentsForTracks(
  tracks: ProviderTrackKey[],
  opts: { businessEntity: boolean },
): TrackDocRequirement[] {
  const base: TrackDocRequirement[] = [
    { key: 'government_id_front', label: 'Government ID — front', help: 'Upload a clear image of the front of your government-issued photo ID.', required: true },
    { key: 'government_id_back', label: 'Government ID — back', help: 'Upload a clear image of the back of the same ID.', required: true },
  ]
  if (opts.businessEntity) {
    base.push({ key: 'ein_letter', label: 'IRS EIN letter', help: 'Upload your CP 575, 147C, SS-4 confirmation, or other IRS-issued EIN confirmation.', required: true })
  }

  const byKey = new Map<ApplicationDocKey, TrackDocRequirement>()
  for (const doc of base) byKey.set(doc.key, doc)
  for (const track of tracks) {
    for (const doc of TRACK_DOCUMENTS[track] ?? []) {
      const existing = byKey.get(doc.key)
      if (existing) existing.required = existing.required || doc.required
      else byKey.set(doc.key, { ...doc })
    }
  }

  // W-9 is always offered (optional at application time; collected before pay).
  byKey.set('w9', { key: 'w9', label: 'W-9 (optional now)', help: 'Provide a current W-9 now or Pinnacle can request it before a paid assignment.', required: false })
  return [...byKey.values()]
}
