import { jobsForWorld, resolveVendorWorld, resolveWorld, worldFromPublicParams, type OperatingWorld, type WorkspaceContext } from '../../shared/workspace'

export type { OperatingWorld, WorkspaceContext }
export { jobsForWorld, resolveWorld, resolveVendorWorld, worldFromPublicParams }

export const WORKSPACE_STORAGE_KEY = 'pmv_operating_world'
export const HQ_PARTY_STORAGE_KEY = 'pmv_hq_party'

export interface ClientWorkspaceCopy {
  world: OperatingWorld
  badge: string
  loginEyebrow: string
  loginTitle: string
  loginBody: string
  loginPoints: string[]
  homeEyebrow: string
  homeSubtitle: string
  primaryCta: { label: string; to: string }
  secondaryCta: { label: string; to: string }
  workHeading: string
  pulseOpenLabel: string
  discoveryTitle: string
  discoveryBody: string
  mobilePrimary: string[]
  shortcutKeys: Array<'properties' | 'documents' | 'messages' | 'billing' | 'calendar' | 'team' | 'account' | 'funding'>
}

const CLIENT_COPY: Record<OperatingWorld, ClientWorkspaceCopy> = {
  property: {
    world: 'property',
    badge: 'Property workspace',
    loginEyebrow: 'Property workspace',
    loginTitle: 'Your properties, visits, and turnovers in one place.',
    loginBody: 'Inspections, cleaning, vendors, access, and documented field work stay attached to the address, not scattered across texts and inboxes.',
    loginPoints: ['Every property has its own record', 'Field visits with photos and follow-through', 'Requests, vendors, and billing in one relationship'],
    homeEyebrow: 'Property workspace',
    homeSubtitle: 'See what is happening at each address, what Pinnacle owns in the field, and where you are needed.',
    primaryCta: { label: 'Start a property request', to: 'support' },
    secondaryCta: { label: 'View properties', to: 'property-management' },
    workHeading: 'Active property work',
    pulseOpenLabel: 'Open property work',
    discoveryTitle: 'Add another property need without starting over',
    discoveryBody: 'Cleaning, inspections, turnovers, and preservation stay in this same workspace.',
    mobilePrimary: ['dashboard', 'properties', 'support', 'documents'],
    shortcutKeys: ['properties', 'documents', 'calendar', 'billing', 'team', 'account'],
  },
  documents: {
    world: 'documents',
    badge: 'Documents & signing',
    loginEyebrow: 'Documents & signing',
    loginTitle: 'Prepare it, move it, sign it, and keep the proof.',
    loginBody: 'Notary appointments, RON sessions, courier runs, and document packages stay connected to the request with a completion record.',
    loginPoints: ['Signing and filing in one thread', 'Mobile notary and RON when the document requires it', 'Delivery confirmation with the request'],
    homeEyebrow: 'Documents & signing',
    homeSubtitle: 'Track packages, signatures, courier runs, and what still needs your attention.',
    primaryCta: { label: 'Start a document request', to: 'support' },
    secondaryCta: { label: 'Open documents', to: 'documents' },
    workHeading: 'Active document work',
    pulseOpenLabel: 'Open document work',
    discoveryTitle: 'Bring another document need into this workspace',
    discoveryBody: 'Preparation, notary, RON, and courier can share the same client record.',
    mobilePrimary: ['dashboard', 'documents', 'support', 'messages'],
    shortcutKeys: ['documents', 'messages', 'calendar', 'billing', 'team', 'account'],
  },
  business: {
    world: 'business',
    badge: 'Operations workspace',
    loginEyebrow: 'Operations workspace',
    loginTitle: 'Capacity, systems, and follow-through for the business.',
    loginBody: 'Administrative work, vendor changes, POS and payment projects, and ongoing operations stay with one accountable Pinnacle relationship.',
    loginPoints: ['One owner for the next step', 'Documents and messages on the same work', 'Add capacity without another full-time seat'],
    homeEyebrow: 'Operations workspace',
    homeSubtitle: 'See open work, what Pinnacle is driving, and the next decision that needs you.',
    primaryCta: { label: 'Start an operations request', to: 'support' },
    secondaryCta: { label: 'Message your team', to: 'messages' },
    workHeading: 'Active operations work',
    pulseOpenLabel: 'Open operations work',
    discoveryTitle: 'Add another operations need to this relationship',
    discoveryBody: 'Admin support, systems work, and project coordination stay connected here.',
    mobilePrimary: ['dashboard', 'support', 'documents', 'messages'],
    shortcutKeys: ['documents', 'messages', 'billing', 'calendar', 'team', 'account'],
  },
  funding: {
    world: 'funding',
    badge: 'Funding workspace',
    loginEyebrow: 'Funding workspace',
    loginTitle: 'Application materials, status, and next lender steps together.',
    loginBody: 'Pinnacle helps organize what lenders may ask for and keeps the conversation, files, and status in one private workspace.',
    loginPoints: ['Application files in one place', 'Clear status without chasing inboxes', 'Independent lenders decide approval and terms'],
    homeEyebrow: 'Funding workspace',
    homeSubtitle: 'Track applications, requested documents, and the next item that unblocks review.',
    primaryCta: { label: 'Open funding', to: 'funding' },
    secondaryCta: { label: 'Open documents', to: 'documents' },
    workHeading: 'Active funding work',
    pulseOpenLabel: 'Open funding work',
    discoveryTitle: 'Other Pinnacle support stays available',
    discoveryBody: 'Operations, documents, and property work can join this relationship when you need them.',
    mobilePrimary: ['dashboard', 'funding', 'documents', 'support'],
    shortcutKeys: ['funding', 'documents', 'messages', 'billing', 'team', 'account'],
  },
  general: {
    world: 'general',
    badge: 'Client workspace',
    loginEyebrow: 'Client workspace',
    loginTitle: 'Your work with Pinnacle, organized in one secure place.',
    loginBody: 'Continue a request, review documents, message your team, and keep the engagement moving without chasing updates.',
    loginPoints: ['Secure documents and messages', 'Clear next steps and service status', 'One relationship across the work'],
    homeEyebrow: 'Your workspace',
    homeSubtitle: 'See what is moving, what Pinnacle owns, and where you are needed. Then jump straight into that work.',
    primaryCta: { label: 'Start a request', to: 'support' },
    secondaryCta: { label: 'Message your team', to: 'messages' },
    workHeading: 'Active requests',
    pulseOpenLabel: 'Open work',
    discoveryTitle: 'Bring another need into this relationship',
    discoveryBody: 'Property, documents, operations, and funding can share the same Pinnacle record.',
    mobilePrimary: ['dashboard', 'support', 'documents', 'messages'],
    shortcutKeys: ['documents', 'messages', 'billing', 'calendar', 'team', 'account'],
  },
}

