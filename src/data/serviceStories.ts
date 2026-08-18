import type { JourneyStep } from '../components/public/story'
import type { StoryImageKey } from './storyImages'

// Per-service visual storytelling: which scene each service page shows, the
// lifecycle it follows, what the customer receives, and an example request.
// ServiceDetail reads this so every service page gains a visual narrative
// without a bespoke layout; services fall back to the shared defaults.

export interface ServiceStory {
  /** Scene slot for the service's visual story block. */
  slot: StoryImageKey
  /** One line answering "what does Pinnacle actually do here?". */
  lead: string
  /** Lifecycle chapters; falls back to DEFAULT_JOURNEY. */
  journey?: JourneyStep[]
  /** What the customer receives; falls back to DEFAULT_DELIVERABLES. */
  deliverables?: string[]
  /** A clearly-labeled example request for this service. */
  scenario: { title: string; steps: string[] }
}

// The reusable Pinnacle lifecycle, used unless a service overrides it.
export const DEFAULT_JOURNEY: JourneyStep[] = [
  { n: '01', label: 'Request', detail: 'You tell us what needs to happen. No account required.' },
  { n: '02', label: 'Review', detail: 'We confirm exactly what the matter needs before starting.' },
  { n: '03', label: 'Coordinate', detail: 'The right Pinnacle contact or vetted provider is assigned.' },
  { n: '04', label: 'Execute', detail: 'The work is carried out and documented as it goes.' },
  { n: '05', label: 'Verify', detail: 'Evidence and status are captured and checked.' },
  { n: '06', label: 'Complete', detail: 'You receive the result, the record, and the next step.' },
]

export const DEFAULT_DELIVERABLES = ['Status updates', 'Written summary', 'Service record', 'Completion confirmation', 'Communication history']

const FIELD_DELIVERABLES = ['Photo documentation', 'Timestamps', 'Geo-tagged evidence', 'Status updates', 'Completion report']
const DOC_DELIVERABLES = ['Prepared document', 'Signatures', 'Delivery confirmation', 'Preserved record', 'Status updates']

