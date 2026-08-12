import { describe, expect, it } from 'vitest'
import { jobsForWorld, resolveVendorWorld, resolveWorld, worldFromPublicParams } from '../shared/workspace'
import { clientWorkspace, hqEmployeeExperience, publicIntakeCopy, vendorApplicationCopy } from '../src/lib/workspace'
import { clientMobilePrimary, clientPortalNav, vendorNavForWorld } from '../src/components/layout/nav'

describe('operating worlds', () => {
  it('resolves client services to a primary world with property first', () => {
    expect(resolveWorld(['consulting'])).toBe('business')
    expect(resolveWorld(['mobile_notary'])).toBe('documents')
    expect(resolveWorld(['funding'])).toBe('funding')
    expect(resolveWorld(['consulting', 'property_management'])).toBe('property')
    expect(resolveWorld([])).toBe('general')
  })

  it('maps public hubs and jobs to distinct worlds instead of one generic intake', () => {
    expect(worldFromPublicParams({ source: 'property-hub' })).toBe('property')
    expect(worldFromPublicParams({ source: 'mobile-hub' })).toBe('documents')
    expect(worldFromPublicParams({ source: 'business-hub' })).toBe('business')
    expect(worldFromPublicParams({ job: 'eviction_reo', audience: 'investor' })).toBe('property')
    expect(worldFromPublicParams({ service: 'mobile_notary' })).toBe('documents')
    expect(worldFromPublicParams({ world: 'funding' })).toBe('funding')
    expect(worldFromPublicParams({ source: 'home' })).toBe('general')
    expect(jobsForWorld('property')).toEqual(['cleaning_turnover', 'property_inspection', 'eviction_reo'])
    expect(jobsForWorld('documents')).toEqual(['documents_notary'])
    expect(publicIntakeCopy('property').title).not.toBe(publicIntakeCopy('documents').title)
    expect(publicIntakeCopy('business').cta).not.toBe(publicIntakeCopy('property').cta)
  })

  it('changes client home, login, and mobile tabs with the live service world', () => {
    expect(clientWorkspace(['property_management']).mobilePrimary).toEqual(['dashboard', 'properties', 'support', 'documents'])
    expect(clientWorkspace(['mobile_notary']).mobilePrimary).toEqual(['dashboard', 'documents', 'support', 'messages'])
    expect(clientWorkspace(['funding']).mobilePrimary).toEqual(['dashboard', 'funding', 'documents', 'support'])
    expect(clientWorkspace(['property_management']).loginTitle).not.toBe(clientWorkspace(['funding']).loginTitle)
    expect(clientMobilePrimary(['property_management'])).toEqual(['dashboard', 'properties', 'support', 'documents'])
    expect(clientPortalNav(['property_management']).map((item) => item.key).slice(0, 3)).toEqual(['dashboard', 'properties', 'support'])
  })

  it('changes vendor application copy, HQ employee actions, and vendor nav by track', () => {
    expect(resolveVendorWorld(['property_field'])).toBe('property')
    expect(resolveVendorWorld(['ron'])).toBe('documents')
    expect(vendorApplicationCopy(['property_field']).eyebrow).not.toBe(vendorApplicationCopy(['ron']).eyebrow)
    expect(hqEmployeeExperience('Field Operations').createLabel).toBe('New field work')
    expect(hqEmployeeExperience('Document Specialist').quickActions[0].to).toBe('document-center')
    expect(vendorNavForWorld('property')[0].label).toBe('Field assignments')
    expect(vendorNavForWorld('documents')[0].label).toBe('Signing assignments')
  })
})
