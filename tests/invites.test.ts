import { describe, expect, it } from 'vitest'
import { providerInviteCopy } from '../functions/_lib/invites'

describe('provider invitation copy', () => {
  it('personalizes a known notary invitation without restricting the application', () => {
    const copy = providerInviteCopy({
      known_services: ['mobile_notary', 'ron'],
      personal_note: 'I have always appreciated how responsive you are with clients.',
    })

    expect(copy.subject).toContain('notary')
    expect(copy.title).toContain('notary experience')
    expect(copy.body).toContain('mobile notary and signing work')
    expect(copy.body).toContain('Remote Online Notarization (RON)')
    expect(copy.body).toContain('I have always appreciated how responsive you are with clients.')
    expect(copy.body).toContain('apply as an individual or sole proprietor')
    expect(copy.body).toContain('does not lock you into one business structure')
    expect(copy.body).toContain('change anything that is not accurate')
  })

  it('keeps a general provider invitation useful when no specialty is known', () => {
    const copy = providerInviteCopy()

    expect(copy.subject).toContain('professional network')
    expect(copy.body).toContain('choose every service')
    expect(copy.body).toContain('does not guarantee assignment volume')
  })
})
