import {
  Home, Layers, Scale, CheckSquare, FileText, MessageSquare, Calendar, Receipt, HelpCircle, Building2, Users, Bell, ShieldCheck,
  Workflow, UserPlus, Megaphone, Activity, ClipboardList, BarChart3, UsersRound, Settings, UserCog, ArrowLeftRight, MapPinned, Send,
  BookOpen, Bot, Gauge, PenTool, Wrench, type LucideIcon,
} from 'lucide-react'

export interface NavItem { key:string;label:string;to:string;icon:LucideIcon;section?:string }

export const portalNav: NavItem[] = [
  {key:'dashboard',label:'Command Center',to:'',icon:Home},
  {key:'support',label:'Requests & Cases',to:'support',icon:HelpCircle},
  {key:'documents',label:'Documents',to:'documents',icon:FileText},
  {key:'messages',label:'Messages',to:'messages',icon:MessageSquare},
  {key:'billing',label:'Billing',to:'billing',icon:Receipt},
  {key:'services',label:'Services',to:'services',icon:Layers},
]
export function clientPortalNav(serviceKeys: string[]): NavItem[] {
  const keys = new Set(serviceKeys)
  const contextual: NavItem[] = []
  if (keys.has('property_management') || keys.has('property_inspections')) contextual.push({key:'properties',label:'My Properties',to:'property-management',icon:Building2,section:'Your work'})
  if (keys.has('funding')) contextual.push({key:'funding',label:'Funding',to:'funding',icon:Gauge,section:'Your work'})
  if ([...keys].some((key) => ['admin_support','document_courier','mobile_notary'].includes(key))) contextual.push({key:'work',label:'Projects & Tasks',to:'matters',icon:Wrench,section:'Your work'})
  return [portalNav[0], ...contextual, ...portalNav.slice(1)]
}
export const portalHiddenRoutes=['planned-calls','funding','property-management','tax-filings'] as const

export const adminNav: NavItem[] = [
  {key:'dashboard',label:'Overview',to:'',icon:Home},
  {key:'pipelines',label:'Pipeline',to:'pipelines',icon:Workflow,section:'Revenue'},{key:'inquiries',label:'Leads',to:'inquiries',icon:UserPlus,section:'Revenue'},{key:'clients',label:'Clients',to:'clients',icon:Users,section:'Revenue'},
  {key:'messages',label:'Inbox',to:'messages',icon:MessageSquare,section:'Operations'},{key:'communications',label:'Email Center',to:'communications',icon:Megaphone,section:'Operations'},{key:'automation-center',label:'Automation Center',to:'automation-center',icon:Bot,section:'Operations'},{key:'document-center',label:'Document Hub',to:'document-center',icon:FileText,section:'Operations'},{key:'esign-platform',label:'E-Signature Platform',to:'esign-platform',icon:PenTool,section:'Operations'},{key:'community-documents',label:'Community Docs',to:'community-documents',icon:BookOpen,section:'Operations'},{key:'envelopes',label:'Envelope Workspace',to:'envelopes',icon:Send,section:'Operations'},{key:'field-work',label:'Field Work & RON',to:'field-work',icon:MapPinned,section:'Operations'},
  {key:'management',label:'Management',to:'management',icon:Gauge,section:'Intelligence'},{key:'reports',label:'Reports',to:'reports',icon:BarChart3,section:'Intelligence'},{key:'activity',label:'Activity',to:'activity',icon:Activity,section:'Intelligence'},{key:'audit-log',label:'Audit Log',to:'audit-log',icon:ClipboardList,section:'Intelligence'},
  {key:'security-center',label:'Security Center',to:'security-center',icon:ShieldCheck,section:'Access'},{key:'employees',label:'Team & Vendors',to:'employees',icon:UsersRound,section:'Access'},{key:'users',label:'Users',to:'users',icon:UserCog,section:'Access'},{key:'assignments',label:'Assignments',to:'assignments',icon:ArrowLeftRight,section:'Access'},{key:'settings',label:'Settings',to:'settings',icon:Settings,section:'Access'},
]
