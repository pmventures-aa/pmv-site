import { describe, expect, it } from 'vitest'
import { missingRequiredQuestions, questionIsVisible, type IntakeQuestion } from '../functions/_lib/intake'

function q(partial: Partial<IntakeQuestion>): IntakeQuestion {
  return {
    id: partial.id || 'q',
    service_key: 'test',
    question_key: partial.question_key || 'question',
    label: partial.label || 'Question',
    help_text: null,
    input_type: partial.input_type || 'text',
    options: null,
    required: partial.required ?? 1,
    sort_order: 10,
    step_label: 'Test',
    step_order: 1,
    condition_question_key: partial.condition_question_key ?? null,
    condition_operator: partial.condition_operator ?? null,
    condition_value: partial.condition_value ?? null,
    allow_multiple: 0,
  }
}

describe('intake branching', () => {
  it('shows an equals branch only when the prior answer matches', () => {
    const conditional = q({ question_key: 'other_detail', condition_question_key: 'choice', condition_operator: '==', condition_value: 'Other' })
    expect(questionIsVisible(conditional, { choice: 'Other' })).toBe(true)
    expect(questionIsVisible(conditional, { choice: 'Standard' })).toBe(false)
  })

  it('supports multi-select contains branches', () => {
    const conditional = q({ question_key: 'reason_other', condition_question_key: 'reasons', condition_operator: 'contains', condition_value: 'Other' })
    expect(questionIsVisible(conditional, { reasons: ['Growth', 'Other'] })).toBe(true)
    expect(questionIsVisible(conditional, { reasons: ['Growth'] })).toBe(false)
  })

  it('does not require a hidden conditional question', () => {
    const questions = [
      q({ question_key: 'need_help' }),
      q({ question_key: 'details', condition_question_key: 'need_help', condition_operator: '==', condition_value: 'Yes' }),
    ]
    expect(missingRequiredQuestions(questions, { need_help: 'No' }).map((item) => item.question_key)).toEqual([])
    expect(missingRequiredQuestions(questions, { need_help: 'Yes' }).map((item) => item.question_key)).toEqual(['details'])
  })
})
