// Response shapes of the ListingWatch API, as JSON (dates are ISO strings).
// Kept by hand in step with api/src/models; the API is the source of truth.

export const CHECK_OUTCOMES = ['ok', 'broken', 'wrong_destination', 'timeout'] as const
export type CheckOutcome = (typeof CHECK_OUTCOMES)[number]

export interface Restaurant {
  id: string
  name: string
  city: string
  expectedOrderUrl: string
  description: string
  createdAt: string
  updatedAt: string
}

export interface CheckResult {
  id: string
  restaurantId: string
  runId: string
  result: CheckOutcome
  /** Absent when no HTTP response came back (DNS failure, timeout, refused). */
  statusCode?: number
  finalUrl?: string
  latencyMs: number
  /** Short reason for non-ok results, e.g. "ENOTFOUND" or "HTTP 404". */
  error?: string
  checkedAt: string
}

export type RunStatus = 'running' | 'completed' | 'failed'

export interface CheckRun {
  id: string
  startedAt: string
  finishedAt?: string
  trigger: 'manual' | 'schedule'
  status: RunStatus
  restaurantCount: number
  totals: Record<CheckOutcome | 'crashed', number>
}

/** One row of GET /restaurants/status. */
export interface RestaurantStatus extends Restaurant {
  /** null if the restaurant has never been checked. */
  latestCheck: Omit<CheckResult, 'id' | 'restaurantId'> | null
  /** null if the restaurant has never been reviewed. */
  latestReview: { score: number; createdAt: string } | null
}

export const CRITERIA = ['clarity', 'cuisine', 'location', 'call_to_action', 'honesty'] as const
export type Criterion = (typeof CRITERIA)[number]

export interface AiReview {
  id: string
  restaurantId: string
  reviewedDescription: string
  /** 0-100: sum of five criteria scored 0-20 each. */
  score: number
  criteria: Record<Criterion, { score: number; reason: string }>
  issues: { type: string; detail: string }[]
  suggestedDescription: string
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  createdAt: string
}

export interface ImportResult {
  inserted: number
  /** Rows matching an existing restaurant (same name + city), left unchanged. */
  skipped: number
  failed: number
  errors: { line: number; issues: { path: string; message: string }[] }[]
}

export interface Items<T> {
  items: T[]
}