export function clientWorkspace(serviceKeys: string[]): ClientWorkspaceCopy {
  return CLIENT_COPY[resolveWorld(serviceKeys)]
}

export function clientWorkspaceForWorld(world: OperatingWorld): ClientWorkspaceCopy {
  return CLIENT_COPY[world]
}

export function rememberOperatingWorld(world: OperatingWorld, partyType?: 'employee' | 'vendor' | null) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, world)
  if (partyType) window.localStorage.setItem(HQ_PARTY_STORAGE_KEY, partyType)
}

export function rememberedWorld(): OperatingWorld | null {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
  if (value === 'property' || value === 'documents' || value === 'business' || value === 'funding' || value === 'general') return value
  return null
}

export function rememberedHqParty(): 'employee' | 'vendor' | null {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(HQ_PARTY_STORAGE_KEY)
  return value === 'vendor' || value === 'employee' ? value : null
}

export function worldFromServiceParam(serviceKey: string | null | undefined): OperatingWorld | null {
  if (!serviceKey) return null
  return resolveWorld([serviceKey]) === 'general' ? null : resolveWorld([serviceKey])
}

export interface HqWorkspaceCopy {
  loginEyebrow: string
  loginTitle: string
  loginBody: string
  homeKicker: string
  homeSubtitle: string
  badge: string
}

