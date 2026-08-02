export interface NavItem {
  key: string
  label: string
  to: string
  icon: string // simple emoji/glyph to avoid an icon dependency
}

export const portalNav: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '', icon: '⌂' },
  { key: 'calls', label: 'Planned Calls', to: 'calls', icon: '☎' },
  { key: 'services', label: 'Services', to: 'services', icon: '✦' },
  { key: 'matters', label: 'Matters', to: 'matters', icon: '⚖' },
  { key: 'tasks', label: 'Tasks', to: 'tasks', icon: '✓' },
  { key: 'documents', label: 'Documents', to: 'documents', icon: '⌘' },
  { key: 'messages', label: 'Messages', to: 'messages', icon: '✉' },
  { key: 'calendar', label: 'Calendar', to: 'calendar', icon: '▦' },
  { key: 'billing', label: 'Billing', to: 'billing', icon: '$' },
  { key: 'funding', label: 'Funding', to: 'funding', icon: '↗' },
  { key: 'property', label: 'Property', to: 'property', icon: '⌂' },
  { key: 'tax', label: 'Tax', to: 'tax', icon: '%' },
  { key: 'support', label: 'Support', to: 'support', icon: '❓' },
]

export const adminNav: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '', icon: '⌂' },
  { key: 'clients', label: 'Clients', to: 'clients', icon: '☺' },
  { key: 'users', label: 'Users', to: 'users', icon: '⚙' },
  { key: 'assignments', label: 'Assignments', to: 'assignments', icon: '⇄' },
  { key: 'settings', label: 'Settings', to: 'settings', icon: '⚙' },
]
