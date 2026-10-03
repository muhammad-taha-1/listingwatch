import { useRestaurantHistory } from '../api/queries'
import { formatDateTime } from '../lib/format'
import ErrorMessage from './ErrorMessage'
import StatusBadge from './StatusBadge'

export default function CheckHistory({ restaurantId, expectedUrl }: { restaurantId: string; expectedUrl: string }) {
  const history = useRestaurantHistory(restaurantId)

  return (
    <section className="space-y-2">
      <h3 className="font-medium">Check history</h3>
      {history.isPending && <div className="h-24 animate-pulse rounded-lg bg-slate-100" aria-label="Loading history" />}
      {history.error && (
        <ErrorMessage error={history.error} title="Could not load check history" onRetry={() => void history.refetch()} />
      )}
      {history.data?.length === 0 && <p className="text-sm text-slate-500">Not checked yet. It will be included in the next run.</p>}
      {history.data && history.data.length > 0 && (
        <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {history.data.map((check) => (
            <li key={check.id} className="space-y-1 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusBadge status={check.result} />
                <time dateTime={check.checkedAt} className="text-xs text-slate-500">
                  {formatDateTime(check.checkedAt)}
                </time>
              </div>
              <p className="text-xs text-slate-600">
                {/* A Set drops the error when it just repeats the status code ("HTTP 404"). */}
                {[...new Set([check.statusCode && `HTTP ${check.statusCode}`, `${check.latencyMs} ms`, check.error])]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {check.finalUrl && check.finalUrl !== expectedUrl && (
                <p className="text-xs break-all text-slate-600">Landed on {check.finalUrl}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
