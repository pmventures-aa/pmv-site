import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (value: ThemePreference) => void
  cycleTheme: () => void
}

const STORAGE_KEY = 'pmv_theme'
const ThemeContext = createContext<ThemeContextValue | null>(null)

function storedPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function isPublicMarketingSurface() {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  const dedicatedWorkspace = host.startsWith('hq.') || host.startsWith('client.') || host.startsWith('secure.') || host.startsWith('mail.')
  const embeddedWorkspace = /^\/(portal|admin)(\/|$)/.test(window.location.pathname)
  return !dedicatedWorkspace && !embeddedWorkspace
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(storedPreference)
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme)
  const publicMarketing = isPublicMarketingSurface()
  const resolved: ResolvedTheme = publicMarketing ? 'dark' : preference === 'system' ? system : preference

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => setSystem(media.matches ? 'light' : 'dark')
    onChange()
    media.addEventListener?.('change', onChange)
    return () => media.removeEventListener?.('change', onChange)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = resolved
    root.dataset.themePreference = publicMarketing ? 'dark' : preference
    root.style.colorScheme = resolved
  }, [preference, publicMarketing, resolved])

  function setPreference(value: ThemePreference) {
    window.localStorage.setItem(STORAGE_KEY, value)
    setPreferenceState(value)
  }

  function cycleTheme() {
    const next: ThemePreference = preference === 'system' ? 'dark' : preference === 'dark' ? 'light' : 'system'
    setPreference(next)
  }

  const value = useMemo(() => ({ preference, resolved, setPreference, cycleTheme }), [preference, resolved])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
