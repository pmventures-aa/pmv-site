import { useEffect, useRef, useState } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { normalizeGeoQuery, type GeoHit } from '../../../shared/geocode'

export interface AddressValue {
  line1: string
  line2?: string
  city?: string
  state?: string
  postal_code?: string
  country?: string
  lat?: number
  lng?: number
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
  countryCodes?: string
  autoComplete?: string
  disabled?: boolean
  id?: string
}

const DEBOUNCE_MS = 280
const MIN_QUERY_LENGTH = 4

function hitToSuggestion(hit: GeoHit): Suggestion {
  return {
    display: hit.display || [hit.line1, hit.city, hit.state, hit.postal_code].filter(Boolean).join(', '),
    address: {
      line1: hit.line1 || hit.display.split(',')[0]?.trim() || '',
      city: hit.city,
      state: hit.state,
      postal_code: hit.postal_code,
      country: hit.country,
      lat: hit.lat,
      lng: hit.lng,
    },
  }
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

  useEffect(() => {
    if (!focused) return
    const query = normalizeGeoQuery(value)
    if (query.length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setShowList(false)
      return
    }
    const handle = window.setTimeout(async () => {
      setLoading(true)
      try {
        const data = await api.get<{ results: GeoHit[] }>(`/geo/search?q=${encodeURIComponent(value)}&limit=5&countrycodes=${encodeURIComponent(countryCodes)}`)
        const next = (data.results || []).map(hitToSuggestion)
        setSuggestions(next)
        setShowList(next.length > 0)
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
            <li key={`${suggestion.address.lat},${suggestion.address.lng}:${suggestion.display}`}>
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
