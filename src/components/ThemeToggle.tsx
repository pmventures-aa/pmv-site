import { useTheme, type ThemePreference } from '../lib/theme'

const options: { value: ThemePreference; label: string; short: string }[] = [
  { value: 'system', label: 'Use system appearance', short: 'System' },
  { value: 'light', label: 'Use light appearance', short: 'Light' },
  { value: 'dark', label: 'Use dark appearance', short: 'Dark' },
]

export function ThemeToggle({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const { preference, resolved, setPreference, cycleTheme } = useTheme()
  const current = options.find((option) => option.value === preference) || options[0]

  if (compact) {
    return (
      <button
        type="button"
        onClick={cycleTheme}
        title={`${current.label}. Currently resolving to ${resolved}. Click to change.`}
        aria-label={`${current.label}. Change appearance.`}
        className={`theme-toggle-compact ${className}`}
      >
        <span aria-hidden="true" className="theme-indicator">{resolved === 'dark' ? '●' : '○'}</span>
        <span>{current.short}</span>
      </button>
    )
  }

  return (
    <div className={`theme-toggle ${className}`} role="group" aria-label="Appearance">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setPreference(option.value)}
          aria-pressed={preference === option.value}
          title={option.label}
          className={preference === option.value ? 'is-active' : ''}
        >
          {option.short}
        </button>
      ))}
    </div>
  )
}
