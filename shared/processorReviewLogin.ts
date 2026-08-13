export const PROCESSOR_REVIEW_EMAIL = 'processor-review@pinnaclemanagementventures.com'
export const PROCESSOR_REVIEW_USER_ID = 'processor-review-client'
export const PROCESSOR_REVIEW_NAME = 'Payment Cloud Reviewer'
export const PROCESSOR_REVIEW_FIRST_NAME = 'Payment Cloud'
export const PROCESSOR_REVIEW_LAST_NAME = 'Reviewer'
export const PROCESSOR_REVIEW_COMPANY = 'Pinnacle Management Ventures (processor review)'

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

export function generateProcessorReviewPassword(randomValues = (size: number) => {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  return bytes
}): string {
  const bytes = randomValues(16)
  const chars = Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}-${chars.slice(12, 16).join('')}`
}

export function isProcessorReviewEmail(email: string | null | undefined): boolean {
  return String(email || '').trim().toLowerCase() === PROCESSOR_REVIEW_EMAIL
}
