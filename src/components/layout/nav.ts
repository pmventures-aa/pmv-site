export interface NavItem {
  key: string
  label: string
  to: string
  icon: string // simple emoji/glyph to avoid an icon dependency
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
  { key: 'support', label: 'Support', to: 'support', icon: '❓' },
  { key: 'business-profile', label: 'Business Profile', to: 'business-profile', icon: '⚑' },
  { key: 'my-team', label: 'My Team', to: 'my-team', icon: '☺' },
  { key: 'notifications', label: 'Notifications', to: 'notifications', icon: '🔔' },
  { key: 'security', label: 'Security', to: 'security', icon: '⚿' },
]

// Not in the primary sidebar (kept out to match the requested clean nav list)
// but still real routes — reachable from Planned Calls request buttons and
// from service-specific links on the My Services page.
export const portalHiddenRoutes = ['planned-calls', 'funding', 'property-management', 'tax-filings'] as const

export const adminNav: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '', icon: '⌂' },
  { key: 'pipelines', label: 'Pipelines', to: 'pipelines', icon: '▤' },
  { key: 'clients', label: 'Clients', to: 'clients', icon: '☺' },
  { key: 'inquiries', label: 'Inquiries', to: 'inquiries', icon: '✉' },
  { key: 'messages', label: 'Messages', to: 'messages', icon: '💬' },
  { key: 'activity', label: 'Activity', to: 'activity', icon: '🔔' },
  { key: 'audit-log', label: 'Audit Log', to: 'audit-log', icon: '⧉' },
  { key: 'reports', label: 'Reporting Center', to: 'reports', icon: '▥' },
  { key: 'employees', label: 'Employees', to: 'employees', icon: '⚈' },
  { key: 'users', label: 'Users', to: 'users', icon: '⚙' },
  { key: 'assignments', label: 'Assignments', to: 'assignments', icon: '⇄' },
  { key: 'settings', label: 'Settings', to: 'settings', icon: '⚙' },
]
