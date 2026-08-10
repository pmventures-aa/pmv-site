import type { SVGProps } from 'react'

export type IconName =
  | 'home' | 'services' | 'briefcase' | 'check' | 'file' | 'mail' | 'calendar' | 'billing' | 'support'
  | 'building' | 'team' | 'bell' | 'shield' | 'pipeline' | 'leads' | 'clients' | 'messages' | 'communications'
  | 'activity' | 'assignments' | 'reports' | 'audit' | 'users' | 'settings' | 'refresh' | 'search' | 'menu'
  | 'close' | 'chevronLeft' | 'chevronRight' | 'chevronDown' | 'plus' | 'send' | 'edit' | 'arrowRight' | 'sparkles'

const paths: Record<IconName, JSX.Element> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></>,
  services: <><path d="M12 3v18"/><path d="M3 12h18"/><path d="m5.5 5.5 13 13"/><path d="m18.5 5.5-13 13"/></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/><path d="M9 13h6M9 17h6"/></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
  billing: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/><path d="M15.5 16.5h2"/></>,
  support: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8"/><path d="M12 17h.01"/></>,
  building: <><path d="M4 21V5l8-3 8 3v16"/><path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h.01M16 16h.01"/><path d="M10 21v-5h4v5"/></>,
  team: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M14 15.5a4.5 4.5 0 0 1 6.5 4"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  shield: <><path d="M12 3 5 6v5c0 5 3.4 8.6 7 10 3.6-1.4 7-5 7-10V6z"/><path d="m9 12 2 2 4-4"/></>,
  pipeline: <><path d="M4 5h16M7 10h10M10 15h4M12 15v5"/></>,
  leads: <><circle cx="9" cy="9" r="4"/><path d="M3 21a6 6 0 0 1 12 0"/><path d="M18 8v6M15 11h6"/></>,
  clients: <><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2.5 20a5.5 5.5 0 0 1 11 0M10.5 20a5.5 5.5 0 0 1 11 0"/></>,
  messages: <><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></>,
  communications: <><path d="M4 12a8 8 0 0 1 16 0"/><path d="M4 12v5a2 2 0 0 0 2 2h2v-7H4ZM20 12v5a2 2 0 0 1-2 2h-2v-7h4Z"/><path d="M16 21h-4"/></>,
  activity: <><path d="M3 12h4l2.5-6 4 12 2.5-6H21"/></>,
  assignments: <><path d="M7 7h10M7 17h10"/><path d="m14 4 3 3-3 3M10 14l-3 3 3 3"/></>,
  reports: <><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7"/></>,
  audit: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h6M8 16h4"/><circle cx="17" cy="16" r="2"/></>,
  users: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2 5.3"/><path d="M20 4v7h-7"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  chevronLeft: <path d="m15 18-6-6 6-6"/>,
  chevronRight: <path d="m9 18 6-6-6-6"/>,
  chevronDown: <path d="m6 9 6 6 6-6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  send: <><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></>,
  edit: <><path d="M4 20h4L20 8l-4-4L4 16z"/><path d="m14 6 4 4"/></>,
  arrowRight: <><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></>,
  sparkles: <><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></>,
}

export function Icon({ name, size = 20, strokeWidth = 1.8, ...props }: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}
