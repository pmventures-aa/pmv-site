import {
  Home,
  Layers,
  Scale,
  CheckSquare,
  FileText,
  MessageSquare,
  Calendar,
  Receipt,
  HelpCircle,
  Building2,
  Users,
  Bell,
  ShieldCheck,
  Workflow,
  UserPlus,
  Megaphone,
  Activity,
  ClipboardList,
  BarChart3,
  UsersRound,
  Settings,
  UserCog,
  ArrowLeftRight,
  MapPinned,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  key: string
  label: string
  to: string
  icon: LucideIcon
  // Optional section label — used by AdminLayout to visually group the
  // sidebar. Items with the same section render under a single heading;
  // items without a section render at the top with no heading.
  section?: string
}

export const portalNav: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '', icon: Home },
  { key: 'services', label: 'My Services', to: 'services', icon: Layers },
  { key: 'matters', label: 'Projects & Matters', to: 'matters', icon: Scale },
  { key: 'tasks', label: 'Tasks', to: 'tasks', icon: CheckSquare },
  { key: 'documents', label: 'Documents', to: 'documents', icon: FileText },
  { key: 'messages', label: 'Messages', to: 'messages', icon: MessageSquare },
  { key: 'calendar', label: 'Calendar', to: 'calendar', icon: Calendar },
  { key: 'billing', label: 'Billing', to: 'billing', icon: Receipt },
  { key: 'support', label: 'Support', to: 'support', icon: HelpCircle },
  { key: 'business-profile', label: 'Business Profile', to: 'business-profile', icon: Building2 },
  { key: 'my-team', label: 'My Team', to: 'my-team', icon: Users },
  { key: 'notifications', label: 'Notifications', to: 'notifications', icon: Bell },
  { key: 'security', label: 'Security', to: 'security', icon: ShieldCheck },
]

export const portalHiddenRoutes = ['planned-calls', 'funding', 'property-management', 'tax-filings'] as const

export const adminNav: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '', icon: Home },

  { key: 'pipelines', label: 'Pipelines', to: 'pipelines', icon: Workflow, section: 'Workspace' },
  { key: 'inquiries', label: 'Leads & Prospects', to: 'inquiries', icon: UserPlus, section: 'Workspace' },
  { key: 'clients', label: 'Clients', to: 'clients', icon: Users, section: 'Workspace' },

  { key: 'messages', label: 'Messages', to: 'messages', icon: MessageSquare, section: 'Communication' },
  { key: 'communications', label: 'Communications', to: 'communications', icon: Megaphone, section: 'Communication' },

  { key: 'field-work', label: 'Field & RON', to: 'field-work', icon: MapPinned, section: 'Operations' },
  { key: 'activity', label: 'Activity', to: 'activity', icon: Activity, section: 'Operations' },
  { key: 'audit-log', label: 'Audit Log', to: 'audit-log', icon: ClipboardList, section: 'Operations' },

  { key: 'reports', label: 'Reporting Center', to: 'reports', icon: BarChart3, section: 'Insights' },

  { key: 'employees', label: 'Team & Vendors', to: 'employees', icon: UsersRound, section: 'Administration' },
  { key: 'users', label: 'Users', to: 'users', icon: UserCog, section: 'Administration' },
  { key: 'assignments', label: 'Assignments', to: 'assignments', icon: ArrowLeftRight, section: 'Administration' },
  { key: 'settings', label: 'Settings', to: 'settings', icon: Settings, section: 'Administration' },
]
