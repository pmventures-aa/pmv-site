import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { btnPrimary, btnOutline } from './ui'
import { getCleaningConfig, getCleaningQuote, type PublicCleaningConfig } from '../../lib/cleaningApi'
import { formatUsd, type CleaningCounty, type CleaningFrequency, type CleaningServiceType, type CleaningCustomerQuote } from '../../../shared/cleaningPricing'

const COUNTY_ORDER: CleaningCounty[] = ['miami_dade', 'broward', 'palm_beach']

const chip = (active: boolean) =>
  `rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
    active ? 'border-gold bg-gold/15 text-white' : 'border-white/12 text-slate-300 hover:border-gold/50 hover:text-white'
  }`

interface Props {
  /** Fix the calculator to one service; omit to let the visitor choose. */
  service?: CleaningServiceType
  /** Show the recurring frequency selector (residential contexts). */
  showFrequency?: boolean
  defaultCounty?: CleaningCounty
  heading?: string
}

export function CleaningCalculator({ service: fixedService, showFrequency = false, defaultCounty = 'broward', heading = 'Get my price' }: Props) {
  const navigate = useNavigate()
  const [config, setConfig] = useState<PublicCleaningConfig | null>(null)
  const [loadError, setLoadError] = useState(false)

  const [service, setService] = useState<CleaningServiceType>(fixedService || 'residential_standard')
  const [county, setCounty] = useState<CleaningCounty>(defaultCounty)
  const [bedrooms, setBedrooms] = useState(2)
  const [bathrooms, setBathrooms] = useState(1)
  const [frequency, setFrequency] = useState<CleaningFrequency>('one_time')
  const [addons, setAddons] = useState<Record<string, boolean>>({})

  const [quote, setQuote] = useState<CleaningCustomerQuote | null>(null)
  const [pending, setPending] = useState(false)
  const reqId = useRef(0)

  useEffect(() => {
    let live = true
    getCleaningConfig()
      .then((cfg) => {
        if (!live) return
        setConfig(cfg)
        if (!fixedService && cfg.services[0]) setService(cfg.services[0].key)
      })
      .catch(() => live && setLoadError(true))
    return () => {
      live = false
    }
  }, [fixedService])

  const activeService = useMemo(() => config?.services.find((s) => s.key === service) || null, [config, service])
  const recurringAllowed = showFrequency && Boolean(activeService?.recurringEligible)

  // Add-ons available for the current county.
  const availableAddons = useMemo(
    () => (config?.addons || []).filter((a) => !a.disabledCounties.includes(county)),
    [config, county],
  )

  // Debounced authoritative quote from the pricing engine.
  useEffect(() => {
    if (!config) return
    const id = ++reqId.current
    setPending(true)
    const handle = setTimeout(() => {
      getCleaningQuote({
        service,
        county,
        bedrooms,
        bathrooms,
        frequency: recurringAllowed ? frequency : 'one_time',
        addons,
        isFirstRecurring: recurringAllowed && frequency !== 'one_time',
      })
        .then((q) => {
          if (id === reqId.current) setQuote(q)
        })
        .catch(() => {})
        .finally(() => {
          if (id === reqId.current) setPending(false)
        })
    }, 250)
    return () => clearTimeout(handle)
  }, [config, service, county, bedrooms, bathrooms, frequency, addons, recurringAllowed])

  function toggleAddon(key: string) {
    setAddons((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function startRequest() {
    const params = new URLSearchParams({ job: 'cleaning_turnover', service: 'property-cleaning', source: `cleaning-calculator-${service}` })
    navigate(`/scope-request?${params.toString()}`)
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-white/10 bg-navy-900/55 p-6">
        <p className="text-sm text-slate-300">We could not load live pricing right now. You can still start a request and we will send your price by reply.</p>
        <button onClick={startRequest} className={`${btnPrimary} mt-4`}>Start a Request</button>
      </div>
    )
  }
  if (!config) {
    return <div className="rounded-lg border border-white/10 bg-navy-900/55 p-6 text-sm text-slate-400" aria-busy="true">Loading pricing…</div>
  }

  const priced = quote && !quote.needsReview
  const totalLabel = recurringAllowed && frequency !== 'one_time' ? 'Estimated per visit' : 'Estimated total'

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* ---- Inputs ---- */}
      <div className="rounded-lg border border-white/10 bg-navy-900/55 p-6 sm:p-8">
        <p className="eyebrow">{heading}</p>

        {!fixedService && (
          <Field label="Service">
            <div className="flex flex-wrap gap-2">
              {config.services.map((s) => (
                <button key={s.key} type="button" onClick={() => setService(s.key)} className={chip(service === s.key)}>{s.label}</button>
              ))}
            </div>
          </Field>
        )}

        <Field label="Service area">
          <div className="flex flex-wrap gap-2">
            {COUNTY_ORDER.map((key) => {
              const t = config.territories.find((x) => x.key === key)
              if (!t) return null
              return <button key={key} type="button" onClick={() => setCounty(key)} className={chip(county === key)}>{t.label.replace(' County', '')}</button>
            })}
          </div>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Bedrooms">
            <Stepper value={bedrooms} min={0} max={8} onChange={setBedrooms} suffix={bedrooms >= 6 ? '6+' : undefined} />
          </Field>
          <Field label="Bathrooms">
            <Stepper value={bathrooms} min={1} max={8} onChange={setBathrooms} />
          </Field>
        </div>

        {recurringAllowed && (
          <Field label="How often?">
            <div className="flex flex-wrap gap-2">
              {config.frequencyDiscounts.map((f) => (
                <button key={f.key} type="button" onClick={() => setFrequency(f.key)} className={chip(frequency === f.key)}>
                  {f.label}{f.percent > 0 ? ` · save ${f.percent}%` : ''}
                </button>
              ))}
            </div>
          </Field>
        )}

        <Field label="Add-ons">
          <div className="grid gap-2 sm:grid-cols-2">
            {availableAddons.map((a) => (
              <button key={a.key} type="button" onClick={() => toggleAddon(a.key)} className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${addons[a.key] ? 'border-gold bg-gold/12 text-white' : 'border-white/12 text-slate-300 hover:border-gold/50'}`}>
                <span>{a.label}</span>
                <span className="shrink-0 text-xs font-semibold text-gold/90">
                  {a.needsReview || a.priceCents === null ? 'Quote' : `+${formatUsd(a.priceCents)}`}
                </span>
              </button>
            ))}
          </div>
        </Field>
      </div>

      {/* ---- Price summary ---- */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-lg border border-gold/25 bg-navy-900/70 p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold/85">{totalLabel}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-4xl font-bold text-white" aria-live="polite">
              {priced ? formatUsd(quote!.totalCents) : '--'}
            </span>
            {pending && <span className="text-xs text-slate-500">updating…</span>}
          </div>

          {recurringAllowed && frequency !== 'one_time' && priced && (
            <p className="mt-1 text-xs text-slate-400">One-time is {formatUsd(quote!.oneTimeCents)}. Save more when we keep it clean.</p>
          )}

          {quote && (
            <ul className="mt-4 space-y-1.5 border-t border-white/10 pt-4 text-sm">
              {quote.lines.map((line) => (
                <li key={line.key} className="flex items-baseline justify-between gap-3 text-slate-300">
                  <span className={line.kind === 'discount' || line.kind === 'promo' ? 'text-emerald-300' : ''}>{line.label}</span>
                  <span className={`shrink-0 tabular-nums ${line.kind === 'discount' || line.kind === 'promo' ? 'text-emerald-300' : 'text-slate-200'}`}>
                    {line.needsReview ? 'Quote' : `${line.amountCents < 0 ? '-' : ''}${formatUsd(Math.abs(line.amountCents))}`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 rounded-md border border-white/10 bg-navy-950/40 px-3 py-2 text-xs text-slate-400">
            {quote?.needsReview
              ? 'Estimated price - a few details need a quick confirmation before we lock it in. No surprise charges after service.'
              : 'Instant price for a property in reasonable condition. We confirm before any work begins.'}
          </div>

          <button onClick={startRequest} className={`${btnPrimary} mt-4 w-full`}>
            {recurringAllowed && frequency !== 'one_time' ? 'Schedule Recurring Service' : 'Book This Cleaning'}
          </button>
          <button onClick={startRequest} className={`${btnOutline} mt-2 w-full`}>Ask a Question First</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 first:mt-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      {children}
    </div>
  )
}

function Stepper({ value, min, max, onChange, suffix }: { value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string }) {
  const btn = 'grid h-10 w-10 place-items-center rounded-md border border-white/12 text-lg text-slate-200 transition-colors hover:border-gold/50 hover:text-gold disabled:opacity-40'
  return (
    <div className="flex items-center gap-3">
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Decrease">−</button>
      <span className="min-w-[2.5rem] text-center font-display text-xl font-semibold text-white tabular-nums">{suffix || value}</span>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Increase">+</button>
    </div>
  )
}