export function hqWorkspaceCopy(partyType: 'employee' | 'vendor' | null, vendorCategory?: string | null, roleName?: string | null): HqWorkspaceCopy {
  if (partyType === 'vendor') {
    const world = resolveVendorWorld([], vendorCategory)
    if (world === 'property') {
      return {
        loginEyebrow: 'Field provider access',
        loginTitle: 'Your property and field assignments.',
        loginBody: 'Open the jobs assigned to you, travel and arrive on site, document the visit, and complete the record.',
        homeKicker: 'Field assignments',
        homeSubtitle: 'Property visits, inspections, and on-site work assigned to you.',
        badge: 'Field provider',
      }
    }
    if (world === 'documents') {
      return {
        loginEyebrow: 'Signing provider access',
        loginTitle: 'Your notary, RON, and document assignments.',
        loginBody: 'Open the signing or courier jobs assigned to you, complete the session, and keep the audit record with Pinnacle.',
        homeKicker: 'Signing assignments',
        homeSubtitle: 'Mobile notary, RON, and document runs assigned to you.',
        badge: 'Signing provider',
      }
    }
    return {
      loginEyebrow: 'Provider access',
      loginTitle: 'Your Pinnacle assignments.',
      loginBody: 'Approved providers see the work assigned to them, not the full HQ operating console.',
      homeKicker: 'Provider workspace',
      homeSubtitle: 'Assignments, messages, and completion records for your Pinnacle work.',
      badge: 'Provider',
    }
  }
  return {
    loginEyebrow: 'Pinnacle HQ',
    loginTitle: roleName ? `${roleName} access` : 'Sign in to continue.',
    loginBody: roleName
      ? `Your ${roleName} workspace shows the clients, cases, and tools that role is authorized to use.`
      : 'Every sign-in is encrypted in transit, logged with IP and device, and expires automatically.',
    homeKicker: roleName || 'Staff console',
    homeSubtitle: roleName
      ? `Here is the ${roleName.toLowerCase()} picture and the work that needs attention next.`
      : 'Here is the firm-wide picture and the work that needs attention next.',
    badge: roleName || 'Staff console',
  }
}

export function vendorApplicationCopy(enrollments: string[]) {
  const world = resolveVendorWorld(enrollments)
  if (world === 'property') {
    return {
      eyebrow: 'Field provider application',
      title: 'Apply for property and field assignments',
      badge: 'Field provider',
      sideTitle: 'Field and property work, assigned with a record.',
      sideBody: 'Pinnacle coordinates inspections, cleaning, turnovers, and on-site visits. Providers document arrival, photos, and completion against the assignment.',
    }
  }
  if (world === 'documents') {
    return {
      eyebrow: 'Signing provider application',
      title: 'Apply for notary, RON, and document assignments',
      badge: 'Signing provider',
      sideTitle: 'Notary, RON, and document movement with an audit trail.',
      sideBody: 'Commission details, insurance, and identity documents are collected so Pinnacle can assign eligible signing and courier work.',
    }
  }
  if (world === 'business') {
    return {
      eyebrow: 'Operations provider application',
      title: 'Apply for operations and systems assignments',
      badge: 'Operations provider',
      sideTitle: 'Operations and systems work under a Pinnacle assignment.',
      sideBody: 'POS, payments, consulting, and administrative support are scoped per engagement, with access limited to that assignment.',
    }
  }
  if (world === 'funding') {
    return {
      eyebrow: 'Financial provider application',
      title: 'Apply for bookkeeping and funding-adjacent work',
      badge: 'Financial provider',
      sideTitle: 'Financial support coordinated through Pinnacle.',
      sideBody: 'Bookkeeping and funding-adjacent work is assigned only after credentials and the engagement scope are on file.',
    }
  }
  return {
    eyebrow: 'Pinnacle Professional Network',
    title: 'Provider application',
    badge: 'Provider',
    sideTitle: 'Join the Pinnacle professional network.',
    sideBody: 'Choose the work you can accept. Questions, documents, and review requirements change with the services you enroll for.',
  }
}

export function publicIntakeCopy(world: OperatingWorld) {
  if (world === 'property') {
    return {
      eyebrow: 'Property request',
      title: 'Tell us about the property work.',
      body: 'Cleaning, inspections, turnovers, eviction, and REO support start in this property intake. Your portal will follow the same world.',
      cta: 'Send property request',
      pickerTitle: 'What does the property need?',
      locationTitle: 'Where is the property?',
    }
  }
  if (world === 'documents') {
    return {
      eyebrow: 'Documents & signing',
      title: 'Tell us about the document that needs to move.',
      body: 'Preparation, notary, RON, courier, and courthouse runs stay on this document path, not a generic catch-all form.',
      cta: 'Send document request',
      pickerTitle: 'What needs to happen with the document?',
      locationTitle: 'Where does this need to happen?',
    }
  }
  if (world === 'business') {
    return {
      eyebrow: 'Operations request',
      title: 'Tell us what the business needs handled.',
      body: 'Capacity, systems, POS, and follow-through start here. The workspace you get after this is an operations workspace.',
      cta: 'Send operations request',
      pickerTitle: 'What does the business need?',
      locationTitle: 'Where should this work happen?',
    }
  }
  if (world === 'funding') {
    return {
      eyebrow: 'Funding conversation',
      title: 'Tell us about the financing work in front of you.',
      body: 'Pinnacle organizes materials and status. Independent lenders decide approval and terms.',
      cta: 'Send funding request',
      pickerTitle: 'What financing help do you need?',
      locationTitle: 'Where is the business based?',
    }
  }
  return {
    eyebrow: 'Start here',
    title: 'Tell us what needs to be handled.',
    body: 'One defined task or several connected pieces. Give us the practical facts and we will identify the scope, the right people, and the next step.',
    cta: 'Send my request',
    pickerTitle: 'What outcome are you after?',
    locationTitle: 'Where does the work need to happen?',
  }
}

