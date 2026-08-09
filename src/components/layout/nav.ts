import type { IconName } from '../kit/Icon'

export interface NavItem {
  key: string
  label: string
  to: string
  icon: IconName
  section?: string
}

export const portalNav: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '', icon: 'home' },
  { key: 'services', label: 'My Services', to: 'services', icon: 'services' },
  { key: 'matters', label: 'Projects & Matters', to: 'matters', icon: 'briefcase' },
  { key: 'tasks', label: 'Tasks', to: 'tasks', icon: 'check' },
  { key: 'documents', label: 'Documents', to: 'documents', icon: 'file' },
  { key: 'messages', label: 'Messages', to: 'messages', icon: 'mail' },
  { key: 'calendar', label: 'Calendar', to: 'calendar', icon: 'calendar' },
  { key: 'billing', label: 'Billing', to: 'billing', icon: 'billing' },
  { key: 'support', label: 'Support', to: 'support', icon: 'support' },
  { key: 'business-profile', label: 'Business Profile', to: 'business-profile', icon: 'building' },
  { key: 'my-team', label: 'My Team', to: 'my-team', icon: 'team' },
  { key: 'notifications', label: 'Notifications', to: 'notifications', icon: 'bell' },
  { key: 'security', label: 'Security', to: 'security', icon: 'shield' },
]

export const portalHiddenRoutes = ['planned-calls', 'funding', 'property-management', 'tax-filings'] as const

export const adminNav: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '', icon: 'home', section: 'Workspace' },
  { key: 'pipelines', label: 'Pipelines', to: 'pipelines', icon: 'pipeline', section: 'Workspace' },
  { key: 'inquiries', label: 'Leads & Prospects', to: 'inquiries', icon: 'leads', section: 'Workspace' },
  { key: 'clients', label: 'Clients', to: 'clients', icon: 'clients', section: 'Workspace' },

  { key: 'messages', label: 'Messages', to: 'messages', icon: 'messages', section: 'Communication' },
  { key: 'communications', label: 'Communications', to: 'communications', icon: 'communications', section: 'Communication' },

  { key: 'activity', label: 'Activity', to: 'activity', icon: 'activity', section: 'Operations' },
  { key: 'employees', label: 'Team & Vendors', to: 'employees', icon: 'team', section: 'Operations' },
  { key: 'assignments', label: 'Assignments', to: 'assignments', icon: 'assignments', section: 'Operations' },
  { key: 'invoices', label: 'Invoices', to: 'invoices', icon: 'billing', section: 'Operations' },

  { key: 'reports', label: 'Reporting Center', to: 'reports', icon: 'reports', section: 'Insights' },
  { key: 'audit-log', label: 'Audit Log', to: 'audit-log', icon: 'audit', section: 'Insights' },

  { key: 'users', label: 'Users', to: 'users', icon: 'users', section: 'Administration' },
  { key: 'settings', label: 'Settings', to: 'settings', icon: 'settings', section: 'Administration' },
]
