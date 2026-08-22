import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const privacy = read('../src/pages/public/Privacy.tsx')
const routes = read('../functions/_lib/routes/externalCalendar.ts')
const freebusy = read('../functions/_lib/googleFreeBusy.ts')
const push = read('../functions/_lib/googleCalendarPush.ts')

// Google verification for sensitive scopes requires the privacy policy to say
// what Google data is accessed, why, where it goes and how to remove it. The
// harder requirement is that every sentence be true of the code.

describe('the policy discloses the Google connection', () => {
  it('has a dedicated section', () => {
    expect(privacy).toContain("id:'google-user-data'")
    expect(privacy).toContain('Google User Data')
  })

  it('affirms Limited Use, which the review looks for by name', () => {
    expect(privacy).toContain('Google API Services User Data Policy')
    expect(privacy).toContain('Limited Use requirements')
  })

  it('rules out the uses Limited Use prohibits', () => {
    expect(privacy).toContain('never sold')
    expect(privacy).toContain('never used for advertising')
    expect(privacy).toContain('train machine learning or artificial intelligence models')
  })
})

describe('every claim matches the code', () => {
  it('free/busy only, no event content read', () => {
    // The claim is that we read occupied spans and not titles or guests.
    expect(freebusy).toContain('calendar/v3/freeBusy')
    expect(privacy).toContain('We do not read event titles')
  })

  it('the two minute cache claim is the real TTL', () => {
    expect(freebusy).toContain('const CACHE_TTL_SECONDS = 120')
    expect(privacy).toContain('no more than two minutes')
  })

  it('tokens really are encrypted at rest', () => {
    expect(freebusy).toContain('encryptSensitive')
    expect(privacy).toContain('encrypted at rest')
  })

  it('no attendees, so Google sends nothing on the host behalf', () => {
    expect(push).not.toContain('attendees')
    expect(privacy).toContain('with no attendees added')
  })

  it('disconnect revokes with Google, which is why the policy can say so', () => {
    // This claim was false until disconnect was fixed: it deleted our tokens
    // and left the grant live in the user's Google account.
    expect(routes).toContain('makeGoogleAdapter(cfg).revoke(token)')
    expect(privacy).toContain('revokes the grant with Google and deletes the stored tokens')
  })

  it('prefers the refresh token, which is the durable half of the grant', () => {
    expect(routes).toContain('row?.refresh_token_enc ?? null')
  })

  it('still disconnects locally when Google cannot be reached', () => {
    // A Google outage must not trap someone in a connection they want gone.
    expect(routes).toContain("console.error('[gcal] revoke failed'")
  })
})