export function clientTypeForWorld(world: OperatingWorld): 'property' | 'business' | 'personal' | '' {
  if (world === 'property') return 'property'
  if (world === 'business' || world === 'funding') return 'business'
  if (world === 'documents') return 'personal'
  return ''
}

export function worldFromClientType(clientType: string): OperatingWorld | null {
  if (clientType === 'property') return 'property'
  if (clientType === 'business') return 'business'
  if (clientType === 'personal') return 'documents'
  return null
}

export interface HqQuickAction {
  label: string
  to: string
  icon: 'plus' | 'services' | 'billing' | 'communications' | 'support' | 'file' | 'assignments' | 'clients' | 'reports'
  detail: string
}

export function hqEmployeeExperience(roleName?: string | null): { createLabel: string; quickActions: HqQuickAction[] } {
  const role = (roleName || '').toLowerCase()
  if (/document|notary|sign|esign|courier/.test(role)) {
    return {
      createLabel: 'New document work',
      quickActions: [
        { label: 'Document hub', to: 'document-center', icon: 'file', detail: 'Packages, filings, and completion records.' },
        { label: 'E-signature', to: 'esign-platform', icon: 'file', detail: 'Open the signing platform.' },
        { label: 'Cases', to: 'cases', icon: 'support', detail: 'Requests waiting on a response.' },
      ],
    }
  }
  if (/field|inspect|propert|dispatch/.test(role)) {
    return {
      createLabel: 'New field work',
      quickActions: [
        { label: 'Field work', to: 'field-work', icon: 'assignments', detail: 'Assignments, visits, and completion records.' },
        { label: 'Assign service', to: 'service-assignments', icon: 'services', detail: 'Route work to a provider or crew.' },
        { label: 'Clients', to: 'clients', icon: 'clients', detail: 'Open a property client record.' },
      ],
    }
  }
  if (/bill|finance|account/.test(role)) {
    return {
      createLabel: 'New billing item',
      quickActions: [
        { label: 'New invoice', to: 'invoices', icon: 'billing', detail: 'Write, send, and mark client invoices paid.' },
        { label: 'Clients', to: 'clients', icon: 'clients', detail: 'Open the client record.' },
        { label: 'Reports', to: 'reports', icon: 'reports', detail: 'Financial and operating reports.' },
      ],
    }
  }
  return {
    createLabel: 'Create',
    quickActions: [
      { label: 'Add lead', to: 'leads/new', icon: 'plus', detail: 'Create a CRM lead and optionally send their account invite.' },
      { label: 'Assign service', to: 'service-assignments', icon: 'services', detail: 'Open service assignment workflow.' },
      { label: 'New invoice', to: 'invoices', icon: 'billing', detail: 'Write, send, and mark a client invoice paid.' },
      { label: 'Communications', to: 'communications', icon: 'communications', detail: 'Email and threads.' },
    ],
  }
}

export function onboardingWorldCopy(world: OperatingWorld) {
  if (world === 'property') {
    return {
      title: 'Start with the property work in front of you.',
      body: 'Addresses, access, condition, and timing are enough to begin. You can add another property need later without opening a new relationship.',
    }
  }
  if (world === 'documents') {
    return {
      title: 'Start with the document that needs to move.',
      body: 'Tell us what has to be prepared, signed, notarized, or delivered. The portal will keep the package and the proof together.',
    }
  }
  if (world === 'business') {
    return {
      title: 'Start with the operations problem, not a service catalog.',
      body: 'Describe the capacity, system, or follow-through gap. Pinnacle will organize the next step from there.',
    }
  }
  if (world === 'funding') {
    return {
      title: 'Start with the financing conversation you need to have.',
      body: 'We will organize materials and status. Independent lenders decide approval and terms.',
    }
  }
  return {
    title: 'Start with what brought you here.',
    body: 'You do not need to map every service. Choose the closest operating world and we will gather enough to begin.',
  }
}

export function emptyWorkspace(): WorkspaceContext {
  return { service_keys: [], party_type: null, vendor_category: null, role_name: null, world: 'general' }
}
