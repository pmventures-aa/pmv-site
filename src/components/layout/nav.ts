import {
  Home, Layers, FileText, MessageSquare, Calendar, Receipt, HelpCircle, Building2, Users,
  Workflow, UserPlus, Activity, ClipboardList, BarChart3, UsersRound, Settings, UserCog, ArrowLeftRight, MapPinned,
  Bot, Gauge, ShieldCheck, Globe, Wrench, MailPlus, KeyRound, type LucideIcon,
} from 'lucide-react'
import { clientWorkspace, type OperatingWorld } from '../../lib/workspace'

export interface NavItem { key:string;label:string;to:string;icon:LucideIcon;section?:string }

export const portalNav: NavItem[] = [
  {key:'dashboard',label:'Home',to:'',icon:Home},
  {key:'work',label:'Work',to:'matters',icon:Wrench,section:'Your work'},
  {key:'messages',label:'Messages',to:'messages',icon:MessageSquare,section:'Your work'},
  {key:'documents',label:'Documents',to:'documents',icon:FileText,section:'Your work'},
  {key:'support',label:'Requests',to:'support',icon:HelpCircle,section:'Your work'},
  {key:'calendar',label:'Calendar',to:'calendar',icon:Calendar,section:'Your work'},
  {key:'billing',label:'Billing',to:'billing',icon:Receipt,section:'Account'},
  {key:'services',label:'Services',to:'services',icon:Layers,section:'Account'},
]

export const portalMobilePrimary = ['dashboard', 'work', 'messages', 'documents'] as const

export function clientPortalNav(serviceKeys: string[]): NavItem[] {
  const keys = new Set(serviceKeys)
  const extras: NavItem[] = []
  if (keys.has('property_management') || keys.has('property_inspections')) {
    extras.push({key:'properties',label:'Properties',to:'property-management',icon:Building2,section:'Your work'})
  }
  if (keys.has('funding')) extras.push({key:'funding',label:'Funding',to:'funding',icon:Gauge,section:'Your work'})

  const home = portalNav[0]
  const work = portalNav.filter((item) => item.section === 'Your work')
  const account = portalNav.filter((item) => item.section === 'Account')
  const properties = extras.filter((item) => item.key === 'properties')
  const funding = extras.filter((item) => item.key === 'funding')
  return [home, work[0], ...properties, ...funding, ...work.slice(1), ...account]
}

export function clientMobilePrimary(serviceKeys: string[]): string[] {
  return clientWorkspace(serviceKeys).mobilePrimary
}

export const portalHiddenRoutes=['planned-calls','funding','property-management','tax-filings'] as const

export const adminNav: NavItem[] = [
  {key:'dashboard',label:'Overview',to:'',icon:Home},
  {key:'pipelines',label:'Pipeline',to:'pipelines',icon:Workflow,section:'Revenue'},
  {key:'quotes',label:'Quotes',to:'quotes',icon:FileText,section:'Revenue'},
  {key:'invoices',label:'Invoices',to:'invoices',icon:Receipt,section:'Revenue'},
  {key:'clients',label:'Clients',to:'clients',icon:Users,section:'Revenue'},
  {key:'inquiries',label:'Leads',to:'inquiries',icon:UserPlus,section:'Revenue'},
  {key:'messages',label:'Messages',to:'messages',icon:MessageSquare,section:'Operations'},
  {key:'cases',label:'Cases & SLA',to:'cases',icon:HelpCircle,section:'Operations'},
  {key:'field-work',label:'Field Work & RON',to:'field-work',icon:MapPinned,section:'Operations'},
  {key:'service-assignments',label:'Service Assignments',to:'service-assignments',icon:Wrench,section:'Operations'},
  {key:'document-center',label:'Documents',to:'document-center',icon:FileText,section:'Operations'},
  {key:'automation-center',label:'Automation Center',to:'automation-center',icon:Bot,section:'Operations'},
  {key:'management',label:'Management',to:'management',icon:Gauge,section:'Intelligence'},
  {key:'reports',label:'Reports',to:'reports',icon:BarChart3,section:'Intelligence'},
  {key:'activity',label:'Activity',to:'activity',icon:Activity,section:'Intelligence'},
  {key:'security-center',label:'Security Center',to:'security-center',icon:ShieldCheck,section:'Administration'},
  {key:'audit-log',label:'Audit Log',to:'audit-log',icon:ClipboardList,section:'Administration'},
  {key:'network',label:'Network & Dispatch',to:'network',icon:UsersRound,section:'Administration'},
  {key:'users',label:'Users',to:'users',icon:UserCog,section:'Administration'},
  {key:'assignments',label:'Staff Coverage',to:'assignments',icon:ArrowLeftRight,section:'Administration'},
  {key:'invitations',label:'Invitations',to:'invitations',icon:MailPlus,section:'Administration'},
  {key:'roles',label:'Roles & Permissions',to:'roles',icon:KeyRound,section:'Administration'},
  {key:'public-funnel',label:'Public Website',to:'public-funnel',icon:Globe,section:'Administration'},
  {key:'settings',label:'Settings',to:'settings',icon:Settings,section:'Administration'},
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
