export const PROVIDER_AGREEMENT_VERSION = '2026-08-11'
export const PROVIDER_AGREEMENT_PATH = '/provider-agreement'
export const PROVIDER_AGREEMENT_URL = `https://pinnaclemanagementventures.com${PROVIDER_AGREEMENT_PATH}`

export function normalizeProviderSignature(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() : ''
}
