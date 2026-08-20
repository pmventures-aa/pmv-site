import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GET_HELP, founder, howItWorks, pathways } from '../src/data/publicSite'

describe('public site clarity', () => {
  const home = readFileSync(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8')
  const header = readFileSync(new URL('../src/components/public/Header.tsx', import.meta.url), 'utf8')
  const footer = readFileSync(new URL('../src/components/public/Footer.tsx', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
  const login = readFileSync(new URL('../src/pages/auth/Login.tsx', import.meta.url), 'utf8')
  const about = readFileSync(new URL('../src/pages/public/About.tsx', import.meta.url), 'utf8')

  it('keeps the three public pathways and Get Help as the conversion CTA', () => {
    expect(pathways.map((item) => item.key)).toEqual(['business', 'property', 'personal'])
    expect(GET_HELP).toContain('/scope-request')
    expect(header).toContain('Get Help')
    expect(header).toContain('Client Login')
    expect(header).toContain('How It Works')
    expect(header).toContain('Resources')
    expect(header).not.toContain('Choose a service')
  })

  it('positions the homepage around one trusted point of contact', () => {
    expect(home).toContain('Professional Support.')
    expect(home).toContain('One Call Away.')
    expect(home).toContain('Tell Us What You Need Help With')
    expect(home).toContain('What brings you to Pinnacle?')
    expect(home).toContain('Know What')
    // The founder bio lives on /about, not the home page - the home stays about
    // the client's work, not the owner.
    expect(home).not.toContain('{founder.name}')
    expect(about).toContain('{founder.name}')
    expect(founder.name).toBe('Cody R. Jenkins')
    expect(howItWorks).toHaveLength(4)
  })

  it('adds How It Works and Resources without dropping indexed service routes', () => {
    expect(main).toContain('path="/how-it-works"')
    expect(main).toContain('path="/resources"')
    expect(main).toContain('path="/services/:slug"')
    expect(main).toContain('path="/scope-request"')
    expect(main).toContain('path="/start"')
    expect(footer).toContain('Property Support')
    expect(footer).toContain('Client Login')
  })

  it('points new visitors from login to Start a Request', () => {
    expect(login).toContain('Welcome Back to Pinnacle')
    expect(login).toContain('Start a Request')
    expect(login).toContain('/scope-request?source=login')
  })
})
