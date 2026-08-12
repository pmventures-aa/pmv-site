import {
  Home, Layers, FileText, MessageSquare, Calendar, Receipt, HelpCircle, Building2, Users,
  Workflow, UserPlus, Activity, ClipboardList, BarChart3, UsersRound, Settings, UserCog, ArrowLeftRight, MapPinned, Send,
  BookOpen, Bot, Gauge, PenTool, Wrench, ShieldCheck, type LucideIcon,
} from 'lucide-react'

export interface NavItem { key:string;label:string;to:string;icon:LucideIcon;section?:string }

// Client navigation is a real sidebar, not a tile directory. Home is a
// briefing of what needs attention; these destinations are how clients
// actually move around the portal.
export const portalNav: NavItem[] = [
  {key:'dashboard',label:'Home',to:'',icon:Home},
  {key:'support',label:'Requests',to:'support',icon:HelpCircle,section:'Your work'},
  {key:'documents',label:'Documents',to:'documents',icon:FileText,section:'Your work'},
  {key:'messages',label:'Messages',to:'messages',icon:MessageSquare,section:'Your work'},
  {key:'calendar',label:'Calendar',to:'calendar',icon:Calendar,section:'Your work'},
  {key:'billing',label:'Billing',to:'billing',icon:Receipt,section:'Account'},
  {key:'services',label:'Services',to:'services',icon:Layers,section:'Account'},
]

export const portalMobilePrimary = ['dashboard', 'support', 'documents', 'messages'] as const

// Persona extras only appear when the account actually uses that work.
export function clientPortalNav(serviceKeys: string[]): NavItem[] {
  const keys = new Set(serviceKeys)
  const extras: NavItem[] = []
  if (keys.has('property_management') || keys.has('property_inspections')) extras.push({key:'properties',label:'My Properties',to:'property-management',icon:Building2,section:'Your work'})
  if (keys.has('funding')) extras.push({key:'funding',label:'Funding',to:'funding',icon:Gauge,section:'Your work'})
  if ([...keys].some((key) => ['admin_support','document_courier','mobile_notary'].includes(key))) extras.push({key:'work',label:'Projects',to:'matters',icon:Wrench,section:'Your work'})
  const home = portalNav[0]
  const work = portalNav.filter((item) => item.section === 'Your work')
  const account = portalNav.filter((item) => item.section === 'Account')
  return [home, ...work, ...extras, ...account]
}

export const portalHiddenRoutes=['planned-calls','funding','property-management','tax-filings'] as const

export const adminNav: NavItem[] = [
  {key:'dashboard',label:'Overview',to:'',icon:Home},
  {key:'pipelines',label:'Pipeline',to:'pipelines',icon:Workflow,section:'Revenue'},{key:'inquiries',label:'Leads',to:'inquiries',icon:UserPlus,section:'Revenue'},{key:'clients',label:'Clients',to:'clients',icon:Users,section:'Revenue'},
  {key:'messages',label:'Inbox',to:'messages',icon:MessageSquare,section:'Operations'},{key:'cases',label:'Cases & SLA',to:'cases',icon:HelpCircle,section:'Operations'},{key:'automation-center',label:'Automation Center',to:'automation-center',icon:Bot,section:'Operations'},{key:'document-center',label:'Document Hub',to:'document-center',icon:FileText,section:'Operations'},{key:'esign-platform',label:'E-Signature Platform',to:'esign-platform',icon:PenTool,section:'Operations'},{key:'community-documents',label:'Community Docs',to:'community-documents',icon:BookOpen,section:'Operations'},{key:'envelopes',label:'Signed Documents',to:'envelopes',icon:Send,section:'Operations'},{key:'field-work',label:'Field Work & RON',to:'field-work',icon:MapPinned,section:'Operations'},
  {key:'management',label:'Management',to:'management',icon:Gauge,section:'Intelligence'},{key:'reports',label:'Reports',to:'reports',icon:BarChart3,section:'Intelligence'},{key:'activity',label:'Activity',to:'activity',icon:Activity,section:'Intelligence'},{key:'audit-log',label:'Audit Log',to:'audit-log',icon:ClipboardList,section:'Intelligence'},
  {key:'public-funnel',label:'Public Funnel',to:'public-funnel',icon:Wrench,section:'Intelligence'},
  {key:'security-center',label:'Security Center',to:'security-center',icon:ShieldCheck,section:'Access'},{key:'network',label:'Network & Dispatch',to:'network',icon:UsersRound,section:'Access'},{key:'users',label:'Users',to:'users',icon:UserCog,section:'Access'},{key:'assignments',label:'Assignments',to:'assignments',icon:ArrowLeftRight,section:'Access'},{key:'settings',label:'Settings',to:'settings',icon:Settings,section:'Access'},
]
