import { describe, expect, it } from 'vitest'
import { crmInviteName, crmPersonName, crmRecordLine, parseContactName } from '../shared/crmRecord'

describe('CRM business contact helpers', () => {
  it('joins first and last name for the listed person', () => {
    expect(crmPersonName({ first_name: 'Jordan', last_name: 'Lee' })).toBe('Jordan Lee')
    expect(crmPersonName({ first_name: 'Jordan', last_name: '' })).toBe('Jordan')
    expect(crmPersonName({ first_name: null, last_name: null })).toBe('')
  })

  it('greets the contact person on a business invite, falling back to the company', () => {
    expect(crmInviteName({
      record_type: 'business',
      first_name: 'Jordan',
      last_name: 'Lee',
      company_name: 'Northstar Group',
      name: 'Northstar Group',
    })).toBe('Jordan Lee')
    expect(crmInviteName({
      record_type: 'business',
      company_name: 'Northstar Group',
      name: 'Northstar Group',
    })).toBe('Northstar Group')
    expect(crmInviteName({
      record_type: 'person',
      first_name: 'Jordan',
      last_name: 'Lee',
      company_name: 'Northstar Group',
    })).toBe('Jordan Lee')
  })

  it('keeps the contact visible on business list lines', () => {
    expect(crmRecordLine({
      record_type: 'business',
      first_name: 'Jordan',
      last_name: 'Lee',
      job_title: 'Office manager',
      email: 'hello@northstar.test',
    })).toBe('Office manager · Jordan Lee · hello@northstar.test')
    expect(crmRecordLine({
      record_type: 'business',
      email: 'hello@northstar.test',
    })).toBe('Business · hello@northstar.test')
    expect(crmRecordLine({
      record_type: 'person',
      first_name: 'Jordan',
      last_name: 'Lee',
      job_title: 'Advisor',
      company_name: 'Northstar Group',
      email: 'jordan@northstar.test',
    })).toBe('Advisor at Northstar Group · jordan@northstar.test')
  })

  it('splits a single contact column into first and last names', () => {
    expect(parseContactName('Jordan Lee')).toEqual({ first_name: 'Jordan', last_name: 'Lee' })
    expect(parseContactName('Jordan')).toEqual({ first_name: 'Jordan' })
    expect(parseContactName('  Jordan  Ann  Lee  ')).toEqual({ first_name: 'Jordan', last_name: 'Ann Lee' })
    expect(parseContactName('')).toEqual({})
  })
})
