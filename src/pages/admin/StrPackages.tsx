import { useCallback, useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, Tag, inputCls, btnPrimary } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { money } from '../../../shared/strWorkspace'

interface Tier { id: string; tier_key: string; tier_label: string; max_bedrooms: number | null; starting_from: number; client_price_cents: number; provider_payout_cents: number }
interface Pkg { key: string; name: string; description: string | null; badge: string | null; monthly_rate_cents: number | null; active: number; tiers: Tier[] }

export default function StrPackages() {
  const [packages, setPackages] = useState<Pkg[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ packages: Pkg[] }>('/admin/str/packages')
      setPackages(res.packages)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load packages.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  async function savePackage(pkg: Pkg, patch: Record<string, unknown>) {
    setBusyKey(`pkg-${pkg.key}`)
    try {
      await api.patch(`/admin/str/packages/${pkg.key}`, patch)
      toast.success('Package updated.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the package.')
    } finally { setBusyKey(null) }
  }

  async function saveTier(pkg: Pkg, tier: Tier, patch: Record<string, unknown>) {
    setBusyKey(`tier-${tier.id}`)
    try {
      await api.patch(`/admin/str/packages/${pkg.key}/tiers/${tier.id}`, patch)
      toast.success('Tier updated.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the tier.')
    } finally { setBusyKey(null) }
  }

  if (loading && packages.length === 0) {
    return <Panel><p className="text-sm text-slate-400">Loading packages…</p></Panel>
  }

  return (
    <div>
      <PageIntro
        kicker="STR Turnover & Property Support"
        title="Pricing & Packages"
        subtitle="Per-package pricing by bedroom tier. Charges and provider payouts are computed server-side from these tiers at turnover creation."
      />
      <div className="space-y-4">
        {packages.map((pkg) => (
          <PkgCard key={pkg.key} pkg={pkg} busy={busyKey === `pkg-${pkg.key}` || (busyKey?.startsWith('tier-') ?? false)} onSavePackage={(patch) => savePackage(pkg, patch)} onSaveTier={(tier, patch) => saveTier(pkg, tier, patch)} />
        ))}
      </div>
    </div>
  )
}

