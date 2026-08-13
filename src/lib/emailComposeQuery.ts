export type ComposeQuery = {
  to: string
  name: string
  clientId: string | null
  inquiryId: string | null
}

export function readComposeQuery(params: URLSearchParams): ComposeQuery | null {
  if (params.get('compose') !== '1') return null
  return {
    to: params.get('to') || '',
    name: params.get('name') || '',
    clientId: params.get('scopeClient') || null,
    inquiryId: params.get('lead') || null,
  }
}

export function stripComposeQuery(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params)
  next.delete('compose')
  next.delete('to')
  next.delete('name')
  next.delete('scopeClient')
  next.delete('lead')
  return next
}
