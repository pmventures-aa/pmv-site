import { describe, expect, it } from 'vitest'
import { authMomentsFor, CLIENT_AUTH_MOMENTS, HQ_AUTH_MOMENTS } from '../src/data/authMoments'
import { welcomeTime } from '../src/lib/welcomeSky'

describe('login atmosphere copy', () => {
  it('keeps HQ copy about partnership and client copy about the client relationship', () => {
    const hq = authMomentsFor('staff')
    const client = authMomentsFor('client')
    expect(hq).toBe(HQ_AUTH_MOMENTS)
    expect(client).toBe(CLIENT_AUTH_MOMENTS)
    expect(hq.some((moment) => /partner/i.test(`${moment.kicker} ${moment.title} ${moment.body}`))).toBe(true)
    expect(client.some((moment) => /your /i.test(`${moment.kicker} ${moment.title} ${moment.line}`))).toBe(true)
    expect(hq[0].title).not.toBe(client[0].title)
    expect(hq.every((moment) => moment.line.length > 12)).toBe(true)
  })
})

describe('welcome sky', () => {
  it('maps hours to greeting and a calm sky period', () => {
    expect(welcomeTime(new Date(2026, 7, 13, 7)).label).toBe('Good morning')
    expect(welcomeTime(new Date(2026, 7, 13, 7)).period).toBe('sunrise')
    expect(welcomeTime(new Date(2026, 7, 13, 14)).label).toBe('Good afternoon')
    expect(welcomeTime(new Date(2026, 7, 13, 14)).period).toBe('day')
    expect(welcomeTime(new Date(2026, 7, 13, 19)).label).toBe('Good evening')
    expect(welcomeTime(new Date(2026, 7, 13, 19)).period).toBe('sunset')
    expect(welcomeTime(new Date(2026, 7, 13, 23)).period).toBe('night')
    expect(welcomeTime(new Date(2026, 7, 13, 2)).label).toBe('Good evening')
  })
})
