import {
  Home, Layers, FileText, MessageSquare, Calendar, Receipt, HelpCircle, Building2, Users,
  Workflow, UserPlus, Activity, ClipboardList, BarChart3, UsersRound, Settings, UserCog, ArrowLeftRight, MapPinned, Send,
  BookOpen, Bot, Gauge, PenTool, Wrench, ShieldCheck, Globe, type LucideIcon,
} from 'lucide-react'
import { clientWorkspace, resolveWorld, type OperatingWorld } from '../../lib/workspace'

export interface NavItem { key:string;label:string;to:string;icon:LucideIcon;section?:string }

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

export function clientPortalNav(serviceKeys: string[]): NavItem[] {
  const keys = new Set(serviceKeys)
  const world = resolveWorld(serviceKeys)
  const extras: NavItem[] = []
  if (keys.has('property_management') || keys.has('property_inspections')) extras.push({key:'properties',label:'Properties',to:'property-management',icon:Building2,section:'Your work'})
  if (keys.has('funding')) extras.push({key:'funding',label:'Funding',to:'funding',icon:Gauge,section:'Your work'})
  if ([...keys].some((key) => ['admin_support','document_courier','mobile_notary'].includes(key)) && world !== 'documents') {
    extras.push({key:'work',label:'Projects',to:'matters',icon:Wrench,section:'Your work'})
  }
  const home = portalNav[0]
  const work = portalNav.filter((item) => item.section === 'Your work')
  const account = portalNav.filter((item) => item.section === 'Account')
  const properties = extras.filter((item) => item.key === 'properties')
  const rest = extras.filter((item) => item.key !== 'properties')
  if (world === 'property') return [home, ...properties, ...work, ...rest, ...account]
  if (world === 'funding') return [home, ...rest.filter((item) => item.key === 'funding'), ...work, ...properties, ...rest.filter((item) => item.key !== 'funding'), ...account]
  return [home, ...work, ...extras, ...account]
}

export function clientMobilePrimary(serviceKeys: string[]): string[] {
  return clientWorkspace(serviceKeys).mobilePrimary
}

export const portalHiddenRoutes=['planned-calls','funding','property-management','tax-filings'] as const

export const adminNav: NavItem[] = [
  {key:'dashboard',label:'Overview',to:'',icon:Home},
  {key:'pipelines',label:'Pipeline',to:'pipelines',icon:Workflow,section:'Revenue'},{key:'quotes',label:'Quotes',to:'quotes',icon:FileText,section:'Revenue'},{key:'clients',label:'Clients',to:'clients',icon:Users,section:'Revenue'},
  {key:'messages',label:'Inbox',to:'messages',icon:MessageSquare,section:'Operations'},{key:'cases',label:'Cases & SLA',to:'cases',icon:HelpCircle,section:'Operations'},{key:'automation-center',label:'Automation Center',to:'automation-center',icon:Bot,section:'Operations'},{key:'document-center',label:'Document Hub',to:'document-center',icon:FileText,section:'Operations'},{key:'esign-platform',label:'E-Signature Platform',to:'esign-platform',icon:PenTool,section:'Operations'},{key:'community-documents',label:'Community Docs',to:'community-documents',icon:BookOpen,section:'Operations'},{key:'envelopes',label:'Signed Documents',to:'envelopes',icon:Send,section:'Operations'},{key:'field-work',label:'Field Work & RON',to:'field-work',icon:MapPinned,section:'Operations'},
  {key:'management',label:'Management',to:'management',icon:Gauge,section:'Intelligence'},{key:'reports',label:'Reports',to:'reports',icon:BarChart3,section:'Intelligence'},{key:'activity',label:'Activity',to:'activity',icon:Activity,section:'Intelligence'},{key:'audit-log',label:'Audit Log',to:'audit-log',icon:ClipboardList,section:'Intelligence'},
  {key:'security-center',label:'Security Center',to:'security-center',icon:ShieldCheck,section:'Administration'},{key:'network',label:'Network & Dispatch',to:'network',icon:UsersRound,section:'Administration'},{key:'users',label:'Users',to:'users',icon:UserCog,section:'Administration'},{key:'assignments',label:'Assignments',to:'assignments',icon:ArrowLeftRight,section:'Administration'},{key:'inquiries',label:'Leads & CRM',to:'inquiries',icon:UserPlus,section:'Administration'},{key:'public-funnel',label:'Website Studio',to:'public-funnel',icon:Globe,section:'Administration'},{key:'settings',label:'Settings',to:'settings',icon:Settings,section:'Administration'},
]

export function vendorNavForWorld(world: OperatingWorld): NavItem[] {
  const assignmentLabel = world === 'property'
    ? 'Field assignments'
    : world === 'documents'
      ? 'Signing assignments'
      : 'My assignments'
  return [
    {key:'assignments',label:assignmentLabel,to:'field-work/mine',icon:MapPinned},
    {key:'messages',label:'Inbox',to:'messages',icon:MessageSquare,section:'Work'},
    {key:'security-center',label:'Security',to:'security-center',icon:ShieldCheck,section:'Account'},
  ]
}

export const vendorNav: NavItem[] = vendorNavForWorld('general')
