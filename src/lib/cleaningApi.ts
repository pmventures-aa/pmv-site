import { api } from './api'
import type {
  CleaningCounty,
  CleaningCustomerQuote,
  CleaningFrequency,
  CleaningFrequencyDiscount,
  CleaningQuoteInput,
  CleaningServiceType,
} from '../../shared/cleaningPricing'

// The customer-safe shape returned by GET /public/cleaning/config. This mirrors
// publicConfigView() on the server: no payout, margin, or minimum-margin data.
export interface PublicCleaningTier {
  key: string
  label: string
  maxBedrooms: number | null
  fromCents: number | null
}
export interface PublicCleaningService {
  key: CleaningServiceType
  label: string
  recurringEligible: boolean
  tiers: PublicCleaningTier[]
}
export interface PublicCleaningAddon {
  key: string
  label: string
  priceCents: number | null
  perUnit: boolean
  needsReview: boolean
  disabledCounties: CleaningCounty[]
  hint: string | null
}
export interface PublicCleaningConfig {
  currency: 'USD'
  territories: { key: CleaningCounty; label: string }[]
  services: PublicCleaningService[]
  addons: PublicCleaningAddon[]
  frequencyDiscounts: CleaningFrequencyDiscount[]
  conditionMultipliers: { key: string; label: string }[]
  promotion: { id: string; label: string; percent: number } | null
  startingPrices: Record<CleaningServiceType, number | null>
}

export function getCleaningConfig(): Promise<PublicCleaningConfig> {
  return api.get('/public/cleaning/config') as Promise<PublicCleaningConfig>
}

export async function getCleaningQuote(input: CleaningQuoteInput): Promise<CleaningCustomerQuote> {
  const res = (await api.post('/public/cleaning/quote', input)) as { quote: CleaningCustomerQuote }
  return res.quote
}

export interface CleaningBookingContact {
  name: string
  email: string
  phone?: string
  address?: string
  unit?: string
  scheduledDate?: string
  arrivalWindow?: string
  guestCheckoutAt?: string
  guestCheckinAt?: string
  source?: string
}
export interface CleaningBookingResult {
  reference: string
  status: string
  needsReview: boolean
  totalCents: number
  message: string
}
export function bookCleaning(input: CleaningQuoteInput & CleaningBookingContact): Promise<CleaningBookingResult> {
  return api.post('/public/cleaning/book', input) as Promise<CleaningBookingResult>
}

export type { CleaningCounty, CleaningFrequency, CleaningServiceType, CleaningQuoteInput, CleaningCustomerQuote }
