import {
  Home, Layers, FileText, MessageSquare, Mails, Calendar, Receipt, HelpCircle, Building2, Users,
  Workflow, UserPlus, Activity, ClipboardList, BarChart3, UsersRound, Settings, UserCog, ArrowLeftRight, MapPinned,
  Bot, Gauge, ShieldCheck, Globe, Wrench, MailPlus, KeyRound, ClipboardCheck, DoorOpen, Video, Sparkles, Send, HandCoins, CalendarClock, type LucideIcon,
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
  if (keys.has('str_turnover')) {
    extras.push({key:'turnovers',label:'Turnovers',to:'str/turnovers',icon:ClipboardCheck,section:'Your work'})
  }
  // Cleaning customers manage their cleanings, completion reports, and recurring
  // service here, and keep their property details on file. Shown for anyone with
  // a property-related relationship.
  if (keys.has('property_management') || keys.has('property_inspections') || keys.has('str_turnover')) {
    extras.push({key:'cleanings',label:'Cleanings',to:'cleanings',icon:Sparkles,section:'Your work'})
    extras.push({key:'cleaning-properties',label:'My Properties',to:'cleaning-properties',icon:Building2,section:'Your work'})
  }
  if (keys.has('funding')) extras.push({key:'funding',label:'Funding',to:'funding',icon:Gauge,section:'Your work'})

  const home = portalNav[0]
  const work = portalNav.filter((item) => item.section === 'Your work')
  const account = portalNav.filter((item) => item.section === 'Account')
  const properties = extras.filter((item) => item.key === 'properties')
  const turnovers = extras.filter((item) => item.key === 'turnovers')
  const cleanings = extras.filter((item) => item.key === 'cleanings')
  const cleaningProps = extras.filter((item) => item.key === 'cleaning-properties')
  const funding = extras.filter((item) => item.key === 'funding')
  return [home, work[0], ...properties, ...turnovers, ...cleanings, ...cleaningProps, ...funding, ...work.slice(1), ...account]
}

export function clientMobilePrimary(serviceKeys: string[]): string[] {
  return clientWorkspace(serviceKeys).mobilePrimary
}

export const portalHiddenRoutes=['planned-calls','funding','property-management','tax-filings'] as const

