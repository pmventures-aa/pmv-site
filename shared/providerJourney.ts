// Provider review journey vocabulary, shared by the server and the HQ/vendor UI
// so the stage list, order, and labels never drift. The journey is deliberately
// generic enough to reuse for other user types later.

export type ReviewStage = 'submitted' | 'in_review' | 'info_requested' | 'decision' | 'approved' | 'declined'

export interface ReviewStageMeta { key: ReviewStage; label: string; blurb: string }

// Ordered pipeline. `info_requested` is a hold state (we asked for something);
// `approved` / `declined` are terminal.
export const REVIEW_STAGES: ReviewStageMeta[] = [
  { key: 'submitted', label: 'Application received', blurb: 'We have your application and it is queued for review.' },
  { key: 'in_review', label: 'Under review', blurb: 'Our team is reviewing your details and credentials.' },
  { key: 'info_requested', label: 'Action needed', blurb: 'We need a little more from you to continue.' },
  { key: 'decision', label: 'Final review', blurb: 'Your application is in final review for a decision.' },
  { key: 'approved', label: 'Approved', blurb: 'Welcome aboard. Your full workspace is unlocking.' },
]

// Progress-bar order (declined is terminal-off-path, not shown as progress).
export const REVIEW_PROGRESS: ReviewStage[] = ['submitted', 'in_review', 'info_requested', 'decision', 'approved']

export function isReviewStage(v: unknown): v is ReviewStage {
  return typeof v === 'string' && ['submitted', 'in_review', 'info_requested', 'decision', 'approved', 'declined'].includes(v)
}

export function reviewStageMeta(stage: ReviewStage): ReviewStageMeta {
  return REVIEW_STAGES.find((s) => s.key === stage) ?? REVIEW_STAGES[0]
}

/** 0..1 progress for the tracker; declined returns 0. */
export function reviewProgress(stage: ReviewStage): number {
  if (stage === 'declined') return 0
  const i = REVIEW_PROGRESS.indexOf(stage)
  return i < 0 ? 0 : i / (REVIEW_PROGRESS.length - 1)
}

export const isTerminalStage = (stage: ReviewStage): boolean => stage === 'approved' || stage === 'declined'

export type FollowUpStatus = 'open' | 'answered' | 'resolved'
export type FollowUpKind = 'info' | 'document'
export interface FollowUpRequest {
  id: string
  kind: FollowUpKind
  title: string
  body: string | null
  status: FollowUpStatus
  responseText: string | null
  createdAt: string
  answeredAt: string | null
  resolvedAt: string | null
}
