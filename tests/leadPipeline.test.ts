import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LEAD_BOARD_STAGES,
  compareLeadsByUrgency,
  isLeadStale,
  leadBoardLabel,
  leadBoardPatch,
  leadBoardStage,
} from '../shared/leadPipeline'

describe('lead and prospect pipeline', () => {
  it('uses one board for leads, prospects, ready, and lost', () => {
    expect(LEAD_BOARD_STAGES.map((stage) => stage.key)).toEqual(['new', 'prospects', 'ready', 'lost'])
    expect(leadBoardLabel('prospects')).toBe('Prospects')
    expect(leadBoardPatch('prospects')).toEqual({ status: 'contacted', lifecycle_stage: 'prospect' })
    expect(leadBoardPatch('ready')).toEqual({ status: 'qualified', lifecycle_stage: 'opportunity' })
  })

  it('maps mixed status and lifecycle fields onto the same columns', () => {
    expect(leadBoardStage({ status: 'new', lifecycle_stage: 'lead' })).toBe('new')
    expect(leadBoardStage({ status: 'contacted', lifecycle_stage: 'lead' })).toBe('prospects')
    expect(leadBoardStage({ status: 'new', lifecycle_stage: 'prospect' })).toBe('prospects')
    expect(leadBoardStage({ status: 'qualified', lifecycle_stage: 'prospect' })).toBe('ready')
    expect(leadBoardStage({ status: 'contacted', lifecycle_stage: 'lost' })).toBe('lost')
  })

  it('flags idle cards so follow-up work rises to the top', () => {
    const fresh = { created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    const stale = { created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z' }
    expect(isLeadStale(fresh)).toBe(false)
    expect(isLeadStale(stale)).toBe(true)
    expect(compareLeadsByUrgency(stale, fresh)).toBeLessThan(0)
  })
})

describe('HQ pipeline workspace', () => {
  it('puts leads and prospects on one board instead of two overlapping taxonomies', () => {
    const page = readFileSync(new URL('../src/pages/admin/PipelinesAdmin.tsx', import.meta.url), 'utf8')
    const board = readFileSync(new URL('../src/pages/admin/LeadPipelineBoard.tsx', import.meta.url), 'utf8')
    expect(page).toContain('LeadPipelineBoard')
    expect(page).toContain('Leads & Prospects')
    expect(board).toContain('New leads')
    expect(board).toContain('become prospects')
    expect(board).toContain('Ready to convert')
    expect(board).toContain('Needs follow-up')
    expect(board).not.toContain("lifecycle_stage: draft")
  })
})
