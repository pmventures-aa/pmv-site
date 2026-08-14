export interface ParsedUserAgent {
  browser_family: string | null
  os_family: string | null
  device_class: string | null
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const raw = String(ua || '').trim()
  if (!raw) return { browser_family: null, os_family: null, device_class: null }

  const lower = raw.toLowerCase()
  let browser_family: string | null = null
  if (/edg\//i.test(raw)) browser_family = `Edge ${matchVersion(raw, /Edg\/([\d.]+)/i)}`
  else if (/crios\//i.test(raw)) browser_family = `Chrome ${matchVersion(raw, /CriOS\/([\d.]+)/i)}`
  else if (/chrome\//i.test(raw) && !/chromium/i.test(raw)) browser_family = `Chrome ${matchVersion(raw, /Chrome\/([\d.]+)/i)}`
  else if (/safari\//i.test(raw) && !/chrome/i.test(raw)) browser_family = `Safari ${matchVersion(raw, /Version\/([\d.]+)/i)}`
  else if (/firefox\//i.test(raw)) browser_family = `Firefox ${matchVersion(raw, /Firefox\/([\d.]+)/i)}`

  let os_family: string | null = null
  if (/iphone|ipad|ipod/i.test(raw)) os_family = `iOS ${matchVersion(raw, /OS ([\d_]+)/i)?.replace(/_/g, '.') || ''}`.trim()
  else if (/android/i.test(raw)) os_family = `Android ${matchVersion(raw, /Android ([\d.]+)/i)}`.trim()
  else if (/windows nt/i.test(raw)) os_family = `Windows ${matchVersion(raw, /Windows NT ([\d.]+)/i)}`.trim()
  else if (/mac os x/i.test(raw)) os_family = `macOS ${matchVersion(raw, /Mac OS X ([\d_]+)/i)?.replace(/_/g, '.') || ''}`.trim()
  else if (/linux/i.test(raw)) os_family = 'Linux'

  let device_class: string | null = 'desktop'
  if (/ipad|tablet/i.test(raw)) device_class = 'tablet'
  else if (/iphone|ipod|android.+mobile/i.test(raw)) device_class = 'mobile'

  return {
    browser_family: browser_family || null,
    os_family: os_family || null,
    device_class,
  }
}

function matchVersion(ua: string, pattern: RegExp): string {
  const match = ua.match(pattern)
  return match?.[1] ? match[1] : ''
}
