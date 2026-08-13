export type EmailSignature = {
  id: string
  name: string
  slug: string | null
  kind: 'company' | 'personal' | 'support' | 'custom'
  html: string
  owner_user_id: string | null
  is_default: number
  sort_order: number
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

export function signatureLabel(sig: EmailSignature): string {
  if (sig.kind === 'company') return `${sig.name} (company)`
  if (sig.kind === 'support') return `${sig.name}`
  if (sig.kind === 'personal') return `${sig.name} (me)`
  return sig.name
}

export function previewSignatureHtml(html: string): string {
  return String(html || '').replace(/https?:\/\/[^/"']+\/(logo-crest[^"'\s?]*)/gi, '/$1')
}
