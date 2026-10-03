import { useLatestReview, useReviewRestaurant } from '../api/queries'
import { CRITERIA, type AiReview, type Criterion, type RestaurantStatus } from '../api/types'
import { formatDateTime } from '../lib/format'
import ErrorMessage from './ErrorMessage'

const CRITERION_LABEL: Record<Criterion, string> = {
  clarity: 'Clarity',
  cuisine: 'Cuisine',
  location: 'Location',
  call_to_action: 'Call to action',
  honesty: 'Honesty',
}
const CRITERION_MAX = 20

// Meter: fill and track are two steps of the same blue ramp.
const METER_FILL = '#2a78d6'
const METER_TRACK = '#cde2fb'

export default function AiReviewCard({ restaurant }: { restaurant: RestaurantStatus }) {
  const review = useLatestReview(restaurant.id)
  const runReview = useReviewRestaurant(restaurant.id)
  const hasDescription = restaurant.description.trim() !== ''

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">AI review</h3>
        <button
          type="button"
          onClick={() => runReview.mutate()}
          disabled={!hasDescription || runReview.isPending}
          title={hasDescription ? 'One Claude Haiku call, about $0.003' : 'Add a description first'}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {runReview.isPending ? 'Reviewing…' : 'Review with AI'}
        </button>
      </div>
      {!hasDescription && <p className="text-sm text-slate-500">This listing has no description to review.</p>}
      {runReview.isPending && <p className="text-sm text-slate-500">Asking Claude. This usually takes a few seconds.</p>}
      {runReview.error && <ErrorMessage error={runReview.error} title="Review failed" />}

      {review.isPending && <div className="h-40 animate-pulse rounded-lg bg-slate-100" aria-label="Loading review" />}
      {review.error && (
        <ErrorMessage error={review.error} title="Could not load the review" onRetry={() => void review.refetch()} />
      )}
      {review.data === null && hasDescription && (
        <p className="text-sm text-slate-500">Not reviewed yet. Click "Review with AI" to score this description.</p>
      )}
      {review.data && <ReviewDetails review={review.data} currentDescription={restaurant.description} />}
    </section>
  )
}

function ReviewDetails({ review, currentDescription }: { review: AiReview; currentDescription: string }) {
  const outdated = review.reviewedDescription !== currentDescription

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 p-4">
      <div>
        <p className="text-3xl font-semibold">
          {review.score}
          <span className="text-base font-normal text-slate-500"> / 100</span>
        </p>
        <p className="text-xs text-slate-500">
          {formatDateTime(review.createdAt)} · {review.model} · {review.inputTokens + review.outputTokens} tokens · $
          {review.costUsd.toFixed(4)}
        </p>
        {outdated && (
          <p className="mt-2 text-sm text-slate-600">
            The description has changed since this review. Run a new one to score the current text.
          </p>
        )}
      </div>

      <ul className="space-y-3">
        {CRITERIA.map((key) => {
          const { score, reason } = review.criteria[key]
          return (
            <li key={key}>
              <div className="flex justify-between text-sm">
                <span className="font-medium">{CRITERION_LABEL[key]}</span>
                <span className="tabular-nums text-slate-600">
                  {score} / {CRITERION_MAX}
                </span>
              </div>
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-full"
                style={{ backgroundColor: METER_TRACK }}
                role="meter"
                aria-label={`${CRITERION_LABEL[key]} score`}
                aria-valuemin={0}
                aria-valuemax={CRITERION_MAX}
                aria-valuenow={score}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(score / CRITERION_MAX) * 100}%`, backgroundColor: METER_FILL }}
                />
              </div>
              <p className="mt-1 text-sm text-slate-600">{reason}</p>
            </li>
          )
        })}
      </ul>

      {review.issues.length > 0 && (
        <div>
          <h4 className="text-sm font-medium">Issues</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {review.issues.map((issue, i) => (
              <li key={i}>
                <span className="font-medium">{issue.type.replaceAll('_', ' ')}:</span> {issue.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <h4 className="text-sm font-medium">Reviewed description</h4>
          <p className="mt-1 rounded-md bg-slate-50 p-3 text-sm whitespace-pre-line text-slate-700">
            {review.reviewedDescription}
          </p>
        </div>
        <div>
          <h4 className="text-sm font-medium">Suggested rewrite</h4>
          <p className="mt-1 rounded-md bg-slate-50 p-3 text-sm whitespace-pre-line text-slate-700">
            {review.suggestedDescription}
          </p>
        </div>
      </div>
    </div>
  )
}
