export type IntakeValue = string | number | boolean | string[] | null

export interface IntakeQuestion {
  id: string
  service_key: string
  question_key: string
  label: string
  help_text?: string | null
  input_type: string
  options?: string | null
  required: number
  sort_order: number
  step_label?: string | null
  step_order: number
  condition_question_key?: string | null
  condition_operator?: string | null
  condition_value?: string | null
  allow_multiple?: number
}

export type AnswerMap = Record<string, IntakeValue>

export function hasAnswer(value: IntakeValue | undefined): boolean {
  if (value === undefined || value === null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function scalarStrings(value: IntakeValue | undefined): string[] {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value.map(String)
  return [String(value)]
}

export function questionIsVisible(q: IntakeQuestion, answers: AnswerMap): boolean {
  const key = q.condition_question_key
  if (!key) return true
  const op = q.condition_operator || '=='
  const expected = q.condition_value ?? ''
  const actual = scalarStrings(answers[key])

  switch (op) {
    case '==':
      return actual.some((v) => v === expected)
    case '!=':
      return actual.length === 0 || actual.every((v) => v !== expected)
    case 'contains':
      return actual.some((v) => v === expected || v.includes(expected))
    case 'not_contains':
      return actual.every((v) => v !== expected && !v.includes(expected))
    case 'truthy':
      return actual.some((v) => !['', '0', 'false', 'no'].includes(v.toLowerCase()))
    case 'falsy':
      return actual.length === 0 || actual.every((v) => ['', '0', 'false', 'no'].includes(v.toLowerCase()))
    default:
      return true
  }
}

export function visibleQuestions(questions: IntakeQuestion[], answers: AnswerMap): IntakeQuestion[] {
  return questions.filter((q) => questionIsVisible(q, answers))
}

export function missingRequiredQuestions(questions: IntakeQuestion[], answers: AnswerMap): IntakeQuestion[] {
  return visibleQuestions(questions, answers).filter((q) => q.required && !hasAnswer(answers[q.question_key]))
}

export function normalizeAnswer(value: unknown): IntakeValue {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).slice(0, 100)
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  return String(value).trim().slice(0, 12000)
}

export function answerForStorage(value: IntakeValue): string {
  return JSON.stringify(value)
}

export function answerFromStorage(valueJson: string): IntakeValue {
  try {
    return normalizeAnswer(JSON.parse(valueJson))
  } catch {
    return normalizeAnswer(valueJson)
  }
}

export interface IntakeOption {
  value: string
  label: string
  description?: string
  meta?: string
}

export function parseOptions(raw?: string | null): IntakeOption[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((o): IntakeOption | null => {
        if (typeof o === 'string') return { value: o, label: o }
        if (!o || typeof o !== 'object') return null
        const rec = o as Record<string, unknown>
        const value = typeof rec.value === 'string' ? rec.value : typeof rec.label === 'string' ? rec.label : ''
        if (!value) return null
        return {
          value,
          label: typeof rec.label === 'string' ? rec.label : value,
          description: typeof rec.description === 'string' ? rec.description : undefined,
          meta: typeof rec.meta === 'string' ? rec.meta : undefined,
        }
      })
      .filter((o): o is IntakeOption => !!o)
  } catch {
    return []
  }
}

export function displayAnswer(value: IntakeValue): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}
