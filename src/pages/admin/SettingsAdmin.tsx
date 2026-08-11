import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BriefcaseBusiness, Building2, ChevronRight, Palette, Search, Settings2, ShieldCheck, SlidersHorizontal, Trash2, Users } from 'lucide-react'
import { PageIntro, NoAccess, Panel, inputCls } from '../../components/admin/ui'
import { useCapabilities } from '../../lib/capabilities'
import { useAppPath } from '../../lib/basePath'
import { ThemeToggle } from '../../components/ThemeToggle'
import PermanentDeletions from './PermanentDeletions'
import GeneralSettings from './settings/GeneralSettings'
import ServiceCatalogSettings from './settings/ServiceCatalogSettings'
import ServiceOfferingsSettings from './settings/ServiceOfferingsSettings'
import StaffSettings from './settings/StaffSettings'
import NotificationSettings from './settings/NotificationSettings'

const TABS = [
  { key: 'general', label: 'General', short: 'Firm identity, contact details, communications, and compliance copy.', icon: Building2, terms: 'business firm address phone hours marketing compliance application' },
  { key: 'appearance', label: 'Appearance', short: 'Personal HQ display preferences for this device.', icon: Palette, terms: 'theme dark light workspace display' },
  { key: 'catalog', label: 'Service Catalog', short: 'Define service structure, intake configuration, and client-facing service data.', icon: BriefcaseBusiness, terms: 'services catalog intake applications client offerings' },
  { key: 'offerings', label: 'Service Offerings', short: 'Control which services are available and how they are presented.', icon: SlidersHorizontal, terms: 'services offerings enabled availability pricing scope' },
  { key: 'staff', label: 'Network Access & Permissions', short: 'Manage internal access, provider roles, responsibilities, and permissions.', icon: Users, terms: 'staff users roles access permissions team providers professionals network' },
  { key: 'notifications', label: 'Notifications', short: 'Choose how operational events reach you across HQ, email, desktop, and sound.', icon: Bell, terms: 'notifications email desktop sound alerts events' },
  { key: 'deletions', label: 'Permanent Deletions', short: 'Owner-only irreversible record deletion and impact review.', icon: Trash2, terms: 'delete danger purge permanent owner archive' },
] as const

type TabKey = (typeof TABS)[number]['key']

function AppearanceSettings() {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Panel>
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold/80">Workspace Preference</p>
        <h2 className="mt-2 text-xl font-extrabold tracking-tight text-white">Appearance</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Choose how Pinnacle HQ appears on this device. This preference is personal and does not alter the public site or another team member's workspace.</p>
        <div className="mt-6 rounded-xl border border-white/[.08] bg-white/[.02] p-4">
          <ThemeToggle />
        </div>
      </Panel>
      <Panel>
        <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Display Guidance</p>
        <ul className="mt-4 space-y-3 text-sm leading-5 text-slate-400">
          <li><strong className="text-slate-200">Dark</strong> is optimized for extended HQ sessions.</li>
          <li><strong className="text-slate-200">Light</strong> improves contrast in bright environments.</li>
          <li>Your selection is stored locally on this device.</li>
        </ul>
      </Panel>
    </div>
  )
}

