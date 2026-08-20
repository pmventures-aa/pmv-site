import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { inputCls, btnPrimary } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { DEFAULT_CLEANING_CONFIG, type CleaningPricingConfig } from '../../../shared/cleaningPricing'

// Dollar <-> cents helpers for the money inputs.
const toDollars = (cents: number | null) => (cents == null ? '' : (cents / 100).toString())
const toCents = (dollars: string): number | null => {
  const trimmed = dollars.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

export default function CleaningPricingAdmin() {
  const [config, setConfig] = useState<CleaningPricingConfig | null>(null)
  const [version, setVersion] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Only one service's tier grid shows at a time - the four service panels were
  // the page's biggest space hog, so they collapse into a single tabbed panel.
  const [activeService, setActiveService] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ version: number; config: CleaningPricingConfig }>('/admin/cleaning/pricing-config')
      setConfig(res.config)
      setVersion(res.version)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load cleaning pricing.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function update(mutator: (draft: CleaningPricingConfig) => void) {
    setConfig((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      mutator(next)
      return next
    })
  }

  async function save() {
    if (!config) return
    setSaving(true)
    try {
      const res = await api.put<{ version: number; config: CleaningPricingConfig }>('/admin/cleaning/pricing-config', { config })
      setConfig(res.config)
      setVersion(res.version)
      toast.success(`Cleaning pricing saved (version ${res.version}).`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save. Owner access is required.')
    } finally {
      setSaving(false)
    }
  }

  function resetDefaults() {
    setConfig(structuredClone(DEFAULT_CLEANING_CONFIG))
    toast.info('Loaded launch defaults. Review and Save to apply.')
  }

  if (loading && !config) return <p className="p-4 text-sm text-slate-400">Loading cleaning pricing…</p>
  if (!config) return <p className="p-4 text-sm text-slate-400">No pricing configuration available.</p>

  const active = config.services[activeService] ?? config.services[0]
  const activeIndex = config.services[activeService] ? activeService : 0

  return (
    <div className="space-y-4">
      {/* Sticky action bar - Save is always reachable without scrolling. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-navy-950/90 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-gold/80">Cleaning & Turnovers</p>
          <h1 className="text-lg font-semibold text-white">Retail Pricing & Payout</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">v{version}</span>
          <button onClick={resetDefaults} className="text-xs font-semibold text-slate-400 hover:text-white">Load defaults</button>
          <button onClick={save} disabled={saving} className={`${btnPrimary} disabled:opacity-60`}>{saving ? 'Saving…' : 'Save Pricing'}</button>
        </div>
      </div>
      <p className="max-w-3xl px-1 text-xs leading-5 text-slate-500">
        Single source of truth for every cleaning quote across the public site, HQ, and vendor payout. Changes apply immediately, no deployment needed, and every save is versioned.
      </p>

      {/* ---- Service tiers (tabbed) ---- */}
      <Section title="Service pricing" desc="Base price per bedroom tier, one cleaning type at a time." defaultOpen>
        <div role="tablist" aria-label="Cleaning services" className="mb-4 flex flex-wrap gap-1.5">
          {config.services.map((service, si) => (
            <button
              key={service.key}
              role="tab"
              aria-selected={si === activeIndex}
              onClick={() => setActiveService(si)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${si === activeIndex ? 'border-gold/50 bg-gold/10 text-gold' : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-200'}`}
            >
              {service.label}{!service.enabled && <span className="ml-1 font-normal text-slate-500">(off)</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={active.enabled} onChange={(e) => update((d) => { d.services[activeIndex].enabled = e.target.checked })} />
            Enabled online
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={active.recurringEligible} onChange={(e) => update((d) => { d.services[activeIndex].recurringEligible = e.target.checked })} />
            Eligible for recurring frequency discounts
          </label>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {active.tiers.map((tier, ti) => (
            <label key={tier.key} className="text-xs text-slate-400">
              <span className="mb-1 block truncate" title={tier.label}>{tier.label}</span>
              <div className="flex items-center gap-1">
                <span className="text-slate-500">$</span>
                <input
                  className={inputCls}
                  inputMode="decimal"
                  placeholder="Custom"
                  value={toDollars(tier.fromCents)}
                  onChange={(e) => update((d) => { d.services[activeIndex].tiers[ti].fromCents = toCents(e.target.value) })}
                />
              </div>
            </label>
          ))}
        </div>
      </Section>

      {/* ---- Add-ons ---- */}
      <Section title="Add-ons" desc={`${config.addons.filter((a) => a.enabled).length} of ${config.addons.length} enabled`}>
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {config.addons.map((addon, ai) => (
            <div key={addon.key} className="grid grid-cols-[minmax(0,1fr)_108px_52px] items-center gap-3 border-b border-white/[.06] py-2">
              <span className="truncate text-sm text-slate-200" title={addon.label}>{addon.label}{addon.perUnit ? ' (per unit)' : ''}</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-500">$</span>
                <input
                  className={inputCls}
                  inputMode="decimal"
                  placeholder={addon.needsReview ? 'Quote' : ''}
                  value={toDollars(addon.priceCents)}
                  disabled={addon.needsReview}
                  onChange={(e) => update((d) => { d.addons[ai].priceCents = toCents(e.target.value) })}
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                <input type="checkbox" checked={addon.enabled} onChange={(e) => update((d) => { d.addons[ai].enabled = e.target.checked })} />
                On
              </label>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- Recurring + promo ---- */}
      <Section title="Recurring discounts & promotion" desc="Frequency discounts and the public promo banner.">
        <div className="grid gap-3 sm:grid-cols-4">
          {config.frequencyDiscounts.map((f, fi) => (
            <label key={f.key} className="text-xs text-slate-400">
              <span className="mb-1 block">{f.label} (% off)</span>
              <input className={inputCls} inputMode="numeric" value={f.percent} onChange={(e) => update((d) => { d.frequencyDiscounts[fi].percent = Math.max(0, Math.min(90, Number(e.target.value) || 0)) })} />
            </label>
          ))}
        </div>
        {config.promotions.map((p, pi) => (
          <div key={p.id} className="mt-4 grid gap-3 border-t border-white/[.06] pt-4 sm:grid-cols-[minmax(0,1fr)_100px_90px] sm:items-end">
            <label className="text-xs text-slate-400">
              <span className="mb-1 block">Promotion label</span>
              <input className={inputCls} value={p.label} onChange={(e) => update((d) => { d.promotions[pi].label = e.target.value })} />
            </label>
            <label className="text-xs text-slate-400">
              <span className="mb-1 block">% off</span>
              <input className={inputCls} inputMode="numeric" value={p.percent} onChange={(e) => update((d) => { d.promotions[pi].percent = Math.max(0, Math.min(90, Number(e.target.value) || 0)) })} />
            </label>
            <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-400">
              <input type="checkbox" checked={p.active} onChange={(e) => update((d) => { d.promotions[pi].active = e.target.checked })} />
              Active
            </label>
          </div>
        ))}
      </Section>

      {/* ---- Commercial + property adjustments + tax ---- */}
      <Section title="Payout, margin & adjustments" desc="Vendor payout, margins, size & bathroom adjustments, and tax.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Vendor payout (% of base)" value={config.commercial.vendorPayoutPercent} onChange={(v) => update((d) => { d.commercial.vendorPayoutPercent = v })} />
          <NumberField label="Target margin (%)" value={config.commercial.targetMarginPercent} onChange={(v) => update((d) => { d.commercial.targetMarginPercent = v })} />
          <NumberField label="Min margin flag (%)" value={config.commercial.minMarginPercent} onChange={(v) => update((d) => { d.commercial.minMarginPercent = v })} />
          <MoneyField label="Minimum job ($)" cents={config.commercial.minimumJobCents} onChange={(c) => update((d) => { d.commercial.minimumJobCents = c ?? 0 })} />
          <NumberField label="Bathrooms included" value={config.bathroomsIncluded} onChange={(v) => update((d) => { d.bathroomsIncluded = v })} />
          <MoneyField label="Extra bathroom ($)" cents={config.extraBathroomCents} onChange={(c) => update((d) => { d.extraBathroomCents = c ?? 0 })} />
          <NumberField label="Sq ft included" value={config.sqftIncluded} onChange={(v) => update((d) => { d.sqftIncluded = v })} />
          <MoneyField label="Per 100 sq ft over ($)" cents={config.extraSqftPer100Cents} onChange={(c) => update((d) => { d.extraSqftPer100Cents = c ?? 0 })} />
          <MoneyField label="Client-supplies discount ($)" cents={config.clientSuppliesDiscountCents} onChange={(c) => update((d) => { d.clientSuppliesDiscountCents = c ?? 0 })} />
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-white/[.06] pt-4">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={config.tax.enabled} onChange={(e) => update((d) => { d.tax.enabled = e.target.checked })} />
            Charge tax
          </label>
          <NumberField label="Tax (%)" value={config.tax.percent} onChange={(v) => update((d) => { d.tax.percent = v })} />
        </div>
      </Section>

      {/* ---- Territories ---- */}
      <Section title="Service areas" desc={`${config.territories.filter((t) => t.enabled).length} of ${config.territories.length} counties enabled`}>
        <div className="grid gap-3 sm:grid-cols-3">
          {config.territories.map((t, ti) => (
            <div key={t.key} className="rounded-md border border-white/10 p-3">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" checked={t.enabled} onChange={(e) => update((d) => { d.territories[ti].enabled = e.target.checked })} />
                {t.label}
              </label>
              <label className="mt-2 block text-xs text-slate-400">
                <span className="mb-1 block">Zone adjustment (%)</span>
                <input className={inputCls} inputMode="numeric" value={t.priceAdjustPercent} onChange={(e) => update((d) => { d.territories[ti].priceAdjustPercent = Number(e.target.value) || 0 })} />
              </label>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// Collapsible titled section - the whole page is an accordion so an owner can
// scan five headers and open only the group they want to change.
function Section({ title, desc, defaultOpen = false, children }: { title: string; desc?: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-white/10 bg-white/[.015]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-white/[.02] [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{title}</p>
          {desc && <p className="mt-0.5 truncate text-xs text-slate-500">{desc}</p>}
        </div>
        <ChevronDown size={16} className="shrink-0 text-slate-500 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-white/10 p-4">{children}</div>
    </details>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="text-xs text-slate-400">
      <span className="mb-1 block">{label}</span>
      <input className={inputCls} inputMode="decimal" value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
    </label>
  )
}

function MoneyField({ label, cents, onChange }: { label: string; cents: number | null; onChange: (c: number | null) => void }) {
  return (
    <label className="text-xs text-slate-400">
      <span className="mb-1 block">{label}</span>
      <input className={inputCls} inputMode="decimal" value={cents == null ? '' : (cents / 100).toString()} onChange={(e) => onChange(toCents(e.target.value))} />
    </label>
  )
}
