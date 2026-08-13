export type {
  HqEmailCategory,
  HqEmailCatalogEntry,
} from '../../shared/hqEmailTemplates'

export {
  HQ_EMAIL_CATEGORY_LABEL,
  HQ_EMAIL_SAMPLE_VARS,
  mergeHqTemplateHtml,
  mergeHqTemplatePlain,
} from '../../shared/hqEmailTemplates'

export type HqEmailTemplate = {
  id: string
  slug: string
  name: string
  category: string
  description: string | null
  is_system: number
  enabled: number
  wrap_letterhead: number
  include_signature: number
  subject: string
  preheader: string | null
  eyebrow: string | null
  title: string | null
  body_html: string
  cta_label: string | null
  cta_url_token: string | null
  security_note: string | null
  sort_order: number
  tokens: string[]
  updated_at: string
}
