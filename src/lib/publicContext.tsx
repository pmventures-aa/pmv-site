import React, { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { OperatingWorld } from '../../shared/workspace'

// Lightweight, session-only visitor context. This is NOT a CRM or a profile:
// it survives ordinary same-session navigation so the site can reuse what the
// visitor voluntarily shared (world, address, interests) instead of asking for
// it again. Nothing here is written to an account and nothing leaves the tab.

export type VisitorAudience = 'business' | 'landlord' | 'str_host' | 'property_manager' | 'real_estate' | 'individual' | 'professional' | 'not_sure' | ''

export interface PublicAddressContext {
  address: string
  city: string
  state: string
  postal_code: string
}

export interface PublicVisitorState {
  world: OperatingWorld | ''
  audience: VisitorAudience
  interests: string[]
  address: PublicAddressContext
  business_name: string
  property_count: string
  urgency: string
  description: string
  last_path: string
  returning: boolean
  first_seen_at: string
}

const EMPTY_ADDRESS: PublicAddressContext = { address: '', city: '', state: '', postal_code: '' }

export const defaultVisitorState: PublicVisitorState = {
  world: '',
  audience: '',
  interests: [],
  address: EMPTY_ADDRESS,
  business_name: '',
  property_count: '',
  urgency: '',
  description: '',
  last_path: '',
  returning: false,
  first_seen_at: '',
}

const STORAGE_KEY = 'pmv_public_context'

function readStored(): PublicVisitorState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<PublicVisitorState>
    if (!value || typeof value !== 'object') return null
    return {
      ...defaultVisitorState,
      ...value,
      address: { ...EMPTY_ADDRESS, ...(value.address ?? {}) },
      interests: Array.isArray(value.interests) ? value.interests.filter((x): x is string => typeof x === 'string') : [],
    }
  } catch {
    return null
  }
}

function writeStored(value: PublicVisitorState) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Private mode or quota: the site works without persistence.
  }
}

interface PublicVisitorApi {
  state: PublicVisitorState
  setWorld: (world: OperatingWorld) => void
  setAudience: (audience: VisitorAudience) => void
  addInterest: (interest: string) => void
  rememberAddress: (address: Partial<PublicAddressContext>) => void
  rememberBusiness: (business_name: string) => void
  rememberPropertyCount: (property_count: string) => void
  rememberUrgency: (urgency: string) => void
  rememberDescription: (description: string) => void
  clear: () => void
}

const PublicVisitorContext = createContext<PublicVisitorApi | null>(null)

export function PublicVisitorProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [state, setState] = useState<PublicVisitorState>(() => {
    const stored = readStored()
    if (!stored) return defaultVisitorState
    // Same-session return: the visitor already looked around the site.
    const beenElsewhere = stored.last_path !== '' && stored.last_path !== location.pathname
    return { ...stored, returning: beenElsewhere, last_path: location.pathname }
  })
  const hydrated = useRef(false)

  // Persist on every meaningful change, but skip the very first render so we
  // do not overwrite stored state with an empty snapshot.
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true
      return
    }
    writeStored(state)
  }, [state])

  // Remember the last public page so returning-visitor cues can be subtle and safe.
  useEffect(() => {
    setState((current) => (current.last_path === location.pathname ? current : { ...current, last_path: location.pathname }))
  }, [location.pathname])

  const api = useMemo<PublicVisitorApi>(() => ({
    state,
    setWorld: (world) => setState((current) => ({ ...current, world, interests: current.interests })),
    setAudience: (audience) => setState((current) => ({ ...current, audience })),
    addInterest: (interest) => setState((current) => (current.interests.includes(interest) ? current : { ...current, interests: [...current.interests, interest] })),
    rememberAddress: (address) => setState((current) => ({ ...current, address: { ...current.address, ...address } })),
    rememberBusiness: (business_name) => setState((current) => ({ ...current, business_name })),
    rememberPropertyCount: (property_count) => setState((current) => ({ ...current, property_count })),
    rememberUrgency: (urgency) => setState((current) => ({ ...current, urgency })),
    rememberDescription: (description) => setState((current) => ({ ...current, description })),
    clear: () => setState(defaultVisitorState),
  }), [state])

  return <PublicVisitorContext.Provider value={api}>{children}</PublicVisitorContext.Provider>
}

export function usePublicVisitor(): PublicVisitorApi {
  const context = useContext(PublicVisitorContext)
  if (!context) throw new Error('usePublicVisitor must be used inside PublicVisitorProvider')
  return context
}