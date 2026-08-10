import { useState } from 'react'
import { PageIntro, NoAccess } from '../../components/admin/ui'
import { useCapabilities } from '../../lib/capabilities'
import PermanentDeletions from './PermanentDeletions'
import GeneralSettings from './settings/GeneralSettings'
import ServiceCatalogSettings from './settings/ServiceCatalogSettings'
import ServiceOfferingsSettings from './settings/ServiceOfferingsSettings'
import StaffSettings from './settings/StaffSettings'
import NotificationSettings from './settings/NotificationSettings'

const TABS = [
  { key: 'general', label: 'General' },
  { key: 'catalog', label: 'Service Catalog' },
  { key: 'offerings', label: 'Service Offerings' },
  { key: 'staff', label: 'Staff & Permissions' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'deletions', label: 'Permanent Deletions' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function SettingsAdmin() {
  const [tab, setTab] = useState<TabKey>('general')
  const caps = useCapabilities()
  const visibleTabs = TABS.filter((item) => item.key !== 'deletions' || caps.is_owner)

  return (
    <div>
      <PageIntro
        kicker="Firm settings"
        title="Settings"
        subtitle="Global configuration for Pinnacle, including client intake, service offerings, pricing, and application template copy."
      />
      <div className="mb-5 flex gap-1.5 overflow-x-auto border-b border-white/10">
        {visibleTabs.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === item.key ? 'border-gold text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'general' && <GeneralSettings />}
      {tab === 'catalog' && <ServiceCatalogSettings />}
      {tab === 'offerings' && <ServiceOfferingsSettings />}
      {tab === 'staff' && <StaffSettings />}
      {tab === 'notifications' && <NotificationSettings />}
      {tab === 'deletions' && (caps.is_owner ? <PermanentDeletions /> : <NoAccess label="Permanent Deletions" />)}
    </div>
  )
}
