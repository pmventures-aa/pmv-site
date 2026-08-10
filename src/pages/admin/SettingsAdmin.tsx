import { useState } from 'react'
import { PageIntro, NoAccess } from '../../components/admin/ui'
import { useCapabilities } from '../../lib/capabilities'
import { ThemeToggle } from '../../components/ThemeToggle'
import PermanentDeletions from './PermanentDeletions'
import GeneralSettings from './settings/GeneralSettings'
import ServiceCatalogSettings from './settings/ServiceCatalogSettings'
import ServiceOfferingsSettings from './settings/ServiceOfferingsSettings'
import StaffSettings from './settings/StaffSettings'
import NotificationSettings from './settings/NotificationSettings'

const TABS = [
  { key: 'general', label: 'General' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'catalog', label: 'Service Catalog' },
  { key: 'offerings', label: 'Service Offerings' },
  { key: 'staff', label: 'Staff & Permissions' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'deletions', label: 'Permanent Deletions' },
] as const

type TabKey = (typeof TABS)[number]['key']

function AppearanceSettings() {
  return (
    <div className="max-w-2xl rounded-xl border border-white/10 bg-white/[.025] p-5 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-500">Workspace preference</p>
        <h2 className="mt-2 text-lg font-semibold text-white">Appearance</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-400">
          Choose how Pinnacle HQ appears on this device. This is a personal workspace preference and does not change the client-facing site.
        </p>
      </div>
      <div className="mt-5 border-t border-white/10 pt-5">
        <ThemeToggle />
      </div>
    </div>
  )
}

export default function SettingsAdmin() {
  const [tab, setTab] = useState<TabKey>('general')
  const caps = useCapabilities()
  const visibleTabs = TABS.filter((item) => item.key !== 'deletions' || caps.is_owner)

  return (
    <div>
      <PageIntro
        kicker="Administration"
        title="Settings"
        subtitle="Configure your workspace, services, team controls, notifications, and firm-wide operating preferences."
      />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-white/10">
        {visibleTabs.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              tab === item.key ? 'border-gold text-white' : 'border-transparent text-slate-500 hover:text-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'general' && <GeneralSettings />}
      {tab === 'appearance' && <AppearanceSettings />}
      {tab === 'catalog' && <ServiceCatalogSettings />}
      {tab === 'offerings' && <ServiceOfferingsSettings />}
      {tab === 'staff' && <StaffSettings />}
      {tab === 'notifications' && <NotificationSettings />}
      {tab === 'deletions' && (caps.is_owner ? <PermanentDeletions /> : <NoAccess label="Permanent Deletions" />)}
    </div>
  )
}
