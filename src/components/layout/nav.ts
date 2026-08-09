export interface NavItem {
  key: string
  label: string
  to: string
  icon: string // simple monochrome glyph to avoid an icon dependency
  section?: string
}

export const portalNav: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '', icon: '⌂' },
  { key: 'services', label: 'My Services', to: 'services', icon: '✦' },
  { key: 'matters', label: 'Projects & Matters', to: 'matters', icon: '⚖' },
  { key: 'tasks', label: 'Tasks', to: 'tasks', icon: '✓' },
  { key: 'documents', label: 'Documents', to: 'documents', icon: '⌘' },
  { key: 'messages', label: 'Messages', to: 'messages', icon: '✉' },
  { key: 'calendar', label: 'Calendar', to: 'calendar', icon: '▦' },
  { key: 'billing', label: 'Billing', to: 'billing', icon: '$' },
  { key: 'support', label: 'Support', to: 'support', icon: '?' },
  { key: 'business-profile', label: 'Business Profile', to: 'business-profile', icon: '⚑' },
  { key: 'my-team', label: 'My Team', to: 'my-team', icon: '◎' },
  { key: 'notifications', label: 'Notifications', to: 'notifications', icon: '◷' },
  { key: 'security', label: 'Security', to: 'security', icon: '⚿' },
]

export const portalHiddenRoutes = ['planned-calls', 'funding', 'property-management', 'tax-filings'] as const

export const adminNav: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '', icon: '⌂', section: 'Workspace' },
  { key: 'pipelines', label: 'Pipelines', to: 'pipelines', icon: '▤', section: 'Workspace' },
  { key: 'inquiries', label: 'Leads & Prospects', to: 'inquiries', icon: '◎', section: 'Workspace' },
  { key: 'clients', label: 'Clients', to: 'clients', icon: '◉', section: 'Workspace' },

  { key: 'messages', label: 'Messages', to: 'messages', icon: '≋', section: 'Communication' },
  { key: 'communications', label: 'Communications', to: 'communications', icon: '◫', section: 'Communication' },

  { key: 'activity', label: 'Activity', to: 'activity', icon: '◷', section: 'Operations' },
  { key: 'employees', label: 'Team & Vendors', to: 'employees', icon: '◉', section: 'Operations' },
  { key: 'assignments', label: 'Assignments', to: 'assignments', icon: '⇄', section: 'Operations' },

  { key: 'reports', label: 'Reporting Center', to: 'reports', icon: '▥', section: 'Insights' },
  { key: 'audit-log', label: 'Audit Log', to: 'audit-log', icon: '⧉', section: 'Insights' },

  { key: 'users', label: 'Users', to: 'users', icon: '♙', section: 'Administration' },
  { key: 'settings', label: 'Settings', to: 'settings', icon: '⚙', section: 'Administration' },
]
