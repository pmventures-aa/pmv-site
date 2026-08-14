import { describe, expect, it } from 'vitest'
import {
  renderAccountWelcome,
  renderVendorApplicationReceived,
  renderVendorApproved,
} from '../functions/_lib/emailTemplates/welcome'

describe('account onboarding email templates', () => {
  it('renders the edited Pinnacle client welcome copy and portal CTA for self-signup', () => {
    const email = renderAccountWelcome({
      firstName: 'Cody',
      email: 'cody@example.com',
      role: 'client',
      creationType: 'self_signup',
      actionLabel: 'Open My Client Portal',
      actionUrl: 'https://secure.pinnaclemanagementventures.com/',
    })

    expect(email.subject).toBe('Welcome to Pinnacle, Cody')
    expect(email.html).toContain('Professional support. One call away.')
    expect(email.html).toContain('Your Pinnacle Client Portal')
    expect(email.html).toContain('clear ownership, clear next steps, and less time spent chasing the work')
    expect(email.html).toContain('Open My Client Portal')
    expect(email.html).toContain('https://secure.pinnaclemanagementventures.com/')
    expect(email.text).toContain('Account security:')
  })

  it('includes the one-time setup link and 24-hour guidance for invited clients', () => {
    const actionUrl = 'https://secure.pinnaclemanagementventures.com/set-password?token=test-token'
    const email = renderAccountWelcome({
      firstName: 'Jamie',
      email: 'jamie@example.com',
      role: 'client',
      creationType: 'lead_conversion',
      actionLabel: 'Set Up My Pinnacle Account',
      actionUrl,
    })

    expect(email.subject).toBe('Welcome to Pinnacle, Jamie — Your Account Is Ready')
    expect(email.html).toContain(actionUrl.replace('&', '&amp;'))
    expect(email.html).toContain('expires in 24 hours')
    expect(email.text).toContain(actionUrl)
  })

  it('renders HQ invitations separately from client portal welcomes', () => {
    const email = renderAccountWelcome({
      firstName: 'Morgan',
      email: 'morgan@example.com',
      role: 'staff',
      creationType: 'admin_invite',
      actionLabel: 'Set Up My HQ Account',
      actionUrl: 'https://secure.pinnaclemanagementventures.com/hq/set-password?token=abc',
    })

    expect(email.subject).toBe('You’ve been invited to Pinnacle HQ')
    expect(email.html).toContain('Pinnacle HQ')
    expect(email.html).toContain('Set Up My HQ Account')
    expect(email.html).not.toContain('Your Pinnacle Client Portal')
  })

  it('escapes recipient names before placing them into HTML', () => {
    const email = renderAccountWelcome({
      firstName: '<script>alert(1)</script>',
      email: 'safe@example.com',
      role: 'client',
      creationType: 'self_signup',
      actionLabel: 'Open My Client Portal',
      actionUrl: 'https://secure.pinnaclemanagementventures.com/',
    })

    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(email.html).not.toContain('<script>alert(1)</script>')
  })

  it('keeps vendor application receipt distinct from approval', () => {
    const pending = renderVendorApplicationReceived({ firstName: 'Alex', email: 'alex@example.com' })
    const approved = renderVendorApproved({ firstName: 'Alex', actionUrl: 'https://secure.pinnaclemanagementventures.com/hq/login' })

    expect(pending.subject).toContain('received')
    expect(pending.html).toContain('pending review')
    expect(pending.html).not.toContain('Open Pinnacle HQ')
    expect(approved.subject).toContain('approved')
    expect(approved.html).toContain('Open Pinnacle HQ')
  })
})