export default function SettingsAdmin() {
  const caps = useCapabilities()
  const p = useAppPath()
  const [tab, setTabState] = useState<TabKey>(() => {
    if (typeof window === 'undefined') return 'general'
    const stored = window.localStorage.getItem('pmv_settings_tab') as TabKey | null
    return TABS.some(item => item.key === stored) ? stored! : 'general'
  })
  const [query, setQuery] = useState('')
  const visibleTabs = useMemo(() => TABS.filter((item) => item.key !== 'deletions' || caps.is_owner), [caps.is_owner])
  const matchingTabs = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return visibleTabs
    return visibleTabs.filter(item => `${item.label} ${item.short} ${item.terms}`.toLowerCase().includes(needle))
  }, [query, visibleTabs])
  const current = visibleTabs.find(item => item.key === tab) || visibleTabs[0]

  function setTab(next: TabKey) {
    setTabState(next)
    if (typeof window !== 'undefined') window.localStorage.setItem('pmv_settings_tab', next)
  }

  return (
    <div>
      <PageIntro kicker="Administration" title="Settings" subtitle="Manage firm configuration, services, access, notifications, and workspace preferences from one governed control center." />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Access Level</p><p className="mt-2 flex items-center gap-2 text-sm font-extrabold text-white"><ShieldCheck size={16} className="text-emerald-300" />{caps.is_owner ? 'Owner Controls' : 'Authorized Settings'}</p></div>
        <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Configuration Areas</p><p className="mt-2 text-2xl font-extrabold text-white">{visibleTabs.length}</p></div>
        <Link to={p('security')} className="group rounded-xl border border-white/[.08] bg-white/[.02] p-4 transition hover:border-gold/25 hover:bg-gold/[.025]"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Security</p><p className="mt-2 flex items-center justify-between text-sm font-extrabold text-white">Sessions & Access <ChevronRight size={15} className="text-gold transition group-hover:translate-x-0.5" /></p></Link>
        <Link to={p('automation')} className="group rounded-xl border border-white/[.08] bg-white/[.02] p-4 transition hover:border-gold/25 hover:bg-gold/[.025]"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Operations</p><p className="mt-2 flex items-center justify-between text-sm font-extrabold text-white">Automation Center <ChevronRight size={15} className="text-gold transition group-hover:translate-x-0.5" /></p></Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="rounded-xl border border-white/[.08] bg-white/[.018] p-3">
            <div className="relative mb-3">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input className={`${inputCls} !min-h-10 pl-9`} value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a setting" aria-label="Search settings" />
            </div>

            <select className={`${inputCls} mb-3 xl:hidden`} value={tab} onChange={e => setTab(e.target.value as TabKey)} aria-label="Settings section">
              {visibleTabs.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>

            <nav className="hidden space-y-1 xl:block" aria-label="Settings sections">
              {matchingTabs.map(item => {
                const Icon = item.icon
                const active = item.key === tab
                return <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`group w-full rounded-lg px-3 py-3 text-left transition ${active ? 'bg-gold/[.08] ring-1 ring-gold/20' : 'hover:bg-white/[.03]'}`}>
                  <div className="flex items-start gap-3"><span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${active ? 'bg-gold/10 text-gold' : 'bg-white/[.025] text-slate-500 group-hover:text-slate-300'}`}><Icon size={16} /></span><div className="min-w-0"><p className={`text-sm font-extrabold ${active ? 'text-white' : 'text-slate-300'}`}>{item.label}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">{item.short}</p></div></div>
                </button>
              })}
              {matchingTabs.length === 0 && <p className="px-3 py-6 text-center text-xs text-slate-500">No settings sections match your search.</p>}
            </nav>
          </div>
          <div className="mt-3 rounded-xl border border-white/[.07] bg-white/[.012] p-4 text-xs leading-5 text-slate-500"><strong className="block text-slate-300">Governance note</strong>Firm-wide changes can affect client intake, communications, team access, or generated documents. Review scope before saving production configuration.</div>
        </aside>

        <section className="min-w-0">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-white/[.08] bg-gradient-to-r from-white/[.035] to-transparent p-4 sm:p-5">
            <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-gold/[.08] text-gold"><current.icon size={19} /></span><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold/75">Current Configuration Area</p><h2 className="mt-1 text-xl font-extrabold tracking-tight text-white">{current.label}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{current.short}</p></div></div>
            <div className="flex items-center gap-2 rounded-full border border-white/[.08] bg-white/[.025] px-3 py-1.5 text-[11px] font-bold text-slate-400"><Settings2 size={13} />Production Configuration</div>
          </div>

          {tab === 'general' && <GeneralSettings />}
          {tab === 'appearance' && <AppearanceSettings />}
          {tab === 'catalog' && <ServiceCatalogSettings />}
          {tab === 'offerings' && <ServiceOfferingsSettings />}
          {tab === 'staff' && <StaffSettings />}
          {tab === 'notifications' && <NotificationSettings />}
          {tab === 'deletions' && (caps.is_owner ? <div className="rounded-xl border border-rose-400/20 bg-rose-400/[.025] p-1"><div className="px-4 pb-2 pt-4"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-rose-300">Danger Zone</p><p className="mt-1 text-sm text-slate-400">Permanent deletion is restricted to the owner and requires dependency review before execution.</p></div><PermanentDeletions /></div> : <NoAccess label="Permanent Deletions" />)}
        </section>
      </div>
    </div>
  )
}
