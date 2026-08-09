import type { Env } from './types'
import { uuid } from './crypto'
import { escapeHtml } from './email'

export interface MarketingComplianceConfig {
  businessAddress: string
  publicBaseUrl: string
}

export async function getMarketingComplianceConfig(env: Env): Promise<MarketingComplianceConfig> {
  const keys = ['business_address', 'marketing_public_base_url']
  const rows = await env.DB.prepare(`SELECT key, value FROM app_settings WHERE key IN (?, ?)`).bind(...keys).all<{ key: string; value: string }>()
  const values = new Map((rows.results ?? []).map((row) => [row.key, row.value?.trim() || '']))
  const businessAddress = values.get('business_address') || ''
  if (!businessAddress) {
    throw new Error('Marketing email is not ready: set the firm Business address in HQ Settings → General first.')
  }
  const publicBaseUrl = (values.get('marketing_public_base_url') || 'https://www.pinnaclemanagementventures.com').replace(/\/$/, '')
  return { businessAddress, publicBaseUrl }
}

export async function createUnsubscribeToken(env: Env, email: string): Promise<string> {
  const token = uuid()
  await env.DB.prepare('INSERT INTO email_unsubscribe_tokens (token, email) VALUES (?, ?)').bind(token, email.trim().toLowerCase()).run()
  return token
}

export function appendMarketingFooter(html: string, config: MarketingComplianceConfig, token: string): string {
  const unsubscribeUrl = `${config.publicBaseUrl}/api/unsubscribe/${encodeURIComponent(token)}`
  return `${html}\n<hr style="margin:32px 0 18px;border:0;border-top:1px solid #d9d9d9">\n<p style="font-size:12px;line-height:1.6;color:#666;margin:0">Business/marketing communication from Pinnacle Management Ventures.<br>${escapeHtml(config.businessAddress)}<br><a href="${escapeHtml(unsubscribeUrl)}" style="color:#666;text-decoration:underline">Unsubscribe from future marketing emails</a></p>`
}
