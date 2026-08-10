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
  Send,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  key: string
  label: string
  to: string
  icon: LucideIcon
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
  { key: 'dashboard', label: 'Overview', to: '', icon: Home },

  { key: 'pipelines', label: 'Pipeline', to: 'pipelines', icon: Workflow, section: 'Revenue' },
  { key: 'inquiries', label: 'Leads', to: 'inquiries', icon: UserPlus, section: 'Revenue' },
  { key: 'clients', label: 'Clients', to: 'clients', icon: Users, section: 'Revenue' },

  { key: 'messages', label: 'Inbox', to: 'messages', icon: MessageSquare, section: 'Operations' },
  { key: 'communications', label: 'Campaigns', to: 'communications', icon: Megaphone, section: 'Operations' },
  { key: 'document-center', label: 'Document Hub', to: 'document-center', icon: FileText, section: 'Operations' },
  { key: 'envelopes', label: 'Envelopes', to: 'envelopes', icon: Send, section: 'Operations' },
  { key: 'field-work', label: 'Field Work & RON', to: 'field-work', icon: MapPinned, section: 'Operations' },

  { key: 'reports', label: 'Reports', to: 'reports', icon: BarChart3, section: 'Intelligence' },
  { key: 'activity', label: 'Activity', to: 'activity', icon: Activity, section: 'Intelligence' },
  { key: 'audit-log', label: 'Audit Log', to: 'audit-log', icon: ClipboardList, section: 'Intelligence' },

  { key: 'employees', label: 'Team & Vendors', to: 'employees', icon: UsersRound, section: 'Access' },
  { key: 'users', label: 'Users', to: 'users', icon: UserCog, section: 'Access' },
  { key: 'assignments', label: 'Assignments', to: 'assignments', icon: ArrowLeftRight, section: 'Access' },
  { key: 'settings', label: 'Settings', to: 'settings', icon: Settings, section: 'Access' },
]
