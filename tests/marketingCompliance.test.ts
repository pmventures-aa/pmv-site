import { describe, expect, it } from 'vitest'
import { appendMarketingFooter } from '../functions/_lib/marketingCompliance'

describe('marketing compliance footer', () => {
  it('adds PMV identity, postal address, and unique unsubscribe link', () => {
    const html = appendMarketingFooter(
      '<p>Hello prospect</p>',
      { businessAddress: '123 Main St, Fort Lauderdale, FL 33301', publicBaseUrl: 'https://example.com' },
      'token-123',
    )

    expect(html).toContain('<p>Hello prospect</p>')
    expect(html).toContain('Pinnacle Management Ventures')
    expect(html).toContain('123 Main St, Fort Lauderdale, FL 33301')
    expect(html).toContain('https://example.com/api/unsubscribe/token-123')
    expect(html).toContain('Unsubscribe from future marketing emails')
  })

  it('escapes address content before placing it into email HTML', () => {
    const html = appendMarketingFooter(
      '<p>Body</p>',
      { businessAddress: '1 Main & <Suite 2>', publicBaseUrl: 'https://example.com' },
      'safe-token',
    )

    expect(html).toContain('1 Main &amp; &lt;Suite 2&gt;')
    expect(html).not.toContain('1 Main & <Suite 2>')
  })
})
