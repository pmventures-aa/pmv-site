import { brandedSignatureHtml, previewSignatureHtml as previewShared } from '../../shared/emailSignatureHtml'

export type EmailSignature = {
  id: string
  name: string
  slug: string | null
  kind: 'company' | 'personal' | 'support' | 'custom'
  html: string
  owner_user_id: string | null
  is_default: number
  sort_order: number
  person_name?: string | null
  person_email?: string | null
  person_phone?: string | null
  person_title?: string | null
  party_type?: string | null
}

export type SignatureRosterPerson = {
  user_id: string
  full_name: string | null
  email: string
  phone: string | null
  title: string | null
  party_type: string
  signature_id: string | null
  html: string | null
}

const LAST_SIG_KEY = 'pmv_email_signature_id'

export function rememberSignatureId(id: string) {
  try { window.localStorage.setItem(LAST_SIG_KEY, id) } catch { /* ignore */ }
}

export function lastSignatureId(): string | null {
  try { return window.localStorage.getItem(LAST_SIG_KEY) } catch { return null }
}

export function pickDefaultSignature(signatures: EmailSignature[]): EmailSignature | null {
  if (!signatures.length) return null
  const remembered = lastSignatureId()
  if (remembered) {
    const match = signatures.find((s) => s.id === remembered)
    if (match) return match
  }
  return signatures.find((s) => s.is_default) || signatures.find((s) => s.kind === 'personal') || signatures[0]
}

export function signatureLabel(sig: EmailSignature, viewerId?: string | null): string {
  if (sig.kind === 'company') return `${sig.name} (company)`
  if (sig.kind === 'support') return `${sig.name}`
  if (sig.kind === 'personal') {
    if (!viewerId || sig.owner_user_id === viewerId) return `${sig.name} (me)`
    if (sig.party_type === 'vendor') return `${sig.name} (vendor)`
    return `${sig.name} (staff)`
  }
  return sig.name
}

export function rosterLabel(person: SignatureRosterPerson): string {
  const name = (person.full_name || '').trim() || person.email
  return person.party_type === 'vendor' ? `${name} (vendor)` : `${name} (staff)`
}

export function previewSignatureHtml(html: string): string {
  return previewShared(html)
}

export function liveLetterheadHtml(kind: EmailSignature['kind'], person?: {
  name?: string | null
  title?: string | null
  email?: string | null
  phone?: string | null
}): string {
  if (kind === 'custom') return ''
  return brandedSignatureHtml(kind, person)
}
