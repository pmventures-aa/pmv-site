import { PUBLIC_SITE_URL } from './letterhead'

export const PROVIDER_AGREEMENT_VERSION = '2026-08-11'
export const PROVIDER_AGREEMENT_PATH = '/provider-agreement'
export const PROVIDER_AGREEMENT_URL = `${PUBLIC_SITE_URL}${PROVIDER_AGREEMENT_PATH}`

export function normalizeProviderSignature(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() : ''
}
