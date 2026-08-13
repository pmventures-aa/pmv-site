export function clientEmailHref(
  p: (path: string) => string,
  client: { id: string; email?: string | null; name?: string | null },
): string {
  const q = new URLSearchParams({ tab: 'email', compose: '1', scopeClient: client.id })
  if (client.email) q.set('to', client.email)
  if (client.name) q.set('name', client.name)
  return `${p('messages')}?${q.toString()}`
}

export function clientInboxHref(p: (path: string) => string, clientId: string): string {
  return `${p('messages')}?client=${encodeURIComponent(clientId)}`
}

export function leadEmailHref(
  p: (path: string) => string,
  lead: { id: string; email?: string | null; name?: string | null },
): string {
  const q = new URLSearchParams({ tab: 'email', compose: '1', lead: lead.id })
  if (lead.email) q.set('to', lead.email)
  if (lead.name) q.set('name', lead.name)
  return `${p('messages')}?${q.toString()}`
}

export function campaignAudienceHref(
  p: (path: string) => string,
  audience: { lead?: string; leadIds?: string[]; list?: string; client?: string },
): string {
  const q = new URLSearchParams()
  if (audience.lead) q.set('lead', audience.lead)
  if (audience.leadIds?.length) q.set('leadIds', audience.leadIds.join(','))
  if (audience.list) q.set('list', audience.list)
  if (audience.client) q.set('client', audience.client)
  const qs = q.toString()
  return qs ? `${p('communications/email')}?${qs}` : p('communications/email')
}

export function composeAddress(name: string | null | undefined, email: string | null | undefined): string {
  const addr = (email || '').trim()
  const label = (name || '').trim()
  if (!addr) return ''
  return label ? `${label} <${addr}>` : addr
}

export function isCampaignAudienceQuery(params: URLSearchParams): boolean {
  return Boolean(params.get('lead') || params.get('leadIds') || params.get('list') || params.get('client'))
}
