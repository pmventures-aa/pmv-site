import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, inputCls, btnPrimary } from '../../components/admin/ui'
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

  if (loading && !config) return <Panel><p className="text-sm text-slate-400">Loading cleaning pricing…</p></Panel>
  if (!config) return <Panel><p className="text-sm text-slate-400">No pricing configuration available.</p></Panel>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageIntro
          kicker="Cleaning & Turnovers"
          title="Retail Pricing & Payout"
          subtitle="The single source of truth for every cleaning quote across the public site, HQ, and vendor payout. Changes apply immediately, no deployment needed. Every save is versioned."
        />
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">Version {version}</span>
          <button onClick={resetDefaults} className="text-xs font-semibold text-slate-400 hover:text-white">Load defaults</button>
          <button onClick={save} disabled={saving} className={`${btnPrimary} disabled:opacity-60`}>{saving ? 'Saving…' : 'Save Pricing'}</button>
        </div>
      </div>

      {/* ---- Service tiers ---- */}
      {config.services.map((service, si) => (
        <Panel key={service.key}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">{service.label}</h2>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={service.enabled} onChange={(e) => update((d) => { d.services[si].enabled = e.target.checked })} />
              Enabled online
            </label>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {service.tiers.map((tier, ti) => (
              <label key={tier.key} className="text-xs text-slate-400">
                <span className="mb-1 block">{tier.label}</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">$</span>
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    placeholder="Custom"
                    value={toDollars(tier.fromCents)}
                    onChange={(e) => update((d) => { d.services[si].tiers[ti].fromCents = toCents(e.target.value) })}
                  />
                </div>
              </label>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={service.recurringEligible} onChange={(e) => update((d) => { d.services[si].recurringEligible = e.target.checked })} />
            Eligible for recurring frequency discounts
          </label>
        </Panel>
      ))}

      {/* ---- Add-ons ---- */}
      <Panel>
        <h2 className="text-sm font-semibold text-white">Add-ons</h2>
        <div className="mt-4 space-y-2">
          {config.addons.map((addon, ai) => (
            <div key={addon.key} className="grid grid-cols-[minmax(0,1fr)_120px_90px] items-center gap-3 border-b border-white/[.06] pb-2">
              <span className="text-sm text-slate-200">{addon.label}{addon.perUnit ? ' (per unit)' : ''}</span>
              <div className="flex items-center gap-1">
                <span className="text-slate-500 text-xs">$</span>
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
      </Panel>

      {/* ---- Recurring + promo ---- */}
      <Panel>
        <h2 className="text-sm font-semibold text-white">Recurring discounts & promotion</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {config.frequencyDiscounts.map((f, fi) => (
            <label key={f.key} className="text-xs text-slate-400">
              <span className="mb-1 block">{f.label} (% off)</span>
              <input className={inputCls} inputMode="numeric" value={f.percent} onChange={(e) => update((d) => { d.frequencyDiscounts[fi].percent = Math.max(0, Math.min(90, Number(e.target.value) || 0)) })} />
            </label>
          ))}
        </div>
        {config.promotions.map((p, pi) => (
          <div key={p.id} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px_90px] sm:items-end">
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
      </Panel>

      {/* ---- Commercial + property adjustments + tax ---- */}
      <Panel>
        <h2 className="text-sm font-semibold text-white">Payout, margin & adjustments</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      </Panel>

      {/* ---- Territories ---- */}
      <Panel>
        <h2 className="text-sm font-semibold text-white">Service areas</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
      </Panel>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className={`${btnPrimary} disabled:opacity-60`}>{saving ? 'Saving…' : 'Save Pricing'}</button>
      </div>
    </div>
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
