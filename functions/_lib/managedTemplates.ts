import type { Env } from './types'
import { PROVIDER_AGREEMENT_VERSION } from '../../shared/providerAgreement'
import { DEFAULT_PROVIDER_AGREEMENT_SECTIONS, type ManagedAgreementSection } from '../../shared/providerAgreementContent'

export interface ManagedTemplateContent {
  id: string
  template_key: string
  name: string
  description: string | null
  category: string
  version_number: number
  version_label: string
  sections: ManagedAgreementSection[]
}

export function slugTemplateKey(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

export function normalizeTemplateSections(value: unknown): ManagedAgreementSection[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 60).map((raw, index) => {
    const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const title = typeof row.title === 'string' ? row.title.trim().slice(0, 240) : ''
    const body = typeof row.body === 'string' ? row.body.trim().slice(0, 30000) : ''
    const id = (typeof row.id === 'string' ? row.id : title)
      .normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || `section-${index + 1}`
    return { id, title, body }
  }).filter((section) => section.title && section.body)
}

function parseSections(value: string | null | undefined): ManagedAgreementSection[] {
  try { return normalizeTemplateSections(JSON.parse(value || '[]')) } catch { return [] }
}

export async function getPublishedManagedTemplate(env: Env, key: string): Promise<ManagedTemplateContent | null> {
  try {
    const row = await env.DB.prepare(
      `SELECT t.id,t.template_key,t.name,t.description,t.category,t.published_version,t.published_version_label,
              v.content_json,v.version_number,v.version_label
       FROM managed_templates t
       LEFT JOIN managed_template_versions v ON v.template_id=t.id AND v.version_number=t.published_version
       WHERE t.template_key=? AND t.status='published'`,
    ).bind(key).first<any>()
    if (!row) return null
    let sections = parseSections(row.content_json)
    if (!sections.length && key === 'provider-agreement') sections = DEFAULT_PROVIDER_AGREEMENT_SECTIONS
    return {
      id: row.id,
      template_key: row.template_key,
      name: row.name,
      description: row.description || null,
      category: row.category,
      version_number: Number(row.version_number || row.published_version || 1),
      version_label: String(row.version_label || row.published_version_label || PROVIDER_AGREEMENT_VERSION),
      sections,
    }
  } catch {
    if (key !== 'provider-agreement') return null
    return {
      id: 'managed-provider-agreement', template_key: key, name: 'Independent Provider Network Agreement',
      description: 'The master agreement for the Pinnacle Professional Network.', category: 'agreement',
      version_number: 1, version_label: PROVIDER_AGREEMENT_VERSION, sections: DEFAULT_PROVIDER_AGREEMENT_SECTIONS,
    }
  }
}

export async function getCurrentProviderAgreementVersion(env: Env): Promise<string> {
  return (await getPublishedManagedTemplate(env, 'provider-agreement'))?.version_label || PROVIDER_AGREEMENT_VERSION
}