export const serviceStories: Record<string, ServiceStory> = {
  'property-inspections': {
    slot: 'field_inspection', deliverables: FIELD_DELIVERABLES,
    lead: 'A local field professional visits the property and documents its condition, inside and out.',
    scenario: { title: 'Example request', steps: ['Inspection requested', 'Location confirmed', 'Field professional assigned', 'Property documented on site', 'Findings and photos uploaded', 'Report delivered to you'] },
  },
  'field-photos-bpo': {
    slot: 'field_inspection', deliverables: FIELD_DELIVERABLES,
    lead: 'A licensed professional captures the photos and market context your report needs.',
    scenario: { title: 'Example request', steps: ['Photos or BPO requested', 'Address and requirements confirmed', 'Local professional dispatched', 'Exterior captured on site', 'Comps and context compiled', 'Deliverable returned'] },
  },
  'property-management': {
    slot: 'property_exterior', deliverables: FIELD_DELIVERABLES,
    lead: 'Licensed managers in the Pinnacle network handle the property, or on-call care keeps it covered if you hold the keys.',
    scenario: { title: 'Example request', steps: ['Owner support requested', 'Property and scope reviewed', 'Licensed manager or care plan matched', 'Ongoing oversight begins', 'Issues coordinated and documented', 'You stay informed without chasing'] },
  },
  'property-cleaning': {
    slot: 'property_interior', deliverables: FIELD_DELIVERABLES,
    lead: 'A vetted crew handles the turn or clean and documents the result with photos.',
    scenario: { title: 'Example request', steps: ['Cleaning requested', 'Scope and access confirmed', 'Crew coordinated and scheduled', 'Work completed on site', 'Before/after documented', 'Completion report delivered'] },
  },
  'short-term-rental-support': {
    slot: 'property_interior', deliverables: FIELD_DELIVERABLES,
    lead: 'Verified turnovers with tracked checklists, required photos, and a guest-ready report.',
    scenario: { title: 'Example turnover', steps: ['Turnover requested', 'Checklist and access confirmed', 'Turnover team dispatched', 'Clean and reset completed', 'Required photos captured', 'Guest-ready report posted'] },
  },
  'eviction-support': {
    slot: 'documentation', deliverables: FIELD_DELIVERABLES,
    lead: 'Non-legal notice prep, filing packets, courthouse runs, and post-possession turnover, milestone by milestone.',
    scenario: { title: 'Example request', steps: ['Support requested', 'Requirements and timeline reviewed', 'Packet prepared and filed', 'Courthouse runs coordinated', 'Milestones tracked to possession', 'Turnover completed and documented'] },
  },
  'mobile-notary': {
    slot: 'document_signing', deliverables: DOC_DELIVERABLES,
    lead: 'A commissioned notary meets the signer to complete the notarial act in person.',
    scenario: { title: 'Example request', steps: ['Signing requested', 'Documents and identity requirements confirmed', 'Notary coordinated to the location', 'Identity verified', 'Notarial act completed', 'Completed documents returned'] },
  },
  'remote-online-notary': {
    slot: 'notary_remote', deliverables: DOC_DELIVERABLES,
    lead: 'A commissioned notary completes the notarization over a secure online session.',
    scenario: { title: 'Example request', steps: ['Remote notarization requested', 'Requirements and platform confirmed', 'Session scheduled', 'Identity verified on camera', 'Notarial act completed remotely', 'Completed document delivered'] },
  },
  'document-preparation': {
    slot: 'review', deliverables: DOC_DELIVERABLES,
    lead: 'Requirements reviewed and the document coordinated to completion, without legal overreach.',
    scenario: { title: 'Example request', steps: ['Document requested', 'Requirements reviewed', 'Document prepared or coordinated', 'Signature completed', 'Delivery confirmed', 'Record preserved'] },
  },
  'document-courier': {
    slot: 'courier_handoff', deliverables: DOC_DELIVERABLES,
    lead: 'A courier picks up, delivers, or files your documents with confirmation at each step.',
    scenario: { title: 'Example request', steps: ['Courier requested', 'Pickup and drop-off confirmed', 'Courier dispatched', 'Documents collected', 'Delivery or filing completed', 'Confirmation returned'] },
  },
  consulting: {
    slot: 'business_owner',
    lead: 'Pinnacle becomes the coordination point so the project that keeps sliding actually moves.',
    scenario: { title: 'Example engagement', steps: ['Challenge described', 'Scope and priorities reviewed', 'People and vendors coordinated', 'Work moved forward in steps', 'Progress and decisions documented', 'Result and status delivered'] },
  },
  'merchant-services': {
    slot: 'coordination',
    lead: 'Independent support through a POS or payment transition, from comparison to stabilization.',
    scenario: { title: 'Example engagement', steps: ['Transition requested', 'Current setup reviewed', 'Options compared independently', 'Data prepared for cutover', 'Cutover coordinated', 'Stabilization confirmed'] },
  },
  'administrative-support': {
    slot: 'coordination',
    lead: 'Dependable capacity for the recurring follow-up, records, and scheduling that eats the week.',
    scenario: { title: 'Example request', steps: ['Support requested', 'Recurring work reviewed', 'Coordinator assigned', 'Tasks handled on a cadence', 'Records kept current', 'Status shared with you'] },
  },
  funding: {
    slot: 'review',
    lead: 'An honest readiness review and organized documentation so you approach lenders prepared.',
    scenario: { title: 'Example engagement', steps: ['Funding support requested', 'Readiness reviewed honestly', 'Documentation organized', 'Application support prepared', 'Package assembled', 'Next steps confirmed'] },
  },
}

export function getServiceStory(slug: string): ServiceStory | null {
  return serviceStories[slug] ?? null
}