// HQ navigation, consolidated into six hubs that match how staff think about
// the work, so the sidebar reads as a handful of clear destinations instead of
// two dozen flat links. Each `section` renders as a collapsible hub; items in a
// hub must stay contiguous for the grouping to work.
//   Revenue        -> anything that becomes a signed engagement or paid
//                     invoice: pipeline, quotes, invoices, clients, leads.
//   Service        -> the client-facing surface: messages, support cases, and
//                     documents.
//   Delivery       -> getting the work done: scheduling plus field dispatch,
//                     RON, STR turnovers, and service assignments.
//   People         -> everyone in the system: the provider network, staff
//                     users, staff coverage, invitations, and access roles.
//   Intelligence   -> automation, reporting, activity, analytics.
//   Administration -> security, audit, public website, and settings.
export const adminNav: NavItem[] = [
  {key:'dashboard',label:'Overview',to:'',icon:Home},
  {key:'pipelines',label:'Pipeline',to:'pipelines',icon:Workflow,section:'Revenue'},
  {key:'quotes',label:'Quotes',to:'quotes',icon:FileText,section:'Revenue'},
  {key:'cleaning-pricing',label:'Cleaning Pricing',to:'cleaning-pricing',icon:Sparkles,section:'Revenue'},
  {key:'invoices',label:'Invoices',to:'invoices',icon:Receipt,section:'Revenue'},
  {key:'clients',label:'Clients',to:'clients',icon:Users,section:'Revenue'},
  {key:'inquiries',label:'Leads',to:'inquiries',icon:UserPlus,section:'Revenue'},
  {key:'messages',label:'Messages',to:'messages',icon:MessageSquare,section:'Service'},
  // Email copy is a destination people go to on purpose, not something to
  // find while reading mail. It stays reachable as a Messages tab too.
  {key:'email-templates',label:'Email Templates',to:'email-templates',icon:Mails,section:'Service'},
  {key:'cases',label:'Cases & SLA',to:'cases',icon:HelpCircle,section:'Service'},
  {key:'document-center',label:'Documents',to:'document-center',icon:FileText,section:'Service'},
  {key:'calendar',label:'Calendar',to:'calendar',icon:Calendar,section:'Delivery'},
  {key:'field-work',label:'Field Work',to:'field-work',icon:MapPinned,section:'Delivery'},
  // Remote Online Notarization is a document-signing session, not a
  // property visit. It shares the same field_assignments backend so it can
  // reuse the audit-trail plumbing, but the operational surface is
  // separate and should not share a nav tab with field visits.
  {key:'ron',label:'Remote Notarization',to:'ron',icon:Video,section:'Delivery'},
  // Offers sent to providers before any work exists. Sits next to Field Work
  // because a released proposal becomes exactly one of those assignments.
  {key:'work-proposals',label:'Work Proposals',to:'work-proposals',icon:HandCoins,section:'Delivery'},
  {key:'str-operations',label:'STR Turnovers',to:'str/operations',icon:DoorOpen,section:'Delivery'},
  {key:'cleaning-dispatch',label:'Cleaning Dispatch',to:'cleaning/dispatch',icon:Sparkles,section:'Delivery'},
  {key:'cleaning-mine',label:'My Cleaning Jobs',to:'cleaning/mine',icon:ClipboardCheck,section:'Delivery'},
  {key:'service-assignments',label:'Service Assignments',to:'service-assignments',icon:Wrench,section:'Delivery'},
  {key:'network',label:'Network & Dispatch',to:'network',icon:UsersRound,section:'People'},
  {key:'users',label:'Users',to:'users',icon:UserCog,section:'People'},
  {key:'assignments',label:'Staff Coverage',to:'assignments',icon:ArrowLeftRight,section:'People'},
  {key:'invitations',label:'Invitations',to:'invitations',icon:MailPlus,section:'People'},
  {key:'roles',label:'Roles & Permissions',to:'roles',icon:KeyRound,section:'People'},
  {key:'automation-center',label:'Automation Center',to:'automation-center',icon:Bot,section:'Intelligence'},
  {key:'signup-journey',label:'Signup Journey',to:'signup-journey',icon:Send,section:'Intelligence'},
  {key:'management',label:'Management',to:'management',icon:Gauge,section:'Intelligence'},
  {key:'reports',label:'Reports',to:'reports',icon:BarChart3,section:'Intelligence'},
  {key:'cleaning-reports',label:'Cleaning Reports',to:'cleaning/reports',icon:Sparkles,section:'Intelligence'},
  {key:'activity',label:'Activity',to:'activity',icon:Activity,section:'Intelligence'},
  {key:'security-center',label:'Security Center',to:'security-center',icon:ShieldCheck,section:'Administration'},
  {key:'audit-log',label:'Audit Log',to:'audit-log',icon:ClipboardList,section:'Administration'},
  {key:'public-funnel',label:'Public Website',to:'public-funnel',icon:Globe,section:'Administration'},
  {key:'settings',label:'Settings',to:'settings',icon:Settings,section:'Administration'},
]

export function vendorNavForWorld(world: OperatingWorld): NavItem[] {
  const assignmentLabel = world === 'property'
    ? 'Field assignments'
    : world === 'documents'
      ? 'Signing assignments'
      : 'My assignments'
  const items: NavItem[] = [
    {key:'home',label:'Home',to:'',icon:Home},
    {key:'assignments',label:assignmentLabel,to:'field-work/mine',icon:MapPinned},
    {key:'work-offers',label:'Work offers',to:'work-offers',icon:HandCoins,section:'Work'},
    // A provider tells us when they work. We never read their own calendar.
    {key:'my-availability',label:'My availability',to:'my-availability',icon:CalendarClock,section:'Work'},
    {key:'messages',label:'Inbox',to:'messages',icon:MessageSquare,section:'Work'},
    {key:'security-center',label:'Security',to:'security-center',icon:ShieldCheck,section:'Account'},
  ]
  if (world === 'property') {
    items.splice(1, 0, {key:'str-turnovers',label:'STR Turnovers',to:'str/mine',icon:DoorOpen,section:'Work'})
  }
  return items
}

export const vendorNav: NavItem[] = vendorNavForWorld('general')
