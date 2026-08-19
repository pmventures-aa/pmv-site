// Small, customer-safe site configuration surfaced to the public site.
// Kept here so the public config endpoint, the confirmation email, the HQ
// settings editor, and the request wizard all agree on the key and default.

export const SCOPE_REPLY_WINDOW_KEY = 'scope_reply_window'
export const DEFAULT_SCOPE_REPLY_WINDOW = 'two business hours'

export interface PublicSiteConfig {
  // Human phrase for how quickly a person replies to a scope request, e.g.
  // "two business hours". Editable in HQ → Settings. Used in the request
  // wizard and the confirmation email.
  scopeReplyWindow: string
}
