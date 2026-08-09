export type IntakeValue = string | number | boolean | string[] | null
export type AnswerMap = Record<string, IntakeValue>

export interface IntakeQuestion {
  id: string
  service_key: string
  question_key: string
  label: string
  help_text: string | null
  input_type: string
  options: string | null
  required: number
  sort_order: number
  step_label: string | null
  step_order: number
  condition_question_key: string | null
  condition_operator: string | null
  condition_value: string | null
  allow_multiple: number
}

export interface IntakeOption {
  value: string
  label: string
  description?: string
  meta?: string
}

function strings(value: IntakeValue | undefined): string[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value.map(String) : [String(value)]
}

export function hasAnswer(value: IntakeValue | undefined): boolean {
  if (value === undefined || value === null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

export function questionVisible(q: IntakeQuestion, answers: AnswerMap): boolean {
  if (!q.condition_question_key) return true
  const actual = strings(answers[q.condition_question_key])
  const expected = q.condition_value ?? ''
  switch (q.condition_operator || '==') {
    case '==': return actual.some((v) => v === expected)
    case '!=': return actual.length === 0 || actual.every((v) => v !== expected)
    case 'contains': return actual.some((v) => v === expected || v.includes(expected))
    case 'not_contains': return actual.every((v) => v !== expected && !v.includes(expected))
    case 'truthy': return actual.some((v) => !['', '0', 'false', 'no'].includes(v.toLowerCase()))
    case 'falsy': return actual.length === 0 || actual.every((v) => ['', '0', 'false', 'no'].includes(v.toLowerCase()))
    default: return true
  }
}

export function parseOptions(raw: string | null): IntakeOption[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item): IntakeOption[] => {
      if (typeof item === 'string') return [{ value: item, label: item }]
      if (!item || typeof item !== 'object') return []
      const row = item as Record<string, unknown>
      const value = typeof row.value === 'string' ? row.value : typeof row.label === 'string' ? row.label : ''
      if (!value) return []
      return [{
        value,
        label: typeof row.label === 'string' ? row.label : value,
        description: typeof row.description === 'string' ? row.description : undefined,
        meta: typeof row.meta === 'string' ? row.meta : undefined,
      }]
    })
  } catch {
    return []
  }
}

export function displayValue(value: IntakeValue | undefined): string {
  if (value === undefined || value === null || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}
