import { useMemo } from 'react'

const MONTHS = [
  'January','February','March','April','May','June','July','August','September','October','November','December',
]

function parts(value?: string) {
  if (!value) return { year: '', month: '', day: '' }
  const [year = '', month = '', day = ''] = value.slice(0, 10).split('-')
  return { year, month, day }
}

function daysInMonth(year: number, month: number) {
  if (!year || !month) return 31
  return new Date(year, month, 0).getDate()
}

export function todayIsoDate() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function DateSelect({
  value,
  onChange,
  className = '',
  minYear = new Date().getFullYear() - 10,
  maxYear = new Date().getFullYear() + 15,
  required = false,
  ariaLabel = 'Date',
}: {
  value?: string
  onChange: (value: string) => void
  className?: string
  minYear?: number
  maxYear?: number
  required?: boolean
  ariaLabel?: string
}) {
  const current = parts(value)
  const years = useMemo(() => Array.from({ length: Math.max(1, maxYear - minYear + 1) }, (_, i) => maxYear - i), [minYear, maxYear])
  const dayCount = daysInMonth(Number(current.year), Number(current.month))

  function set(next: Partial<{ year: string; month: string; day: string }>) {
    const merged = { ...current, ...next }
    let day = merged.day
    const count = daysInMonth(Number(merged.year), Number(merged.month))
    if (Number(day) > count) day = String(count).padStart(2, '0')
    if (!merged.year && !merged.month && !day) return onChange('')
    if (!merged.year || !merged.month || !day) return onChange([merged.year, merged.month, day].join('-'))
    onChange(`${merged.year}-${merged.month}-${day}`)
  }

  const selectCls = `min-h-11 rounded-lg border border-white/10 bg-navy-900 px-3 text-sm text-white outline-none transition focus:border-gold/60 focus:ring-2 focus:ring-gold/15 ${className}`

  return (
    <div className="grid grid-cols-[1.25fr_.9fr_1fr] gap-2" role="group" aria-label={ariaLabel}>
      <select
        className={selectCls}
        aria-label={`${ariaLabel} month`}
        required={required}
        value={current.month}
        onChange={(e) => set({ month: e.target.value })}
      >
        <option value="">Month</option>
        {MONTHS.map((name, index) => <option key={name} value={String(index + 1).padStart(2, '0')}>{name}</option>)}
      </select>
      <select
        className={selectCls}
        aria-label={`${ariaLabel} day`}
        required={required}
        value={current.day}
        onChange={(e) => set({ day: e.target.value })}
      >
        <option value="">Day</option>
        {Array.from({ length: dayCount }, (_, i) => i + 1).map((day) => <option key={day} value={String(day).padStart(2, '0')}>{day}</option>)}
      </select>
      <select
        className={selectCls}
        aria-label={`${ariaLabel} year`}
        required={required}
        value={current.year}
        onChange={(e) => set({ year: e.target.value })}
      >
        <option value="">Year</option>
        {years.map((year) => <option key={year} value={String(year)}>{year}</option>)}
      </select>
    </div>
  )
}