function PkgCard({ pkg, busy, onSavePackage, onSaveTier }: {
  pkg: Pkg
  busy: boolean
  onSavePackage: (patch: Record<string, unknown>) => void
  onSaveTier: (tier: Tier, patch: Record<string, unknown>) => void
}) {
  const [name, setName] = useState(pkg.name)
  const [badge, setBadge] = useState(pkg.badge ?? '')
  const [description, setDescription] = useState(pkg.description ?? '')
  const [monthly, setMonthly] = useState(pkg.monthly_rate_cents != null ? String(pkg.monthly_rate_cents / 100) : '')
  const [tiers, setTiers] = useState<Record<string, { client: string; payout: string; label: string }>>({})

  useEffect(() => {
    setName(pkg.name)
    setBadge(pkg.badge ?? '')
    setDescription(pkg.description ?? '')
    setMonthly(pkg.monthly_rate_cents != null ? String(pkg.monthly_rate_cents / 100) : '')
    setTiers(Object.fromEntries(pkg.tiers.map((t) => [t.id, { client: String(t.client_price_cents / 100), payout: String(t.provider_payout_cents / 100), label: t.tier_label }])))
  }, [pkg])

  const setTier = (id: string, field: 'client' | 'payout' | 'label', value: string) =>
    setTiers((all) => ({ ...all, [id]: { ...(all[id] ?? { client: '', payout: '', label: '' }), [field]: value } }))

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-white">{pkg.name}</h3>
          {pkg.active === 0 ? <Tag tone="slate">Disabled</Tag> : <Tag tone="green">Active</Tag>}
        </div>
        <button type="button" className={btnPrimary} disabled={busy} onClick={() => onSavePackage({ name, badge: badge || null, description: description || null, monthly_rate_cents: monthly ? Math.round(Number(monthly) * 100) : null, active: pkg.active === 0 ? true : undefined })}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-400">{pkg.key} · {money(pkg.monthly_rate_cents)}/mo for managed</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Name</span><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Badge</span><input className={inputCls} value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="e.g. Most popular" /></label>
        <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Monthly rate (USD)</span><input className={inputCls} type="number" min={0} step="0.01" value={monthly} onChange={(e) => setMonthly(e.target.value)} /></label>
      </div>
      <label className="mt-3 block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Description</span><textarea className={`${inputCls} min-h-[60px]`} value={description} onChange={(e) => setDescription(e.target.value)} /></label>

      <div className="mt-5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Bedroom tiers</p>
        <ul className="mt-2 space-y-3 md:hidden">
          {pkg.tiers.map((tier) => (
            <li key={tier.id} className="rounded-lg border border-white/10 bg-white/[.02] p-3">
              <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Tier</span><input className={inputCls} value={tiers[tier.id]?.label ?? tier.tier_label} onChange={(e) => setTier(tier.id, 'label', e.target.value)} /></label>
              <p className="mt-2 flex justify-between text-xs text-slate-400"><span>{tier.max_bedrooms == null ? '5+ bedrooms' : `Up to ${tier.max_bedrooms} bedrooms`}</span><span>Starting from ${(tier.starting_from / 100).toLocaleString()}</span></p>
              <label className="mt-2 block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Client charge (USD)</span><input className={inputCls} type="number" min={0} step="0.01" value={tiers[tier.id]?.client ?? ''} onChange={(e) => setTier(tier.id, 'client', e.target.value)} /></label>
              <label className="mt-2 block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Provider payout (USD)</span><input className={inputCls} type="number" min={0} step="0.01" value={tiers[tier.id]?.payout ?? ''} onChange={(e) => setTier(tier.id, 'payout', e.target.value)} /></label>
              <button type="button" className={`${btnPrimary} mt-3 w-full justify-center`} disabled={busy} onClick={() => onSaveTier(tier, { tier_label: tiers[tier.id]?.label, client_price_cents: tiers[tier.id]?.client != null ? Math.round(Number(tiers[tier.id]?.client) * 100) : undefined, provider_payout_cents: tiers[tier.id]?.payout != null ? Math.round(Number(tiers[tier.id]?.payout) * 100) : undefined })}>{busy ? <Loader2 size={14} className="animate-spin" /> : <><Save size={14} /> Save tier</>}</button>
            </li>
          ))}
        </ul>
        <div className="mt-2 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Tier</th>
                <th className="py-2 pr-3">Bedrooms</th>
                <th className="py-2 pr-3">Starting from</th>
                <th className="py-2 pr-3">Client charge (USD)</th>
                <th className="py-2 pr-3">Provider payout (USD)</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[.06]">
              {pkg.tiers.map((tier) => (
                <tr key={tier.id}>
                  <td className="py-2 pr-3"><input className={inputCls} value={tiers[tier.id]?.label ?? tier.tier_label} onChange={(e) => setTier(tier.id, 'label', e.target.value)} /></td>
                  <td className="py-2 pr-3 text-slate-400">{tier.max_bedrooms == null ? '5+' : `Up to ${tier.max_bedrooms}`}</td>
                  <td className="py-2 pr-3 text-slate-400">${(tier.starting_from / 100).toLocaleString()}</td>
                  <td className="py-2 pr-3"><input className={inputCls} type="number" min={0} step="0.01" value={tiers[tier.id]?.client ?? ''} onChange={(e) => setTier(tier.id, 'client', e.target.value)} /></td>
                  <td className="py-2 pr-3"><input className={inputCls} type="number" min={0} step="0.01" value={tiers[tier.id]?.payout ?? ''} onChange={(e) => setTier(tier.id, 'payout', e.target.value)} /></td>
                  <td className="py-2 text-right">
                    <button type="button" className={btnPrimary} disabled={busy} onClick={() => onSaveTier(tier, {
                      tier_label: tiers[tier.id]?.label,
                      client_price_cents: tiers[tier.id]?.client != null ? Math.round(Number(tiers[tier.id]?.client) * 100) : undefined,
                      provider_payout_cents: tiers[tier.id]?.payout != null ? Math.round(Number(tiers[tier.id]?.payout) * 100) : undefined,
                    })}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  )
}
