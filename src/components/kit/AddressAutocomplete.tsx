import { useEffect, useRef, useState } from 'react'
import { MapPin, Loader2 } from 'lucide-react'

// Structured address the parent form uses to fill in individual fields when
// the user picks a suggestion. Everything but `line1` is optional so callers
// with a compact single-line variant can still consume it.
export interface AddressValue {
  line1: string
  line2?: string
  city?: string
  state?: string
  postal_code?: string
  country?: string
}

interface Suggestion {
  display: string
  address: AddressValue
}

interface Props {
  value: string
  onChange: (line1: string) => void
  onSelect?: (address: AddressValue) => void
  placeholder?: string
  inputClassName?: string
  label?: string
  countryCodes?: string   // comma-separated ISO codes, e.g. "us,ca": defaults to US
  autoComplete?: string
  disabled?: boolean
  id?: string
}

// Lightweight predictive-address input backed by the free Nominatim
// (OpenStreetMap) endpoint: good enough for form assistance without pulling
// in a paid Places API or a client SDK. Debounced, silent-fail (so the
// input keeps working as a plain text field when the network is offline),
// and only queries after 4+ characters so we don't spam the endpoint for
// every keystroke on empty inputs.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const DEBOUNCE_MS = 260
const MIN_QUERY_LENGTH = 4

interface NominatimResult {
  display_name: string
  address?: {
    house_number?: string
    road?: string
    city?: string
    town?: string
    village?: string
    hamlet?: string
    county?: string
    state?: string
    postcode?: string
    country_code?: string
    country?: string
  }
}

function normalizeNominatim(result: NominatimResult): Suggestion {
  const a = result.address ?? {}
  const line1Parts = [a.house_number, a.road].filter(Boolean).join(' ').trim()
  const city = a.city || a.town || a.village || a.hamlet || ''
  const address: AddressValue = {
    line1: line1Parts || result.display_name.split(',')[0]?.trim() || '',
    city,
    state: a.state || '',
    postal_code: a.postcode || '',
    country: a.country_code ? a.country_code.toUpperCase() : a.country || '',
  }
  return { display: result.display_name, address }
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Start typing an address…',
  inputClassName = 'w-full rounded-md border border-white/10 bg-navy-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-gold/50 focus:outline-none',
  label,
  countryCodes = 'us',
  autoComplete = 'street-address',
  disabled = false,
  id,
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showList, setShowList] = useState(false)
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!focused) return
    if (value.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setShowList(false)
      return
    }
    const handle = window.setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      try {
        const url = `${NOMINATIM_URL}?format=json&addressdetails=1&limit=5&countrycodes=${encodeURIComponent(countryCodes)}&q=${encodeURIComponent(value)}`
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const data = (await res.json()) as NominatimResult[]
        setSuggestions(data.slice(0, 5).map(normalizeNominatim))
        setShowList(true)
      } catch {
        setSuggestions([])
        setShowList(false)
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [value, countryCodes, focused])

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowList(false)
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [])

  function pick(suggestion: Suggestion) {
    onChange(suggestion.address.line1)
    onSelect?.(suggestion.address)
    setShowList(false)
  }

  return (
    <div className="relative" ref={boxRef}>
      {label && <label htmlFor={id} className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">{label}</label>}
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
          <MapPin size={14} />
        </span>
        <input
          id={id}
          className={`${inputClassName} !pl-9`}
          type="text"
          autoComplete={autoComplete}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {loading && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
            <Loader2 size={14} className="animate-spin" />
          </span>
        )}
      </div>
      {showList && suggestions.length > 0 && (
        <ul className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-white/10 bg-navy-900 shadow-lg">
          {suggestions.map((suggestion) => (
            <li key={suggestion.display}>
              <button
                type="button"
                onClick={() => pick(suggestion)}
                onMouseDown={(e) => e.preventDefault()}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/[.04]"
              >
                <MapPin size={13} className="mt-1 shrink-0 text-slate-500" />
                <span className="truncate">{suggestion.display}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
