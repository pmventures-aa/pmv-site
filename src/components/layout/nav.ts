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
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  key: string
  label: string
  to: string
  icon: LucideIcon
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
  { key: 'pipelines', label: 'Pipelines', to: 'pipelines', icon: Workflow },
  { key: 'inquiries', label: 'Leads & Prospects', to: 'inquiries', icon: UserPlus },
  { key: 'clients', label: 'Clients', to: 'clients', icon: Users },
  { key: 'messages', label: 'Messages', to: 'messages', icon: MessageSquare },
  { key: 'communications', label: 'Communications', to: 'communications', icon: Megaphone },
  { key: 'activity', label: 'Activity', to: 'activity', icon: Activity },
  { key: 'audit-log', label: 'Audit Log', to: 'audit-log', icon: ClipboardList },
  { key: 'reports', label: 'Reporting Center', to: 'reports', icon: BarChart3 },
  { key: 'employees', label: 'Team & Vendors', to: 'employees', icon: UsersRound },
  { key: 'users', label: 'Users', to: 'users', icon: UserCog },
  { key: 'assignments', label: 'Assignments', to: 'assignments', icon: ArrowLeftRight },
  { key: 'settings', label: 'Settings', to: 'settings', icon: Settings },
]
